// The posting engine (Section 4.2). Operational systems call postEvent(); the
// engine owns the exclusive right to turn an event into a balanced, persisted
// journal entry. Every write here goes through: idempotency → balance check →
// open-period gate → atomic persist. This is the single place the ledger is
// written.
import { randomUUID } from 'crypto';
import { pool } from '../config/db.js';
import { buildLines, assertBalanced } from './postingRules.js';

// Event type → short `source` category (the column is VARCHAR(20); the full
// event type goes in `description`).
const SOURCE_OF = {
  INVOICE_ISSUED: 'BILLING', PAYMENT_RECEIVED: 'BILLING', REVENUE_RECOGNIZED: 'REVENUE',
  PAYROLL_APPROVED: 'PAYROLL', CAMPAIGN_CHARGED: 'MARKETING',
  COMMISSION_EARNED: 'SALES', COMMISSION_PAID: 'SALES', COMMISSION_CLAWED_BACK: 'SALES',
  VENDOR_BILL_APPROVED: 'AP',
};

const centsToDecimal = (cents) => (cents / 100).toFixed(2);
const fmtDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d || new Date().toISOString().slice(0, 10));

async function accountIdMap(conn) {
  const [rows] = await conn.query('SELECT code, id FROM gl_accounts');
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}
async function costCenterIdMap(conn) {
  const [rows] = await conn.query('SELECT code, id FROM cost_centers');
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

// The current OPEN period; create the current month if none is open. Postings
// into a closed period are rejected here (BR-03).
async function ensureCurrentPeriod(conn) {
  const [[open]] = await conn.query(
    "SELECT id FROM fiscal_periods WHERE status = 'OPEN' ORDER BY fiscal_year DESC, fiscal_month DESC LIMIT 1"
  );
  if (open) return open.id;
  const now = new Date();
  const [r] = await conn.query(
    "INSERT IGNORE INTO fiscal_periods (fiscal_year, fiscal_month, status) VALUES (?, ?, 'OPEN')",
    [now.getUTCFullYear(), now.getUTCMonth() + 1]
  );
  if (r.insertId) return r.insertId;
  const [[p]] = await conn.query("SELECT id FROM fiscal_periods WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1");
  return p.id;
}

// Insert an entry header. entry_no is derived from the id (gapless-ish), set in
// the same transaction.
async function insertEntry(conn, e) {
  const [r] = await conn.query(
    `INSERT INTO journal_entries
       (entry_no, period_id, entry_date, description, source, source_event_id, status, created_by, approved_by, reverses_id, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `TMP-${randomUUID()}`, e.periodId, fmtDate(e.entryDate), e.description, e.source,
      e.sourceEventId || null, e.status, e.createdBy ?? null, e.approvedBy ?? null,
      e.reversesId ?? null, e.postedAt ? new Date() : null,
    ]
  );
  const id = r.insertId;
  const entryNo = `JE-${String(id).padStart(8, '0')}`;
  await conn.query('UPDATE journal_entries SET entry_no = ? WHERE id = ?', [entryNo, id]);
  return { id, entryNo };
}

async function insertLines(conn, jeId, lines, accMap, ccMap) {
  for (const l of lines) {
    const accountId = accMap[l.account];
    if (!accountId) throw new Error(`Unknown account code: ${l.account}`);
    const ccId = l.cost_center ? ccMap[l.cost_center] || null : null;
    await conn.query(
      `INSERT INTO journal_lines
         (je_id, account_id, cost_center_id, side, amount, project_id, account_ref_id, employee_id, campaign_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [jeId, accountId, ccId, l.side, centsToDecimal(l.amount), l.project_id ?? null, l.account_ref_id ?? null, l.employee_id ?? null, l.campaign_id ?? null]
    );
  }
}

// Post a business event. Idempotent on eventId (safe under at-least-once
// delivery). Amounts inside `event` are integer minor units (cents).
export async function postEvent({ eventId, type, event, entryDate, actor }) {
  const id = eventId || randomUUID();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Idempotency: never post the same event twice. Return the existing
    // entry_no too, so callers (e.g. payroll je_ref) never lose the link.
    const [[seen]] = await conn.query('SELECT je_id FROM fms_postings WHERE event_id = ? FOR UPDATE', [id]);
    if (seen) {
      const [[je]] = await conn.query('SELECT entry_no FROM journal_entries WHERE id = ?', [seen.je_id]);
      await conn.commit();
      conn.release();
      return { jeId: seen.je_id, entryNo: je?.entry_no || null, alreadyPosted: true };
    }

    // 2. Translate + 3. assert balanced (buildLines throws if not).
    const lines = buildLines(type, event);

    // 4. Persist entry + lines + posting record atomically.
    const periodId = await ensureCurrentPeriod(conn);
    const [accMap, ccMap] = [await accountIdMap(conn), await costCenterIdMap(conn)];
    const { id: jeId, entryNo } = await insertEntry(conn, {
      periodId, entryDate, description: type, source: SOURCE_OF[type] || 'SYSTEM',
      sourceEventId: id, status: 'POSTED', createdBy: actor?.id ?? null, postedAt: true,
    });
    await insertLines(conn, jeId, lines, accMap, ccMap);
    await conn.query('INSERT INTO fms_postings (event_id, je_id) VALUES (?, ?)', [id, jeId]);

    await conn.commit();
    conn.release();
    return { jeId, entryNo, alreadyPosted: false };
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    // Concurrent delivery to a second worker lost the unique-key race — treat as
    // already-posted, and recover the entry_no so je_ref links survive.
    if (err.code === 'ER_DUP_ENTRY') {
      const [[row]] = await pool.query(
        'SELECT p.je_id, j.entry_no FROM fms_postings p JOIN journal_entries j ON j.id = p.je_id WHERE p.event_id = ?',
        [id]
      );
      return { jeId: row?.je_id || null, entryNo: row?.entry_no || null, alreadyPosted: true };
    }
    throw err;
  }
}

