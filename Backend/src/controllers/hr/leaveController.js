import { pool } from '../../config/db.js';
import { scopeToSql } from '../../hr/rbac.js';
import { writeAudit, auditCtx } from '../../hr/audit.js';

function daysBetween(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / 86400000) + 1; // inclusive
}

// GET /api/hr/leave/types
export async function listLeaveTypes(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM leave_types ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/hr/leave/balance — the caller's own balances for the current year.
export async function getBalance(req, res, next) {
  try {
    const year = new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT lt.id AS leave_type_id, lt.name, lt.annual_quota, lt.allow_negative,
              COALESCE(b.entitled, lt.annual_quota) AS entitled,
              COALESCE(b.used, 0) AS used, COALESCE(b.pending, 0) AS pending,
              COALESCE(b.entitled, lt.annual_quota) - COALESCE(b.used,0) - COALESCE(b.pending,0) AS available
         FROM leave_types lt
         LEFT JOIN leave_balances b
           ON b.leave_type_id = lt.id AND b.employee_id = ? AND b.year = ?
        ORDER BY lt.id`,
      [req.actor.employeeId, year]
    );
    res.json({ success: true, year, data: rows });
  } catch (err) {
    next(err);
  }
}

async function ensureBalanceRow(conn, employeeId, leaveTypeId, year) {
  const [[bal]] = await conn.query(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ? FOR UPDATE',
    [employeeId, leaveTypeId, year]
  );
  if (bal) return bal;
  const [[lt]] = await conn.query('SELECT annual_quota FROM leave_types WHERE id = ?', [leaveTypeId]);
  await conn.query(
    'INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled, used, pending) VALUES (?, ?, ?, ?, 0, 0)',
    [employeeId, leaveTypeId, year, lt.annual_quota]
  );
  return { employee_id: employeeId, leave_type_id: leaveTypeId, year, entitled: Number(lt.annual_quota), used: 0, pending: 0 };
}

// POST /api/hr/leave/requests { leave_type_id, start_date, end_date, reason }
// Reserves the days as `pending` on submission (closes the multi-request race).
export async function applyLeave(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { leave_type_id, start_date, end_date, reason } = req.body || {};
    if (!leave_type_id || !start_date || !end_date) {
      conn.release();
      return res.status(400).json({ success: false, message: 'leave_type_id, start_date and end_date are required.' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      conn.release();
      return res.status(400).json({ success: false, message: 'end_date must be on or after start_date.' });
    }
    const days = daysBetween(start_date, end_date);
    const year = new Date(start_date).getFullYear();
    const empId = req.actor.employeeId;

    await conn.beginTransaction();
    const bal = await ensureBalanceRow(conn, empId, leave_type_id, year);
    const [[lt]] = await conn.query('SELECT allow_negative FROM leave_types WHERE id = ?', [leave_type_id]);
    const available = Number(bal.entitled) - Number(bal.used) - Number(bal.pending);
    if (!lt.allow_negative && days > available) {
      await conn.rollback();
      conn.release();
      return res.status(422).json({ success: false, message: `Insufficient balance: ${available} day(s) available, ${days} requested.` });
    }

    const [r] = await conn.query(
      `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [empId, leave_type_id, start_date, end_date, days, reason?.trim() || null]
    );
    await conn.query(
      'UPDATE leave_balances SET pending = pending + ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?',
      [days, empId, leave_type_id, year]
    );
    await writeAudit(conn, { ...auditCtx(req), action: 'LEAVE_APPLIED', entityType: 'leave_request', entityId: r.insertId, after: { days, start_date, end_date } });
    await conn.commit();
    conn.release();
    res.status(201).json({ success: true, data: { id: r.insertId, days, status: 'PENDING' } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}

// GET /api/hr/leave/requests — scope-filtered (own / team / all).
export async function listRequests(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope, { idCol: 'e.id', mgrCol: 'e.manager_id' });
    const [rows] = await pool.query(
      `SELECT lr.*, e.name AS employee_name, lt.name AS leave_type
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE ${sql}
        ORDER BY lr.created_at DESC`,
      params
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/hr/leave/requests/:id/approve — the concurrency-safe approval.
export async function approveLeave(req, res, next) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the request row (guards the double-approval race — Section 7.4).
    const [[lr]] = await conn.query('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!lr) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Request not found.' }); }

    // Check 2: still PENDING.
    if (lr.status !== 'PENDING') { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, message: `Request already ${lr.status}.` }); }

    // Check 1: approver is the applicant's manager (scope) and NOT the applicant (BR-05).
    const [[applicant]] = await conn.query('SELECT id, manager_id FROM employees WHERE id = ?', [lr.employee_id]);
    if (applicant.id === req.actor.employeeId) { await conn.rollback(); conn.release(); return res.status(403).json({ success: false, message: 'You cannot approve your own request (BR-05).' }); }
    const isManager = applicant.manager_id === req.actor.employeeId;
    const isHr = ['HR_ADMIN', 'SUPER_ADMIN'].includes(req.actor.role);
    if (!isManager && !isHr) { await conn.rollback(); conn.release(); return res.status(403).json({ success: false, message: 'Only the applicant\'s manager (or HR Admin) may approve.' }); }

    const year = new Date(lr.start_date).getFullYear();
    const bal = await ensureBalanceRow(conn, lr.employee_id, lr.leave_type_id, year);
    const [[lt]] = await conn.query('SELECT allow_negative FROM leave_types WHERE id = ?', [lr.leave_type_id]);

    // Check 3: sufficient balance (pending already reserved this request's days).
    const availableIfApproved = Number(bal.entitled) - Number(bal.used) - Number(bal.pending) + Number(lr.days);
    if (!lt.allow_negative && Number(lr.days) > availableIfApproved) {
      await conn.rollback(); conn.release();
      return res.status(422).json({ success: false, message: 'Insufficient balance to approve.' });
    }

    // Check 4: no overlap with an already-approved request.
    const [[overlap]] = await conn.query(
      `SELECT COUNT(*) AS c FROM leave_requests
        WHERE employee_id = ? AND status = 'APPROVED' AND id <> ?
          AND NOT (end_date < ? OR start_date > ?)`,
      [lr.employee_id, lr.id, lr.start_date, lr.end_date]
    );
    if (overlap.c > 0) { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, message: 'Dates overlap an existing approved leave.' }); }

    // Commit: move pending → used, mark approved, audit — all atomically.
    await conn.query(
      'UPDATE leave_balances SET used = used + ?, pending = pending - ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?',
      [lr.days, lr.days, lr.employee_id, lr.leave_type_id, year]
    );
    await conn.query(
      "UPDATE leave_requests SET status = 'APPROVED', approver_id = ?, decided_at = NOW(), decision_note = ? WHERE id = ?",
      [req.actor.accountId, req.body?.note || null, lr.id]
    );
    await writeAudit(conn, { ...auditCtx(req), action: 'LEAVE_APPROVED', entityType: 'leave_request', entityId: lr.id, before: { status: 'PENDING' }, after: { status: 'APPROVED' } });
    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Leave approved.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}

// POST /api/hr/leave/requests/:id/reject — release the reservation.
export async function rejectLeave(req, res, next) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[lr]] = await conn.query('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!lr) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Request not found.' }); }
    if (lr.status !== 'PENDING') { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, message: `Request already ${lr.status}.` }); }

    const [[applicant]] = await conn.query('SELECT id, manager_id FROM employees WHERE id = ?', [lr.employee_id]);
    if (applicant.id === req.actor.employeeId) { await conn.rollback(); conn.release(); return res.status(403).json({ success: false, message: 'You cannot decide your own request (BR-05).' }); }

    const year = new Date(lr.start_date).getFullYear();
    await conn.query(
      'UPDATE leave_balances SET pending = pending - ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?',
      [lr.days, lr.employee_id, lr.leave_type_id, year]
    );
    await conn.query(
      "UPDATE leave_requests SET status = 'REJECTED', approver_id = ?, decided_at = NOW(), decision_note = ? WHERE id = ?",
      [req.actor.accountId, req.body?.note || null, lr.id]
    );
    await writeAudit(conn, { ...auditCtx(req), action: 'LEAVE_REJECTED', entityType: 'leave_request', entityId: lr.id });
    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Leave rejected.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}
