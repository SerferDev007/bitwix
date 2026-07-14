import { pool } from '../../config/db.js';
import { scopeToSql } from '../../crm/rbac.js';
import { writeCrmAudit } from '../../crm/audit.js';

const DISCOUNT_THRESHOLD = Number(process.env.CRM_DISCOUNT_THRESHOLD) || 15; // percent

async function accountInScope(actor, scope, accountId) {
  const { sql, params } = scopeToSql(scope);
  const [[row]] = await pool.query(`SELECT id FROM accounts WHERE id = ? AND (${sql})`, [accountId, ...params]);
  return !!row;
}

function computeTotals(lineItems, discountPct) {
  const subtotal = (lineItems || []).reduce((s, li) => s + Number(li.qty || 0) * Number(li.unit_price || 0), 0);
  const total = subtotal * (1 - Number(discountPct || 0) / 100);
  return { subtotal: round(subtotal), total: round(total) };
}
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// POST /api/crm/quotes — freeze line items + prices; route by discount threshold.
export async function createQuote(req, res, next) {
  try {
    const { opportunity_id, line_items, discount_pct = 0 } = req.body || {};
    if (!opportunity_id || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ success: false, message: 'opportunity_id and a non-empty line_items array are required.' });
    }
    const [[opp]] = await pool.query('SELECT id, account_id FROM opportunities WHERE id = ?', [opportunity_id]);
    if (!opp) return res.status(404).json({ success: false, message: 'Opportunity not found.' });
    if (!(await accountInScope(req.actor, req.scope, opp.account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });

    const disc = Number(discount_pct) || 0;
    const { subtotal, total } = computeTotals(line_items, disc);
    // Over-threshold discounts need Sales Manager approval before they can be sent.
    const status = disc > DISCOUNT_THRESHOLD ? 'PENDING_APPROVAL' : 'APPROVED';

    const [[{ maxV }]] = await pool.query('SELECT COALESCE(MAX(version),0) AS maxV FROM quotes WHERE opportunity_id = ?', [opportunity_id]);
    const [r] = await pool.query(
      `INSERT INTO quotes (opportunity_id, account_id, version, line_items, subtotal, discount_pct, total, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [opportunity_id, opp.account_id, maxV + 1, JSON.stringify(line_items), subtotal, disc, total, status, req.actor.userId]
    );
    await writeCrmAudit(pool, req, { action: 'QUOTE_CREATED', entityType: 'quote', entityId: r.insertId, accountId: opp.account_id, detail: { discount_pct: disc, status } });
    res.status(201).json({ success: true, data: { id: r.insertId, version: maxV + 1, subtotal, total, status, needsApproval: status === 'PENDING_APPROVAL' } });
  } catch (err) { next(err); }
}

export async function listQuotes(req, res, next) {
  try {
    if (!req.query.opportunity_id) return res.status(400).json({ success: false, message: 'opportunity_id query param required.' });
    const [[opp]] = await pool.query('SELECT account_id FROM opportunities WHERE id = ?', [req.query.opportunity_id]);
    if (!opp || !(await accountInScope(req.actor, req.scope, opp.account_id))) return res.status(404).json({ success: false, message: 'Not found' });
    const [rows] = await pool.query('SELECT * FROM quotes WHERE opportunity_id = ? ORDER BY version DESC', [req.query.opportunity_id]);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

// POST /api/crm/quotes/:id/approve — discount.approve (Sales Manager). BR-05: not your own.
export async function approveQuote(req, res, next) {
  try {
    const [[q]] = await pool.query('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!q) return res.status(404).json({ success: false, message: 'Quote not found.' });
    if (q.status !== 'PENDING_APPROVAL') return res.status(409).json({ success: false, message: `Quote is ${q.status}; nothing to approve.` });
    if (q.created_by === req.actor.userId) return res.status(403).json({ success: false, message: 'You cannot approve your own quote (BR-05).' });

    await pool.query("UPDATE quotes SET status = 'APPROVED', approved_by = ? WHERE id = ?", [req.actor.userId, q.id]);
    await writeCrmAudit(pool, req, { action: 'QUOTE_APPROVED', entityType: 'quote', entityId: q.id, accountId: q.account_id, detail: { discount_pct: q.discount_pct } });
    res.json({ success: true, message: 'Quote approved.' });
  } catch (err) { next(err); }
}

// POST /api/crm/quotes/:id/send — the rule an eager rep cannot bypass (BR-03).
export async function sendQuote(req, res, next) {
  try {
    const [[q]] = await pool.query('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!q) return res.status(404).json({ success: false, message: 'Quote not found.' });
    if (!(await accountInScope(req.actor, req.scope, q.account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });
    if (q.status !== 'APPROVED') return res.status(403).json({ success: false, message: 'Quote must be approved before sending.' });
    if (Number(q.discount_pct) > DISCOUNT_THRESHOLD && !q.approved_by) return res.status(403).json({ success: false, message: 'Discount exceeds threshold: manager approval required.' });

    await pool.query("UPDATE quotes SET status = 'SENT', sent_at = NOW() WHERE id = ?", [q.id]);
    await writeCrmAudit(pool, req, { action: 'QUOTE_SENT', entityType: 'quote', entityId: q.id, accountId: q.account_id, detail: { discount_pct: q.discount_pct } });
    res.json({ success: true, message: 'Quote sent.' });
  } catch (err) { next(err); }
}

// POST /api/crm/quotes/:id/revise — new version; the sent one is preserved verbatim.
export async function reviseQuote(req, res, next) {
  try {
    const [[q]] = await pool.query('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!q) return res.status(404).json({ success: false, message: 'Quote not found.' });
    if (!(await accountInScope(req.actor, req.scope, q.account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });

    const line_items = req.body?.line_items || JSON.parse(typeof q.line_items === 'string' ? q.line_items : JSON.stringify(q.line_items));
    const disc = req.body?.discount_pct != null ? Number(req.body.discount_pct) : Number(q.discount_pct);
    const { subtotal, total } = computeTotals(line_items, disc);
    const status = disc > DISCOUNT_THRESHOLD ? 'PENDING_APPROVAL' : 'APPROVED';
    const [[{ maxV }]] = await pool.query('SELECT COALESCE(MAX(version),0) AS maxV FROM quotes WHERE opportunity_id = ?', [q.opportunity_id]);
    const [r] = await pool.query(
      `INSERT INTO quotes (opportunity_id, account_id, version, line_items, subtotal, discount_pct, total, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [q.opportunity_id, q.account_id, maxV + 1, JSON.stringify(line_items), subtotal, disc, total, status, req.actor.userId]
    );
    res.status(201).json({ success: true, data: { id: r.insertId, version: maxV + 1, status } });
  } catch (err) { next(err); }
}
