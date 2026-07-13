import { pool } from '../../config/db.js';
import { generateToken } from '../../hr/password.js';
import { scopeToSql, filterFields } from '../../hr/rbac.js';
import { writeAudit, auditCtx } from '../../hr/audit.js';

const INVITE_TTL_HOURS = 72;

// POST /api/hr/employees — provision an employee + login account + invitation.
// The account is created in PENDING_ACTIVATION with no password; a single-use
// invite token is returned (in production it would be emailed, never stored raw).
export async function provisionEmployee(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { name, work_email, role = 'EMPLOYEE', manager_id, employee_code, designation } = req.body || {};
    if (!name || !name.trim()) { conn.release(); return res.status(400).json({ success: false, errors: { name: 'Name is required.' } }); }
    if (!work_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(work_email)) { conn.release(); return res.status(400).json({ success: false, errors: { work_email: 'A valid work email is required.' } }); }

    const [[roleRow]] = await conn.query('SELECT id, name FROM roles WHERE name = ?', [role]);
    if (!roleRow) { conn.release(); return res.status(400).json({ success: false, message: `Unknown role: ${role}` }); }

    await conn.beginTransaction();

    const [empResult] = await conn.query(
      `INSERT INTO employees (name, role, work_email, manager_id, employee_code, hr_status, engagement_state)
       VALUES (?, ?, ?, ?, ?, 'active', 'engaged')`,
      [name.trim(), designation || role, work_email.trim(), manager_id || null, employee_code || null]
    );
    const employeeId = empResult.insertId;

    const [acctResult] = await conn.query(
      `INSERT INTO hr_accounts (employee_id, email, password_hash, role_id, status, created_by)
       VALUES (?, ?, NULL, ?, 'PENDING_ACTIVATION', ?)`,
      [employeeId, work_email.trim(), roleRow.id, req.actor.accountId]
    );
    const accountId = acctResult.insertId;

    const { raw, hash } = generateToken();
    await conn.query(
      `INSERT INTO hr_invitations (account_id, token_hash, purpose, expires_at)
       VALUES (?, ?, 'ACTIVATION', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [accountId, hash, INVITE_TTL_HOURS]
    );

    await writeAudit(conn, { ...auditCtx(req), action: 'EMPLOYEE_CREATED', entityType: 'employee', entityId: employeeId, after: { name, work_email, role } });
    await conn.commit();
    conn.release();

    // The raw token would be emailed in production. Returned here so the flow is
    // usable/testable without a mail server. An activation URL is illustrative.
    res.status(201).json({
      success: true,
      data: {
        employeeId, accountId,
        activation: { token: raw, expiresInHours: INVITE_TTL_HOURS, url: `/hr/activate?token=${raw}` },
      },
      message: 'Employee provisioned. Send the activation link to the employee.',
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'An employee with that email already exists.' });
    next(err);
  }
}

// GET /api/hr/employees — scope-filtered, field-filtered list.
export async function listEmployees(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope);
    const [rows] = await pool.query(
      `SELECT id, name, role, work_email, employee_code, manager_id, hr_status, monthly_salary, engagement_state
         FROM employees WHERE ${sql} ORDER BY id ASC`,
      params
    );
    const data = rows.map((r) => filterFields(r, req.actor));
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}

// GET /api/hr/employees/:id — 403 if outside the caller's scope (IDOR guard).
export async function getEmployee(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope);
    const [[row]] = await pool.query(
      `SELECT id, name, role, work_email, employee_code, manager_id, hr_status, monthly_salary, engagement_state
         FROM employees WHERE id = ? AND (${sql})`,
      [req.params.id, ...params]
    );
    if (!row) return res.status(403).json({ success: false, message: 'Forbidden' }); // outside scope OR not found — same response
    res.json({ success: true, data: filterFields(row, req.actor) });
  } catch (err) {
    next(err);
  }
}

// PUT /api/hr/accounts/:id/role — reassign role, bump token_version.
export async function assignRole(req, res, next) {
  try {
    const { role } = req.body || {};
    const [[roleRow]] = await pool.query('SELECT id, name FROM roles WHERE name = ?', [role]);
    if (!roleRow) return res.status(400).json({ success: false, message: `Unknown role: ${role}` });

    const [[account]] = await pool.query('SELECT a.*, r.name AS role_name FROM hr_accounts a JOIN roles r ON r.id = a.role_id WHERE a.id = ?', [req.params.id]);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found.' });

    await pool.query('UPDATE hr_accounts SET role_id = ?, token_version = token_version + 1 WHERE id = ?', [roleRow.id, account.id]);
    await writeAudit(pool, { ...auditCtx(req), action: 'ROLE_ASSIGNED', entityType: 'hr_account', entityId: account.id, before: { role: account.role_name }, after: { role: roleRow.name } });
    res.json({ success: true, message: `Role changed to ${roleRow.name}.` });
  } catch (err) {
    next(err);
  }
}

// POST /api/hr/employees/:id/deactivate — offboarding: never a DELETE.
export async function deactivateEmployee(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const [[emp]] = await conn.query('SELECT id, hr_status FROM employees WHERE id = ?', [req.params.id]);
    if (!emp) { conn.release(); return res.status(404).json({ success: false, message: 'Employee not found.' }); }

    await conn.beginTransaction();
    await conn.query("UPDATE employees SET hr_status = 'terminated' WHERE id = ?", [emp.id]);
    await conn.query("UPDATE hr_accounts SET status = 'DEACTIVATED', token_version = token_version + 1 WHERE employee_id = ?", [emp.id]);
    await writeAudit(conn, { ...auditCtx(req), action: 'EMPLOYEE_DEACTIVATED', entityType: 'employee', entityId: emp.id, before: { hr_status: emp.hr_status }, after: { hr_status: 'terminated' } });
    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Employee offboarded; access revoked. Records retained.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
}

// POST /api/hr/accounts/:id/reset-password — admin path: re-invite (HR never sets it).
export async function adminResetPassword(req, res, next) {
  try {
    const [[account]] = await pool.query('SELECT id FROM hr_accounts WHERE id = ?', [req.params.id]);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found.' });

    const { raw, hash } = generateToken();
    await pool.query(
      `INSERT INTO hr_invitations (account_id, token_hash, purpose, expires_at)
       VALUES (?, ?, 'RESET', DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [account.id, hash]
    );
    // Force re-auth of existing sessions and require re-activation.
    await pool.query("UPDATE hr_accounts SET status = 'PENDING_ACTIVATION', password_hash = NULL, token_version = token_version + 1 WHERE id = ?", [account.id]);
    await writeAudit(pool, { ...auditCtx(req), action: 'PASSWORD_RESET_ADMIN', entityType: 'hr_account', entityId: account.id });
    res.json({ success: true, message: 'Reset issued. Send the activation link to the employee.', data: { token: raw } });
  } catch (err) {
    next(err);
  }
}

// GET /api/hr/audit — read the audit trail (audit.read).
export async function readAudit(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      'SELECT id, actor_id, actor_role, action, entity_type, entity_id, ip_address, created_at FROM hr_audit_log ORDER BY id DESC LIMIT ?',
      [limit]
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}