// A human-created journal (maker). Starts DRAFT; a different user must approve
// it to POST (checker). Lines: [{ account_code, side, amount(cents), ... }].
export async function createManualJournal({ description, entryDate, createdBy, lines }) {
  assertBalanced(lines.map((l) => ({ side: l.side, account: l.account_code, amount: l.amount })));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const periodId = await ensureCurrentPeriod(conn);
    const [accMap, ccMap] = [await accountIdMap(conn), await costCenterIdMap(conn)];
    const { id, entryNo } = await insertEntry(conn, {
      periodId, entryDate, description: description || 'Manual journal', source: 'MANUAL',
      status: 'DRAFT', createdBy,
    });
    await insertLines(conn, id, lines.map((l) => ({
      side: l.side, account: l.account_code, amount: l.amount, cost_center: l.cost_center_code,
      project_id: l.project_id, account_ref_id: l.account_ref_id, employee_id: l.employee_id, campaign_id: l.campaign_id,
    })), accMap, ccMap);
    await conn.commit();
    conn.release();
    return { jeId: id, entryNo, status: 'DRAFT' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    throw err;
  }
}

// Approve + post a draft journal. maker≠checker enforced here AND by the DB
// CHECK constraint (BR-05).
export async function approveJournal(jeId, approverId) {
  const [[je]] = await pool.query('SELECT * FROM journal_entries WHERE id = ?', [jeId]);
  if (!je) return { error: 'not_found' };
  if (!['DRAFT', 'SUBMITTED'].includes(je.status)) return { error: 'not_approvable' };
  if (String(je.created_by) === String(approverId)) return { error: 'maker_is_checker' };
  await pool.query("UPDATE journal_entries SET status = 'POSTED', approved_by = ?, posted_at = NOW() WHERE id = ?", [approverId, jeId]);
  return { jeId, status: 'POSTED' };
}

