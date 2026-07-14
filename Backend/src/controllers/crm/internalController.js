import { pool } from '../../config/db.js';
import { hashPassword, verifyPassword, generateToken } from '../../hr/password.js';
import { signInternalToken } from '../../crm/token.js';
import { INTERNAL_MATRIX, scopeToSql } from '../../crm/rbac.js';
import { writeCrmAudit } from '../../crm/audit.js';

const STAGE_PROB = { QUALIFICATION: 10, DISCOVERY: 25, PROPOSAL: 50, NEGOTIATION: 75, CLOSED_WON: 100, CLOSED_LOST: 0 };
const OPEN_STAGES = ['QUALIFICATION', 'DISCOVERY', 'PROPOSAL', 'NEGOTIATION'];

// --- Auth ---
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const [[user]] = await pool.query('SELECT * FROM crm_users WHERE email = ?', [email || '']);
    const ok = verifyPassword(password || '', user?.password_hash || null);
    if (!user || !ok) {
      if (user) await pool.query('UPDATE crm_users SET failed_attempts = failed_attempts + 1 WHERE id = ?', [user.id]);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (user.status !== 'ACTIVE') return res.status(403).json({ success: false, message: 'Account not active' });
    await pool.query('UPDATE crm_users SET failed_attempts = 0 WHERE id = ?', [user.id]);
    res.json({
      success: true,
      access_token: signInternalToken({ userId: user.id, role: user.role, tokenVersion: user.token_version }),
      user: { id: user.id, email: user.email, role: user.role, plane: 'INTERNAL' },
    });
  } catch (err) { next(err); }
}

export async function me(req, res) {
  res.json({ success: true, actor: req.actor, permissions: [...(INTERNAL_MATRIX[req.actor.role] || [])] });
}

export async function logout(req, res, next) {
  try {
    await pool.query('UPDATE crm_users SET token_version = token_version + 1 WHERE id = ?', [req.actor.userId]);
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) { next(err); }
}

// --- Accounts & contacts ---
export async function createAccount(req, res, next) {
  try {
    const { name, domain, industry, segment, territory_id, portal_tier } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, errors: { name: 'Name is required.' } });
    const [r] = await pool.query(
      `INSERT INTO accounts (name, domain, industry, segment, territory_id, owner_id, portal_tier, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PROSPECT')`,
      [name.trim(), domain || null, industry || null, segment || null, territory_id || null, req.actor.userId, portal_tier || 'NONE']
    );
    await writeCrmAudit(pool, req, { action: 'ACCOUNT_CREATED', entityType: 'account', entityId: r.insertId, accountId: r.insertId });
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
}

