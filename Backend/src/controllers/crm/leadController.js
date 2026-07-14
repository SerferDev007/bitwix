import { pool } from '../../config/db.js';
import { scoreLead, isMql, isFreeEmail, MQL_THRESHOLD } from '../../crm/scoring.js';
import { writeCrmAudit } from '../../crm/audit.js';

// Leads have an owner but no account/territory (pre-conversion). A Sales Rep
// sees only their own leads; broader internal roles see all.
function leadScope(actor) {
  return actor.role === 'SALES_REP' ? { sql: 'owner_id = ?', params: [actor.userId] } : { sql: '1=1', params: [] };
}

// Row-level guard for single-lead operations: a Sales Rep may only act on leads
// they own; broader internal roles may act on any. Prevents cross-rep tampering.
function canActOnLead(actor, lead) {
  return actor.role !== 'SALES_REP' || lead.owner_id === actor.userId;
}

function buildSignals(body) {
  const s = { ...(body.signals || {}) };
  if (s.free_email_domain === undefined) s.free_email_domain = isFreeEmail(body.email);
  return s;
}

// POST /api/crm/leads — capture + dedupe on email + score.
export async function createLead(req, res, next) {
  try {
    const { email, first_name, company_name, source = 'WEB_FORM' } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, errors: { email: 'A valid email is required.' } });

    // Dedupe: a person who fills three forms is one lead, not three. Don't leak a
    // lead the caller can't act on (cross-rep enumeration oracle) — reply generic.
    const [[existing]] = await pool.query('SELECT id, status, owner_id FROM leads WHERE email = ?', [email.trim()]);
    if (existing) {
      if (!canActOnLead(req.actor, existing)) return res.status(200).json({ success: true, message: 'Lead received.' });
      return res.status(200).json({ success: true, data: { id: existing.id, deduped: true, status: existing.status }, message: 'Existing lead matched by email.' });
    }

    const signals = buildSignals(req.body);
    const score = scoreLead(signals);
    const status = isMql(score) ? 'MQL' : 'NEW';
    let r;
    try {
      [r] = await pool.query(
        `INSERT INTO leads (email, first_name, company_name, source, score, signals, status, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email.trim(), first_name || null, company_name || null, source, score, JSON.stringify(signals), status, req.actor.userId]
      );
    } catch (err) {
      // Concurrent same-email submission won the race — dedupe gracefully, not 500.
      if (err.code === 'ER_DUP_ENTRY') {
        const [[ex]] = await pool.query('SELECT id, status, owner_id FROM leads WHERE email = ?', [email.trim()]);
        if (ex && !canActOnLead(req.actor, ex)) return res.status(200).json({ success: true, message: 'Lead received.' });
        return res.status(200).json({ success: true, data: { id: ex?.id, deduped: true, status: ex?.status }, message: 'Existing lead matched by email.' });
      }
      throw err;
    }
    await writeCrmAudit(pool, req, { action: 'LEAD_CREATED', entityType: 'lead', entityId: r.insertId, detail: { score, status } });
    res.status(201).json({ success: true, data: { id: r.insertId, score, status } });
  } catch (err) { next(err); }
}

export async function listLeads(req, res, next) {
  try {
    const { sql, params } = leadScope(req.actor);
    const [rows] = await pool.query(`SELECT id, email, first_name, company_name, source, score, status, owner_id, converted_account_id, created_at FROM leads WHERE ${sql} ORDER BY score DESC, id DESC`, params);
    res.json({ success: true, count: rows.length, mqlThreshold: MQL_THRESHOLD, data: rows });
  } catch (err) { next(err); }
}

// POST /api/crm/leads/:id/score — re-score with fresh signals.
export async function rescoreLead(req, res, next) {
  try {
    const [[lead]] = await pool.query('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead || !canActOnLead(req.actor, lead)) return res.status(404).json({ success: false, message: 'Lead not found.' });
    const signals = buildSignals({ email: lead.email, signals: req.body?.signals });
    const score = scoreLead(signals);
    // Auto-promote to MQL when the score crosses the threshold (marketing→sales handoff rule).
    const status = lead.status === 'NEW' && isMql(score) ? 'MQL' : lead.status;
    // Guard the write against a concurrently-committed conversion (TOCTOU).
    const [u] = await pool.query("UPDATE leads SET score = ?, signals = ?, status = ? WHERE id = ? AND status <> 'CONVERTED'", [score, JSON.stringify(signals), status, lead.id]);
    if (u.affectedRows === 0) return res.status(409).json({ success: false, message: 'Lead already converted.' });
    res.json({ success: true, data: { score, status } });
  } catch (err) { next(err); }
}

// PATCH /api/crm/leads/:id/status — funnel transitions with rules.
export async function updateLeadStatus(req, res, next) {
  try {
    const { status, reason } = req.body || {};
    const [[lead]] = await pool.query('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead || !canActOnLead(req.actor, lead)) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (lead.status === 'CONVERTED') return res.status(409).json({ success: false, message: 'Lead already converted.' });

    const allowed = ['WORKING', 'MQL', 'SQL', 'DISQUALIFIED'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid target status (use convert to reach CONVERTED).' });
    if (status === 'MQL' && !isMql(lead.score)) return res.status(422).json({ success: false, message: `Score ${lead.score} is below the MQL threshold (${MQL_THRESHOLD}).` });
    if (status === 'SQL' && !['WORKING', 'MQL'].includes(lead.status)) return res.status(422).json({ success: false, message: 'Only a WORKING or MQL lead can be accepted as SQL.' });
    if (status === 'DISQUALIFIED' && !reason) return res.status(422).json({ success: false, message: 'A reason is required to disqualify a lead.' });

    const [u] = await pool.query("UPDATE leads SET status = ?, reject_reason = ? WHERE id = ? AND status <> 'CONVERTED'", [status, status === 'DISQUALIFIED' ? reason : lead.reject_reason, lead.id]);
    if (u.affectedRows === 0) return res.status(409).json({ success: false, message: 'Lead already converted.' });
    await writeCrmAudit(pool, req, { action: 'LEAD_STATUS_CHANGED', entityType: 'lead', entityId: lead.id, detail: { from: lead.status, to: status } });
    res.json({ success: true, message: `Lead → ${status}.` });
  } catch (err) { next(err); }
}

// POST /api/crm/leads/:id/convert — create Account + Contact + Opportunity in one txn.
export async function convertLead(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { amount = 0, expected_close } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0 || amt > 999999999999.99) { conn.release(); return res.status(422).json({ success: false, message: 'amount must be a non-negative number within range.' }); }
    await conn.beginTransaction();
    // Lock the lead row so two concurrent converts can't both create an account
    // graph (the CONVERTED guard must hold across the whole conversion).
    const [[lead]] = await conn.query('SELECT * FROM leads WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!lead || !canActOnLead(req.actor, lead)) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Lead not found.' }); }
    if (lead.status === 'CONVERTED') { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, message: 'Lead already converted.' }); }
    // Only a qualified lead converts — a DISQUALIFIED or raw NEW lead must be
    // worked/qualified first (business-rule gate).
    if (!['WORKING', 'MQL', 'SQL'].includes(lead.status)) { await conn.rollback(); conn.release(); return res.status(422).json({ success: false, message: `A ${lead.status} lead cannot be converted; qualify it first.` }); }

    const [acc] = await conn.query(
      `INSERT INTO accounts (name, owner_id, status, portal_tier) VALUES (?, ?, 'PROSPECT', 'NONE')`,
      [lead.company_name || `${lead.first_name || 'New'} account`, req.actor.userId]
    );
    const accountId = acc.insertId;
    const [nameParts] = [(lead.first_name || 'Lead').split(' ')];
    await conn.query(
      'INSERT INTO contacts (account_id, first_name, last_name, email, is_primary) VALUES (?, ?, ?, ?, TRUE)',
      [accountId, nameParts[0] || 'Lead', nameParts.slice(1).join(' ') || 'Contact', lead.email]
    );
    const [opp] = await conn.query(
      `INSERT INTO opportunities (account_id, name, stage, amount, probability, expected_close, owner_id)
       VALUES (?, ?, 'QUALIFICATION', ?, 10, ?, ?)`,
      [accountId, `${lead.company_name || 'New'} opportunity`, amt, expected_close || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), req.actor.userId]
    );
    // The lead row is never deleted — campaign attribution survives conversion.
    await conn.query("UPDATE leads SET status = 'CONVERTED', converted_account_id = ? WHERE id = ?", [accountId, lead.id]);
    await writeCrmAudit(conn, req, { action: 'LEAD_CONVERTED', entityType: 'lead', entityId: lead.id, accountId, detail: { opportunityId: opp.insertId } });
    await conn.commit();
    conn.release();
    res.status(201).json({ success: true, data: { accountId, opportunityId: opp.insertId } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}