// Correct a posted entry by REVERSAL — never edit or delete. Both the error and
// the correction stay visible (BR-02).
export async function reverseEntry(jeId, actor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[orig]] = await conn.query('SELECT * FROM journal_entries WHERE id = ? FOR UPDATE', [jeId]);
    if (!orig) { await conn.rollback(); conn.release(); return { error: 'not_found' }; }
    if (orig.status !== 'POSTED') { await conn.rollback(); conn.release(); return { error: 'not_posted' }; }

    const [lines] = await conn.query('SELECT * FROM journal_lines WHERE je_id = ?', [jeId]);
    const periodId = await ensureCurrentPeriod(conn);
    const { id: newId, entryNo } = await insertEntry(conn, {
      periodId, description: `Reversal of ${orig.entry_no}`, source: 'REVERSAL',
      status: 'POSTED', createdBy: actor?.id ?? null, reversesId: jeId, postedAt: true,
    });
    for (const l of lines) {
      await conn.query(
        `INSERT INTO journal_lines
           (je_id, account_id, cost_center_id, side, amount, project_id, account_ref_id, employee_id, campaign_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, l.account_id, l.cost_center_id, l.side === 'DR' ? 'CR' : 'DR', l.amount, l.project_id, l.account_ref_id, l.employee_id, l.campaign_id]
      );
    }
    await conn.query("UPDATE journal_entries SET status = 'REVERSED' WHERE id = ?", [jeId]);
    await conn.commit();
    conn.release();
    return { reversedBy: newId, entryNo };
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    throw err;
  }
}

// Trial balance: Σ debits must equal Σ credits over POSTED entries (a reversed
// original is status REVERSED and excluded; its reversing entry is POSTED, so
// the pair nets to zero).
export async function trialBalance() {
  const [[row]] = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN jl.side = 'DR' THEN jl.amount ELSE 0 END), 0) AS debits,
           COALESCE(SUM(CASE WHEN jl.side = 'CR' THEN jl.amount ELSE 0 END), 0) AS credits
      FROM journal_lines jl JOIN journal_entries je ON je.id = jl.je_id
     WHERE je.status = 'POSTED'`);
  const debits = Number(row.debits), credits = Number(row.credits);
  return { debits, credits, balanced: Math.abs(debits - credits) < 0.005 };
}

// Per-account balances (drives the P&L / balance sheet).
export async function accountBalances() {
  const [rows] = await pool.query(`
    SELECT a.code, a.name, a.account_type, a.normal_side,
           COALESCE(SUM(CASE WHEN jl.side = 'DR' THEN jl.amount ELSE 0 END), 0) AS debits,
           COALESCE(SUM(CASE WHEN jl.side = 'CR' THEN jl.amount ELSE 0 END), 0) AS credits
      FROM gl_accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.je_id AND je.status = 'POSTED'
     GROUP BY a.id, a.code, a.name, a.account_type, a.normal_side
     ORDER BY a.code`);
  return rows.map((r) => {
    const debits = Number(r.debits), credits = Number(r.credits);
    const balance = r.normal_side === 'DR' ? debits - credits : credits - debits;
    return { code: r.code, name: r.name, type: r.account_type, debits, credits, balance };
  });
}

// Recent journal entries with their lines (for the console / drill-down).
export async function recentEntries(limit = 50) {
  const [entries] = await pool.query(
    `SELECT id, entry_no, entry_date, description, source, status, created_by, approved_by, posted_at
       FROM journal_entries ORDER BY id DESC LIMIT ?`,
    [Math.min(Number(limit) || 50, 200)]
  );
  if (!entries.length) return [];
  const ids = entries.map((e) => e.id);
  const [lines] = await pool.query(
    `SELECT jl.je_id, a.code AS account_code, a.name AS account_name, jl.side, jl.amount
       FROM journal_lines jl JOIN gl_accounts a ON a.id = jl.account_id
      WHERE jl.je_id IN (${ids.map(() => '?').join(',')}) ORDER BY jl.id`,
    ids
  );
  const byJe = {};
  for (const l of lines) (byJe[l.je_id] ||= []).push(l);
  return entries.map((e) => ({ ...e, lines: byJe[e.id] || [] }));
}
