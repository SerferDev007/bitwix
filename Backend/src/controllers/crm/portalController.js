import { pool } from '../../config/db.js';
import { hashPassword, verifyPassword, enforcePasswordPolicy, sha256 } from '../../hr/password.js';
import { signExternalToken } from '../../crm/token.js';
import { EXTERNAL_MATRIX, stripInternalFields } from '../../crm/rbac.js';
import { writeCrmAudit } from '../../crm/audit.js';

const SLA_HOURS = { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 120 };

// --- Portal auth ---
export async function portalLogin(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const [[pu]] = await pool.query(
      `SELECT p.*, a.status AS account_status FROM crm_portal_users p JOIN accounts a ON a.id = p.account_id WHERE p.email = ?`,
      [email || '']
    );
    const ok = verifyPassword(password || '', pu?.password_hash || null);
    if (!pu || !ok) {
      if (pu) await pool.query('UPDATE crm_portal_users SET failed_attempts = failed_attempts + 1 WHERE id = ?', [pu.id]);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (pu.status !== 'ACTIVE') return res.status(403).json({ success: false, message: 'Access not active' });
    if (!['ACTIVE', 'PROSPECT'].includes(pu.account_status)) return res.status(403).json({ success: false, message: 'Account inactive' });
    await pool.query('UPDATE crm_portal_users SET failed_attempts = 0, last_login_at = NOW() WHERE id = ?', [pu.id]);
    res.json({
      success: true,
      access_token: signExternalToken({ portalUserId: pu.id, accountId: pu.account_id, role: pu.role, tokenVersion: pu.token_version }),
      user: { id: pu.id, email: pu.email, role: pu.role, plane: 'EXTERNAL' }, // note: accountId NOT echoed as an input handle
    });
  } catch (err) { next(err); }
}

export async function portalActivate(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { token, new_password } = req.body || {};
    const [[inv]] = await conn.query(
      'SELECT * FROM crm_invitations WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
      [sha256(token || '')]
    );
    if (!inv) { conn.release(); return res.status(400).json({ success: false, message: 'Invalid or expired activation link' }); }
    try { enforcePasswordPolicy(new_password); } catch (e) { conn.release(); return res.status(422).json({ success: false, message: e.message }); }

    await conn.beginTransaction();
    await conn.query("UPDATE crm_portal_users SET password_hash = ?, status = 'ACTIVE' WHERE id = ?", [hashPassword(new_password), inv.portal_user_id]);
    await conn.query('UPDATE crm_invitations SET used_at = NOW() WHERE id = ?', [inv.id]);
    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Portal account activated.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}

export async function portalMe(req, res, next) {
  try {
    // Only the caller's own account — bounded by the session, never a parameter.
    const [[acct]] = await pool.query('SELECT id, name, segment, status, portal_tier FROM accounts WHERE id = ?', [req.actor.accountId]);
    res.json({
      success: true,
      actor: { role: req.actor.role, plane: 'EXTERNAL' },
      account: stripInternalFields(acct), // health_score etc. never exposed
      permissions: [...(EXTERNAL_MATRIX[req.actor.role] || [])],
    });
  } catch (err) { next(err); }
}

export async function portalLogout(req, res, next) {
  try {
    await pool.query('UPDATE crm_portal_users SET token_version = token_version + 1 WHERE id = ?', [req.actor.portalUserId]);
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) { next(err); }
}

