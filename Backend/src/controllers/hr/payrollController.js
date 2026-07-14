import { pool } from '../../config/db.js';
import { payrollLineFor } from '../../hr/payroll.js';
import { writeAudit, auditCtx } from '../../hr/audit.js';
import { postEvent } from '../../fms/ledger.js';

const money = (cents) => (cents / 100).toFixed(2);

// POST /api/hr/payroll/runs — draft a run from active salaried employees.
export async function createPayrollRun(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const label = (req.body?.label || new Date().toISOString().slice(0, 7)).slice(0, 20); // YYYY-MM
    const [emps] = await conn.query(
      "SELECT id, name, role, monthly_salary FROM employees WHERE hr_status = 'active' AND monthly_salary IS NOT NULL AND monthly_salary > 0"
    );
    if (!emps.length) { conn.release(); return res.status(422).json({ success: false, message: 'No active salaried employees to pay.' }); }

    const lines = emps.map((e) => payrollLineFor(e));
    const grossTotalCents = lines.reduce((s, l) => s + l.grossCents, 0);

    await conn.beginTransaction();
    // One run per period: reject a second run for the same label (backed by a
    // UNIQUE key on fresh installs; the ER_DUP_ENTRY catch below closes the race).
    const [[dup]] = await conn.query('SELECT id FROM payroll_runs WHERE label = ? LIMIT 1', [label]);
    if (dup) { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, message: `A payroll run for ${label} already exists.` }); }
    const [r] = await conn.query(
      'INSERT INTO payroll_runs (label, status, gross_total, created_by) VALUES (?, ?, ?, ?)',
      [label, 'DRAFT', money(grossTotalCents), req.actor.accountId]
    );
    const runId = r.insertId;
    for (const l of lines) {
      await conn.query(
        'INSERT INTO payroll_lines (run_id, employee_id, employee_name, cost_center, gross, tax, net, is_billable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [runId, l.employee_id, l.employee_name, l.cost_center, money(l.grossCents), money(l.taxCents), money(l.netCents), l.is_billable_role]
      );
    }
    await writeAudit(conn, { ...auditCtx(req), action: 'PAYROLL_RUN_CREATED', entityType: 'payroll_run', entityId: runId, after: { label, employees: lines.length, gross: money(grossTotalCents) } });
    await conn.commit();
    conn.release();
    res.status(201).json({ success: true, data: { id: runId, label, status: 'DRAFT', employees: lines.length, gross_total: money(grossTotalCents) } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'A payroll run for this period already exists.' });
    next(err);
  }
}

export async function listPayrollRuns(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT pr.id, pr.label, pr.status, pr.gross_total, pr.created_by, pr.approved_by, pr.je_ref, pr.created_at,
              (SELECT COUNT(*) FROM payroll_lines pl WHERE pl.run_id = pr.id) AS employees
         FROM payroll_runs pr ORDER BY pr.id DESC`
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
}

export async function getPayrollRun(req, res, next) {
  try {
    const [[run]] = await pool.query('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ success: false, message: 'Payroll run not found.' });
    const [lines] = await pool.query('SELECT employee_id, employee_name, cost_center, gross, tax, net, is_billable FROM payroll_lines WHERE run_id = ? ORDER BY id', [run.id]);
    res.json({ success: true, data: { ...run, lines } });
  } catch (err) { next(err); }
}

// POST /api/hr/payroll/runs/:id/approve — approve (maker ≠ checker) and post the
// PAYROLL_APPROVED event to the FMS ledger, split by cost center.
export async function approvePayrollRun(req, res, next) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[run]] = await conn.query('SELECT * FROM payroll_runs WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!run) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Payroll run not found.' }); }
    // Only a DRAFT run may be approved. Rejecting APPROVED too (not just POSTED)
    // closes the concurrent double-approve race that would clobber approved_by /
    // je_ref; a run stuck in APPROVED (ledger post failed) is re-posted via the
    // /api/fms/reconcile sweep, not by re-approving.
    if (run.status !== 'DRAFT') {
      await conn.rollback(); conn.release();
      return res.status(409).json({ success: false, message: run.status === 'POSTED' ? 'Run already posted to the ledger.' : 'Run already approved; use Reconcile to (re)post if it did not reach the ledger.' });
    }
    // The person who ran payroll cannot approve it (separation of duties).
    if (String(run.created_by) === String(req.actor.accountId)) {
      await conn.rollback(); conn.release();
      return res.status(403).json({ success: false, message: 'You cannot approve a payroll run you created (separation of duties). A second HR Admin must approve.' });
    }

    const [lines] = await conn.query('SELECT employee_id, cost_center, gross, tax, is_billable FROM payroll_lines WHERE run_id = ?', [run.id]);
    await conn.query("UPDATE payroll_runs SET status = 'APPROVED', approved_by = ? WHERE id = ?", [req.actor.accountId, run.id]);
    await writeAudit(conn, { ...auditCtx(req), action: 'PAYROLL_RUN_APPROVED', entityType: 'payroll_run', entityId: run.id });
    await conn.commit();
    conn.release();

    // Post to the ledger (idempotent). Kept outside the HR transaction so a
    // ledger hiccup doesn't roll back the approval — the run stays APPROVED and
    // the post can be retried.
    const event = {
      lines: lines.map((l) => {
        const grossCents = Math.round(Number(l.gross) * 100);
        const taxCents = Math.round(Number(l.tax) * 100);
        return { employee: l.employee_id, cost_center: l.cost_center, gross: grossCents, tax: taxCents, net: grossCents - taxCents, is_billable_role: !!l.is_billable };
      }),
    };
    try {
      const result = await postEvent({ eventId: `payroll-run-${run.id}`, type: 'PAYROLL_APPROVED', event, actor: { id: req.actor.accountId, role: req.actor.role } });
      await pool.query("UPDATE payroll_runs SET status = 'POSTED', je_ref = ? WHERE id = ?", [result.entryNo || null, run.id]);
      res.json({ success: true, data: { id: run.id, status: 'POSTED', je_ref: result.entryNo || null } });
    } catch (postErr) {
      console.error('[fms] payroll ledger post failed:', postErr.message);
      res.status(200).json({ success: true, data: { id: run.id, status: 'APPROVED' }, message: 'Approved, but posting to the ledger failed — it will be retried.' });
    }
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}