export async function listAccounts(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope);
    const [rows] = await pool.query(
      `SELECT id, name, domain, segment, status, portal_tier, owner_id, account_manager_id, territory_id, health_score
         FROM accounts WHERE ${sql} ORDER BY id DESC`,
      params
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

async function accountInScope(actor, scope, accountId) {
  const { sql, params } = scopeToSql(scope);
  const [[row]] = await pool.query(`SELECT id FROM accounts WHERE id = ? AND (${sql})`, [accountId, ...params]);
  return !!row;
}

export async function createContact(req, res, next) {
  try {
    const { account_id, first_name, last_name, email, title, is_primary } = req.body || {};
    if (!account_id || !first_name || !last_name || !email) return res.status(400).json({ success: false, message: 'account_id, first_name, last_name, email are required.' });
    if (!(await accountInScope(req.actor, req.scope, account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });
    const [r] = await pool.query(
      'INSERT INTO contacts (account_id, first_name, last_name, email, title, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
      [account_id, first_name.trim(), last_name.trim(), email.trim(), title || null, is_primary ? 1 : 0]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Contact email already exists for this account.' });
    next(err);
  }
}

export async function getAccount(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope);
    const [[row]] = await pool.query(`SELECT * FROM accounts WHERE id = ? AND (${sql})`, [req.params.id, ...params]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' }); // 404 outside scope — no oracle
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
}

export async function listAccountContacts(req, res, next) {
  try {
    if (!(await accountInScope(req.actor, req.scope, req.params.id))) return res.status(404).json({ success: false, message: 'Not found' });
    const [rows] = await pool.query('SELECT id, first_name, last_name, email, title, is_primary, status FROM contacts WHERE account_id = ? ORDER BY id', [req.params.id]);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

export async function listAccountPortalUsers(req, res, next) {
  try {
    if (!(await accountInScope(req.actor, req.scope, req.params.id))) return res.status(404).json({ success: false, message: 'Not found' });
    const [rows] = await pool.query(
      `SELECT pu.id, pu.email, pu.role, pu.status, c.first_name, c.last_name
         FROM crm_portal_users pu JOIN contacts c ON c.id = pu.contact_id
        WHERE pu.account_id = ? ORDER BY pu.id`,
      [req.params.id]
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

export async function listOpportunities(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope, { idCol: 'a.id', ownerCol: 'o.owner_id', accountManagerCol: 'a.account_manager_id', territoryCol: 'a.territory_id', acctCol: 'o.account_id' });
    const filters = [sql];
    const p = [...params];
    if (req.query.account_id) { filters.push('o.account_id = ?'); p.push(req.query.account_id); }
    const [rows] = await pool.query(
      `SELECT o.*, a.name AS account_name FROM opportunities o JOIN accounts a ON a.id = o.account_id
        WHERE ${filters.join(' AND ')} ORDER BY o.expected_close ASC`,
      p
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

// --- Portal provisioning (vendor-controlled) ---
export async function provisionPortalUser(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { contact_id, role = 'CLIENT_USER' } = req.body || {};
    if (!['CLIENT_ADMIN', 'CLIENT_USER', 'CLIENT_FINANCE'].includes(role)) { conn.release(); return res.status(400).json({ success: false, message: 'Invalid portal role.' }); }

    const [[contact]] = await conn.query('SELECT c.*, a.portal_tier FROM contacts c JOIN accounts a ON a.id = c.account_id WHERE c.id = ?', [contact_id]);
    if (!contact) { conn.release(); return res.status(404).json({ success: false, message: 'Contact not found.' }); }
    if (!(await accountInScope(req.actor, req.scope, contact.account_id))) { conn.release(); return res.status(403).json({ success: false, message: 'Account outside your scope.' }); }
    if (contact.portal_tier === 'NONE') { conn.release(); return res.status(422).json({ success: false, message: 'This account has no portal tier enabled.' }); }
    if (role === 'CLIENT_FINANCE' && contact.portal_tier !== 'FULL') { conn.release(); return res.status(422).json({ success: false, message: 'Financial visibility requires the FULL portal tier.' }); }

    await conn.beginTransaction();
    const [pu] = await conn.query(
      `INSERT INTO crm_portal_users (contact_id, account_id, email, password_hash, role, status, invited_by)
       VALUES (?, ?, ?, NULL, ?, 'PENDING_ACTIVATION', ?)`,
      [contact.id, contact.account_id, contact.email, role, req.actor.userId]
    );
    const { raw, hash } = generateToken();
    await conn.query('INSERT INTO crm_invitations (portal_user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))', [pu.insertId, hash]);
    await writeCrmAudit(conn, req, { action: 'PORTAL_ACCESS_GRANTED', entityType: 'portal_user', entityId: pu.insertId, accountId: contact.account_id, detail: { role } });
    await conn.commit();
    conn.release();
    res.status(201).json({ success: true, data: { portalUserId: pu.insertId, activation: { token: raw, url: `/portal/activate?token=${raw}` } } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Portal login already exists for this contact/email.' });
    next(err);
  }
}

export async function revokePortalUser(req, res, next) {
  try {
    const [[pu]] = await pool.query('SELECT * FROM crm_portal_users WHERE id = ?', [req.params.id]);
    if (!pu) return res.status(404).json({ success: false, message: 'Portal user not found.' });
    if (!(await accountInScope(req.actor, req.scope, pu.account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });
    await pool.query("UPDATE crm_portal_users SET status = 'REVOKED', token_version = token_version + 1 WHERE id = ?", [pu.id]);
    // Kill any still-pending activation token so a revoked user can't re-activate.
    await pool.query('UPDATE crm_invitations SET used_at = NOW() WHERE portal_user_id = ? AND used_at IS NULL', [pu.id]);
    await writeCrmAudit(pool, req, { action: 'PORTAL_ACCESS_REVOKED', entityType: 'portal_user', entityId: pu.id, accountId: pu.account_id });
    res.json({ success: true, message: 'Portal access revoked; sessions killed.' });
  } catch (err) { next(err); }
}

// Approve a delegated (client-admin-initiated) portal request. Domain must match.
export async function approvePortalRequest(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const [[pu]] = await conn.query('SELECT p.*, a.domain FROM crm_portal_users p JOIN accounts a ON a.id = p.account_id WHERE p.id = ?', [req.params.id]);
    if (!pu) { conn.release(); return res.status(404).json({ success: false, message: 'Request not found.' }); }
    if (pu.status !== 'PENDING_VENDOR_APPROVAL') { conn.release(); return res.status(409).json({ success: false, message: `Not pending approval (is ${pu.status}).` }); }
    // Domain check: the invited email must match the account's registered domain.
    if (pu.domain && !pu.email.toLowerCase().endsWith('@' + pu.domain.toLowerCase())) {
      conn.release();
      return res.status(422).json({ success: false, message: `Email domain does not match the account domain (${pu.domain}).` });
    }
    await conn.beginTransaction();
    const { raw, hash } = generateToken();
    await conn.query("UPDATE crm_portal_users SET status = 'PENDING_ACTIVATION', approved_by = ? WHERE id = ?", [req.actor.userId, pu.id]);
    await conn.query('INSERT INTO crm_invitations (portal_user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))', [pu.id, hash]);
    await writeCrmAudit(conn, req, { action: 'PORTAL_REQUEST_APPROVED', entityType: 'portal_user', entityId: pu.id, accountId: pu.account_id });
    await conn.commit();
    conn.release();
    res.json({ success: true, data: { activation: { token: raw } } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}

// --- Pipeline ---
export async function createOpportunity(req, res, next) {
  try {
    const { account_id, name, amount, expected_close } = req.body || {};
    if (!account_id || !name || amount == null || !expected_close) return res.status(400).json({ success: false, message: 'account_id, name, amount, expected_close are required.' });
    if (!(await accountInScope(req.actor, req.scope, account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });
    const [r] = await pool.query(
      `INSERT INTO opportunities (account_id, name, stage, amount, probability, expected_close, owner_id)
       VALUES (?, ?, 'QUALIFICATION', ?, 10, ?, ?)`,
      [account_id, name.trim(), Number(amount), expected_close, req.actor.userId]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
}

export async function updateOpportunityStage(req, res, next) {
  try {
    const { stage, lost_reason } = req.body || {};
    const [[opp]] = await pool.query('SELECT * FROM opportunities WHERE id = ?', [req.params.id]);
    if (!opp) return res.status(404).json({ success: false, message: 'Opportunity not found.' });
    if (!(await accountInScope(req.actor, req.scope, opp.account_id)) && opp.owner_id !== req.actor.userId) return res.status(403).json({ success: false, message: 'Outside your scope.' });
    if (!(stage in STAGE_PROB)) return res.status(400).json({ success: false, message: 'Invalid stage.' });
    if (['CLOSED_WON', 'CLOSED_LOST'].includes(opp.stage)) return res.status(409).json({ success: false, message: 'Opportunity is closed; immutable.' });

    if (stage === 'CLOSED_LOST' && !lost_reason) return res.status(422).json({ success: false, message: 'lost_reason is mandatory to mark a deal lost.' });
    // No skipping stages forward among the open stages.
    if (OPEN_STAGES.includes(stage) && OPEN_STAGES.includes(opp.stage)) {
      if (OPEN_STAGES.indexOf(stage) > OPEN_STAGES.indexOf(opp.stage) + 1) {
        return res.status(422).json({ success: false, message: 'Cannot skip pipeline stages forward.' });
      }
    }
    const closing = ['CLOSED_WON', 'CLOSED_LOST'].includes(stage);
    await pool.query(
      'UPDATE opportunities SET stage = ?, probability = ?, lost_reason = ?, closed_at = ? WHERE id = ?',
      [stage, STAGE_PROB[stage], stage === 'CLOSED_LOST' ? lost_reason : null, closing ? new Date() : null, opp.id]
    );
    await writeCrmAudit(pool, req, { action: 'OPPORTUNITY_STAGE_CHANGED', entityType: 'opportunity', entityId: opp.id, accountId: opp.account_id, detail: { from: opp.stage, to: stage } });
    res.json({ success: true, message: `Stage set to ${stage}.` });
  } catch (err) { next(err); }
}

// Weighted pipeline forecast (Section 8.3), scoped.
export async function forecast(req, res, next) {
  try {
    let where = "o.stage NOT IN ('CLOSED_WON','CLOSED_LOST')";
    const params = [];
    if (req.actor.role === 'SALES_REP') { where += ' AND o.owner_id = ?'; params.push(req.actor.userId); }
    else if (req.actor.role === 'SALES_MANAGER' && req.actor.territories.length) {
      where += ` AND a.territory_id IN (${req.actor.territories.map(() => '?').join(',')})`;
      params.push(...req.actor.territories);
    } // SUPER_ADMIN → all
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(o.expected_close, '%Y-%m') AS period,
              SUM(o.amount) AS pipeline_total,
              ROUND(SUM(o.amount * o.probability / 100.0), 2) AS weighted_forecast,
              COUNT(*) AS deal_count
         FROM opportunities o JOIN accounts a ON a.id = o.account_id
        WHERE ${where}
        GROUP BY period ORDER BY period`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

// --- Tickets (internal view) ---
export async function listTicketsInternal(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope, { idCol: 'a.id', ownerCol: 'a.owner_id', accountManagerCol: 'a.account_manager_id', territoryCol: 'a.territory_id', acctCol: 't.account_id' });
    const [rows] = await pool.query(
      `SELECT t.*, a.name AS account_name FROM tickets t JOIN accounts a ON a.id = t.account_id WHERE ${sql} ORDER BY t.created_at DESC`,
      params
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

export async function resolveTicket(req, res, next) {
  try {
    const [[t]] = await pool.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ success: false, message: 'Ticket not found.' });
    await pool.query("UPDATE tickets SET status = 'RESOLVED', resolved_at = NOW(), assignee_id = ? WHERE id = ?", [req.actor.userId, t.id]);
    await writeCrmAudit(pool, req, { action: 'TICKET_RESOLVED', entityType: 'ticket', entityId: t.id, accountId: t.account_id });
    res.json({ success: true, message: 'Ticket resolved.' });
  } catch (err) { next(err); }
}

export async function readAudit(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [rows] = await pool.query('SELECT * FROM crm_audit_log ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}