// --- Tickets (tenant-isolated) ---
export async function createTicket(req, res, next) {
  try {
    const { subject, body, priority = 'MEDIUM' } = req.body || {};
    if (!subject || !subject.trim()) return res.status(400).json({ success: false, message: 'Subject is required.' });
    if (!(priority in SLA_HOURS)) return res.status(400).json({ success: false, message: 'Invalid priority.' });
    // account_id comes from the SESSION, never from the request body.
    const [r] = await pool.query(
      `INSERT INTO tickets (account_id, contact_id, subject, body, priority, status, sla_due_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [req.actor.accountId, req.actor.contactId, subject.trim(), body || null, priority, SLA_HOURS[priority]]
    );
    await writeCrmAudit(pool, req, { action: 'TICKET_CREATED', entityType: 'ticket', entityId: r.insertId });
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
}

export async function listMyTickets(req, res, next) {
  try {
    // CLIENT_ADMIN (ticket.read.account) sees all account tickets; others see own.
    const seesAll = EXTERNAL_MATRIX[req.actor.role]?.has('ticket.read.account');
    const params = [req.actor.accountId];
    let sql = 'account_id = ?'; // the tenant boundary — always present
    if (!seesAll) { sql += ' AND contact_id = ?'; params.push(req.actor.contactId); }
    const [rows] = await pool.query(
      `SELECT id, subject, priority, status, sla_due_at, resolved_at, created_at FROM tickets WHERE ${sql} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

// --- Invoices (tenant-isolated; account from the session, never a parameter) ---
export async function listInvoices(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, number, amount, currency, status, issued_at, due_date, paid_at
         FROM invoices WHERE account_id = ? ORDER BY issued_at DESC`,
      [req.actor.accountId] // the tenant boundary
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

// --- Consent (self-service, append-only) ---
export async function getConsent(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT ce.channel, ce.action, ce.occurred_at
         FROM consent_events ce
         JOIN (SELECT channel, MAX(occurred_at) AS mx FROM consent_events WHERE contact_id = ? GROUP BY channel) latest
           ON latest.channel = ce.channel AND latest.mx = ce.occurred_at
        WHERE ce.contact_id = ?`,
      [req.actor.contactId, req.actor.contactId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

export async function setConsent(req, res, next) {
  try {
    const { channel = 'EMAIL', action } = req.body || {};
    if (!['EMAIL', 'SMS', 'PHONE'].includes(channel) || !['GRANTED', 'WITHDRAWN'].includes(action)) {
      return res.status(400).json({ success: false, message: 'channel and action (GRANTED|WITHDRAWN) required.' });
    }
    // Append a new event — never update/delete existing consent history.
    await pool.query(
      'INSERT INTO consent_events (contact_id, channel, action, basis, evidence) VALUES (?, ?, ?, ?, ?)',
      [req.actor.contactId, channel, action, 'PORTAL_PREFERENCE', JSON.stringify({ ip: req.ip, at: new Date().toISOString() })]
    );
    res.json({ success: true, message: `Consent ${action} for ${channel}.` });
  } catch (err) { next(err); }
}

// --- Delegated invite request (Client Admin only, vendor-approved) ---
export async function requestPortalUser(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { first_name, last_name, email, role = 'CLIENT_USER' } = req.body || {};
    if (!first_name || !last_name || !email) { conn.release(); return res.status(400).json({ success: false, message: 'first_name, last_name, email required.' }); }
    if (!['CLIENT_USER', 'CLIENT_FINANCE'].includes(role)) { conn.release(); return res.status(400).json({ success: false, message: 'A Client Admin may request CLIENT_USER or CLIENT_FINANCE only.' }); }

    // A Client Admin may add users ONLY to their own account (the session's account).
    const [[acct]] = await conn.query('SELECT portal_tier FROM accounts WHERE id = ?', [req.actor.accountId]);
    if (role === 'CLIENT_FINANCE' && acct.portal_tier !== 'FULL') { conn.release(); return res.status(422).json({ success: false, message: 'This account cannot add finance users.' }); }

    await conn.beginTransaction();
    const [c] = await conn.query(
      'INSERT INTO contacts (account_id, first_name, last_name, email, status) VALUES (?, ?, ?, ?, \'ACTIVE\')',
      [req.actor.accountId, first_name.trim(), last_name.trim(), email.trim()]
    );
    // Enters PENDING_VENDOR_APPROVAL — released only by an internal approver.
    await conn.query(
      `INSERT INTO crm_portal_users (contact_id, account_id, email, role, status, invited_by)
       VALUES (?, ?, ?, ?, 'PENDING_VENDOR_APPROVAL', NULL)`,
      [c.insertId, req.actor.accountId, email.trim(), role]
    );
    await writeCrmAudit(conn, req, { action: 'PORTAL_USER_REQUESTED', entityType: 'portal_user', accountId: req.actor.accountId, detail: { email, role } });
    await conn.commit();
    conn.release();
    res.status(202).json({ success: true, message: 'Request submitted for vendor approval.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That email is already a contact or portal user.' });
    next(err);
  }
}
