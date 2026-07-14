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

// Reject out-of-range money inputs: a negative discount would inflate the total
// AND (being ≤ threshold) auto-approve, bypassing the approval gate entirely.
const MAX_MONEY = 999999999999.99; // DECIMAL(14,2) ceiling
function validateQuoteInput(lineItems, discountPct) {
  const disc = Number(discountPct);
  if (!Number.isFinite(disc) || disc < 0 || disc > 100) return 'discount_pct must be a number between 0 and 100.';
  let subtotal = 0;
  for (const li of lineItems) {
    const qty = Number(li.qty);
    const price = Number(li.unit_price);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(price) || price < 0) {
      return 'Each line item needs a non-negative qty and unit_price.';
    }
    // Upper bounds so subtotal/total can't overflow the DECIMAL(14,2) column.
    if (qty > 1_000_000 || price > MAX_MONEY) return 'A line item qty or unit_price is unreasonably large.';
    subtotal += qty * price;
    if (subtotal > MAX_MONEY) return 'The quote total exceeds the maximum allowed amount.';
  }
  return null;
}

// Assign the next version and insert, retrying on the (opportunity_id, version)
// unique-key collision that concurrent creates would otherwise 500 on.
async function insertQuoteVersion(q) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [[{ maxV }]] = await pool.query('SELECT COALESCE(MAX(version),0) AS maxV FROM quotes WHERE opportunity_id = ?', [q.opportunity_id]);
    try {
      const [r] = await pool.query(
        `INSERT INTO quotes (opportunity_id, account_id, version, line_items, subtotal, discount_pct, total, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.opportunity_id, q.account_id, maxV + 1, JSON.stringify(q.line_items), q.subtotal, q.discount_pct, q.total, q.status, q.created_by]
      );
      return { id: r.insertId, version: maxV + 1 };
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' && attempt < 4) continue; // lost the version race — recompute + retry
      throw err;
    }
  }
  throw new Error('Could not assign a quote version.');
}

// POST /api/crm/quotes — freeze line items + prices; route by discount threshold.
export async function createQuote(req, res, next) {
  try {
    const { opportunity_id, line_items, discount_pct = 0 } = req.body || {};
    if (!opportunity_id || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ success: false, message: 'opportunity_id and a non-empty line_items array are required.' });
    }
    const validationError = validateQuoteInput(line_items, discount_pct);
    if (validationError) return res.status(422).json({ success: false, message: validationError });

    const [[opp]] = await pool.query('SELECT id, account_id FROM opportunities WHERE id = ?', [opportunity_id]);
    if (!opp) return res.status(404).json({ success: false, message: 'Opportunity not found.' });
    if (!(await accountInScope(req.actor, req.scope, opp.account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });

    const disc = Number(discount_pct) || 0;
    const { subtotal, total } = computeTotals(line_items, disc);
    // Over-threshold discounts need Sales Manager approval before they can be sent.
    const status = disc > DISCOUNT_THRESHOLD ? 'PENDING_APPROVAL' : 'APPROVED';

    const { id, version } = await insertQuoteVersion({ opportunity_id, account_id: opp.account_id, line_items, subtotal, discount_pct: disc, total, status, created_by: req.actor.userId });
    await writeCrmAudit(pool, req, { action: 'QUOTE_CREATED', entityType: 'quote', entityId: id, accountId: opp.account_id, detail: { discount_pct: disc, status } });
    res.status(201).json({ success: true, data: { id, version, subtotal, total, status, needsApproval: status === 'PENDING_APPROVAL' } });
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
    // A manager may only approve discounts for accounts within their own scope.
    if (!(await accountInScope(req.actor, req.scope, q.account_id))) return res.status(403).json({ success: false, message: 'Account outside your scope.' });
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
    if (!Array.isArray(line_items) || line_items.length === 0) return res.status(400).json({ success: false, message: 'line_items must be a non-empty array.' });
    const disc = req.body?.discount_pct != null ? Number(req.body.discount_pct) : Number(q.discount_pct);
    const validationError = validateQuoteInput(line_items, disc);
    if (validationError) return res.status(422).json({ success: false, message: validationError });
    const { subtotal, total } = computeTotals(line_items, disc);
    const status = disc > DISCOUNT_THRESHOLD ? 'PENDING_APPROVAL' : 'APPROVED';
    const { id, version } = await insertQuoteVersion({ opportunity_id: q.opportunity_id, account_id: q.account_id, line_items, subtotal, discount_pct: disc, total, status, created_by: req.actor.userId });
    res.status(201).json({ success: true, data: { id, version, status } });
  } catch (err) { next(err); }
}
