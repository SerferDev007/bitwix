import { pool } from '../../config/db.js';
import { CHART } from '../../fms/accounts.js';
import * as ledger from '../../fms/ledger.js';
import * as analytics from '../../fms/analytics.js';
import { reconcileLedger } from '../../fms/reconcile.js';
import { writeFmsAudit } from '../../fms/audit.js';

const actorOf = (req) => ({ id: null, role: req.admin?.role || 'ADMIN', ip: req.ip });

export async function listAccounts(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT code, name, account_type, normal_side, is_postable, active FROM gl_accounts ORDER BY code');
    res.json({ success: true, count: rows.length, data: rows.length ? rows : CHART });
  } catch (err) { next(err); }
}

export async function getTrialBalance(req, res, next) {
  try { res.json({ success: true, data: await ledger.trialBalance() }); }
  catch (err) { next(err); }
}

// P&L derived purely by summing the ledger — no maintained totals.
export async function getProfitAndLoss(req, res, next) {
  try {
    const balances = await ledger.accountBalances();
    const revenue = balances.filter((b) => b.type === 'REVENUE').reduce((s, b) => s + b.balance, 0);
    const cogs = balances.filter((b) => b.code === '5000').reduce((s, b) => s + b.balance, 0);
    const opex = balances.filter((b) => b.type === 'EXPENSE' && b.code !== '5000').reduce((s, b) => s + b.balance, 0);
    const grossProfit = revenue - cogs;
    res.json({
      success: true,
      data: {
        revenue, costOfRevenue: cogs, grossProfit,
        grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 10000 : null,
        operatingExpense: opex, netProfit: grossProfit - opex, accounts: balances,
      },
    });
  } catch (err) { next(err); }
}

export async function listJournal(req, res, next) {
  try { res.json({ success: true, data: await ledger.recentEntries(req.query.limit) }); }
  catch (err) { next(err); }
}

const isRuleError = (msg = '') =>
  msg.startsWith('Unbalanced') || msg.startsWith('No posting rule') || msg.includes('minor units') || msg.includes('two lines');

// POST /api/fms/events { eventId?, type, event } — the integration contract.
export async function postEvent(req, res, next) {
  try {
    const { eventId, type, event } = req.body || {};
    if (!type || !event) return res.status(400).json({ success: false, message: 'type and event are required.' });
    const result = await ledger.postEvent({ eventId, type, event, actor: actorOf(req) });
    await writeFmsAudit(pool, actorOf(req), { action: 'EVENT_POSTED', entityType: 'journal_entry', entityId: result.jeId ?? null, detail: { type, alreadyPosted: !!result.alreadyPosted } });
    res.status(result.alreadyPosted ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    if (isRuleError(err.message)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// POST /api/fms/journal — create a DRAFT manual journal (maker).
export async function createJournal(req, res, next) {
  try {
    const { description, entryDate, created_by, lines } = req.body || {};
    if (!Array.isArray(lines) || lines.length < 2) return res.status(400).json({ success: false, message: 'At least two lines are required.' });
    if (!created_by) return res.status(400).json({ success: false, message: 'created_by (the maker) is required.' });
    const result = await ledger.createManualJournal({ description, entryDate, createdBy: created_by, lines });
    await writeFmsAudit(pool, actorOf(req), { action: 'JOURNAL_DRAFTED', entityType: 'journal_entry', entityId: result.jeId, detail: { description } });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (isRuleError(err.message)) return res.status(422).json({ success: false, message: err.message });
    next(err);
  }
}

// POST /api/fms/journal/:id/approve — approve + post (checker ≠ maker).
export async function approveJournal(req, res, next) {
  try {
    const { approved_by } = req.body || {};
    if (!approved_by) return res.status(400).json({ success: false, message: 'approved_by (the checker) is required.' });
    const result = await ledger.approveJournal(req.params.id, approved_by);
    if (result.error === 'maker_is_checker') return res.status(403).json({ success: false, message: 'The approver cannot be the creator (BR-05).' });
    if (result.error === 'not_found') return res.status(404).json({ success: false, message: 'Journal not found.' });
    if (result.error === 'not_approvable') return res.status(409).json({ success: false, message: 'Journal is not in an approvable state.' });
    await writeFmsAudit(pool, actorOf(req), { action: 'JOURNAL_POSTED', entityType: 'journal_entry', entityId: Number(req.params.id), detail: { approvedBy: approved_by } });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(403).json({ success: false, message: 'Maker–checker / approval constraint violated.' });
    next(err);
  }
}

// POST /api/fms/journal/:id/reverse — correct by reversal (never edit/delete).
export async function reverseJournal(req, res, next) {
  try {
    const result = await ledger.reverseEntry(req.params.id, actorOf(req));
    if (result.error === 'not_found') return res.status(404).json({ success: false, message: 'Journal not found.' });
    if (result.error === 'not_posted') return res.status(409).json({ success: false, message: 'Only a posted entry can be reversed.' });
    await writeFmsAudit(pool, actorOf(req), { action: 'JOURNAL_REVERSED', entityType: 'journal_entry', entityId: Number(req.params.id), detail: result });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// POST /api/fms/reconcile — the durable backstop for the best-effort posts.
// Delegates to reconcileLedger (shared with the startup scheduler). Idempotent.
export async function reconcile(req, res, next) {
  try {
    const out = await reconcileLedger(actorOf(req));
    try { await writeFmsAudit(pool, actorOf(req), { action: 'LEDGER_RECONCILED', entityType: 'ledger', detail: out }); } catch { /* audit is best-effort */ }
    res.json({ success: true, data: out });
  } catch (err) { next(err); }
}

// POST /api/fms/analytics/unit-economics — derive ratios from supplied inputs.
export function unitEconomics(req, res) {
  const b = req.body || {};
  const out = {};
  if (b.loadedCost) out.loadedCost = analytics.loadedCostPerBillableHour(b.loadedCost);
  if (b.percentageOfCompletion) out.percentageOfCompletion = analytics.percentageOfCompletion(b.percentageOfCompletion);
  if (b.commission) out.commission = analytics.commission(b.commission);
  if (b.cac) out.cac = analytics.cac(b.cac);
  if (b.ltv) out.ltv = analytics.ltv(b.ltv);
  if (b.cacPayback) out.cacPayback = analytics.cacPayback(b.cacPayback);
  if (b.grossMargin) out.grossMargin = analytics.grossMargin(b.grossMargin);
  if (b.runway) out.runway = analytics.runway(b.runway);
  if (b.projectProfit) out.projectProfit = analytics.projectProfit(b.projectProfit);
  res.json({ success: true, data: out });
}
