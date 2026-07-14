// The reconciliation sweep — the durable backstop for the best-effort ledger
// posts. It re-drives any operational fact whose posting was dropped (a transient
// failure after the DB state changed): won opportunities, paid invoices, and
// approved-but-unposted payroll runs that have NO matching fms_postings row.
// Idempotent (postEvent dedups on eventId), so it is safe to call repeatedly —
// from POST /api/fms/reconcile (manual) or the startup scheduler (automatic).
import { pool } from '../config/db.js';
import { postEvent } from './ledger.js';

export async function reconcileLedger(actor = { id: null, role: 'SYSTEM' }) {
  const out = { deals: 0, invoices: 0, payroll: 0, errors: [] };

  // Won opportunities missing their INVOICE_ISSUED posting.
  try {
    const [deals] = await pool.query(
      `SELECT o.id, o.account_id, o.amount FROM opportunities o
         LEFT JOIN fms_postings p ON p.event_id = CONCAT('opp-won-', o.id)
        WHERE o.stage = 'CLOSED_WON' AND p.id IS NULL`
    );
    for (const o of deals) {
      const cents = Math.round(Number(o.amount) * 100);
      if (cents <= 0) continue;
      try {
        await postEvent({ eventId: `opp-won-${o.id}`, type: 'INVOICE_ISSUED', event: { amount: cents, account_ref_id: o.account_id }, actor });
        out.deals++;
      } catch (e) { out.errors.push(`opp ${o.id}: ${e.message}`); }
    }
  } catch (e) { out.errors.push(`deals sweep: ${e.message}`); }

  // Paid invoices missing their PAYMENT_RECEIVED posting.
  try {
    const [invs] = await pool.query(
      `SELECT i.id, i.account_id, i.amount FROM invoices i
         LEFT JOIN fms_postings p ON p.event_id = CONCAT('invoice-paid-', i.id)
        WHERE i.status = 'PAID' AND p.id IS NULL`
    );
    for (const i of invs) {
      const cents = Math.round(Number(i.amount) * 100);
      if (cents <= 0) continue;
      try {
        await postEvent({ eventId: `invoice-paid-${i.id}`, type: 'PAYMENT_RECEIVED', event: { amount: cents, account_ref_id: i.account_id }, actor });
        out.invoices++;
      } catch (e) { out.errors.push(`invoice ${i.id}: ${e.message}`); }
    }
  } catch (e) { out.errors.push(`invoices sweep: ${e.message}`); }

  // Approved-but-not-posted payroll runs.
  try {
    const [runs] = await pool.query("SELECT id FROM payroll_runs WHERE status = 'APPROVED'");
    for (const r of runs) {
      try {
        const [lines] = await pool.query('SELECT employee_id, cost_center, gross, tax, is_billable FROM payroll_lines WHERE run_id = ?', [r.id]);
        const event = {
          lines: lines.map((l) => {
            const g = Math.round(Number(l.gross) * 100);
            const t = Math.round(Number(l.tax) * 100);
            return { employee: l.employee_id, cost_center: l.cost_center, gross: g, tax: t, net: g - t, is_billable_role: !!l.is_billable };
          }),
        };
        const posted = await postEvent({ eventId: `payroll-run-${r.id}`, type: 'PAYROLL_APPROVED', event, actor });
        await pool.query("UPDATE payroll_runs SET status = 'POSTED', je_ref = ? WHERE id = ?", [posted.entryNo || null, r.id]);
        out.payroll++;
      } catch (e) { out.errors.push(`payroll ${r.id}: ${e.message}`); }
    }
  } catch (e) { out.errors.push(`payroll sweep: ${e.message}`); }

  return out;
}
