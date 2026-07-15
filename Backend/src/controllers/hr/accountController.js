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
    const { name, work_email, role = 'EMPLOYEE', manager_id, employee_code, designation, department, date_of_joining, monthly_salary } = req.body || {};
    if (!name || !name.trim()) { conn.release(); return res.status(400).json({ success: false, errors: { name: 'Name is required.' } }); }
    if (!work_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(work_email)) { conn.release(); return res.status(400).json({ success: false, errors: { work_email: 'A valid work email is required.' } }); }
    // Salary may only be set by SUPER_ADMIN / HR_ADMIN (field-level rule, Section 8.3).
    let salaryVal = null;
    if (monthly_salary != null && monthly_salary !== '' && ['SUPER_ADMIN', 'HR_ADMIN'].includes(req.actor.role)) {
      const s = Number(monthly_salary);
      if (!Number.isFinite(s) || s < 0 || s > 9999999999.99) { conn.release(); return res.status(422).json({ success: false, message: 'Invalid salary amount.' }); }
      salaryVal = s;
    }
    const joining = date_of_joining || new Date().toISOString().slice(0, 10);

    const [[roleRow]] = await conn.query('SELECT id, name FROM roles WHERE name = ?', [role]);
    if (!roleRow) { conn.release(); return res.status(400).json({ success: false, message: `Unknown role: ${role}` }); }

    await conn.beginTransaction();

    const [empResult] = await conn.query(
      `INSERT INTO employees (name, role, work_email, manager_id, employee_code, department, monthly_salary, date_of_joining, hr_status, engagement_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'engaged')`,
      [name.trim(), designation || role, work_email.trim(), manager_id || null, employee_code || null, department || null, salaryVal, joining]
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

// GET /api/hr/employees — scope-filtered, field-filtered list. Joins the login
// account so the console can drive role-assignment / password-reset (both keyed
// on the hr_accounts id, not the employee id).
export async function listEmployees(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope, { idCol: 'e.id', mgrCol: 'e.manager_id' });
    const [rows] = await pool.query(
      `SELECT e.id, e.name, e.role, e.work_email, e.employee_code, e.manager_id, e.hr_status,
              e.monthly_salary, e.engagement_state, e.department, e.date_of_joining, e.date_of_exit,
              a.id AS account_id, a.status AS account_status, ar.name AS account_role
         FROM employees e
         LEFT JOIN hr_accounts a ON a.employee_id = e.id
         LEFT JOIN roles ar ON ar.id = a.role_id
        WHERE ${sql} ORDER BY e.id ASC`,
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
      `SELECT id, name, role, work_email, employee_code, manager_id, hr_status, monthly_salary, engagement_state,
              department, date_of_joining, date_of_exit
         FROM employees WHERE id = ? AND (${sql})`,
      [req.params.id, ...params]
    );
    if (!row) return res.status(403).json({ success: false, message: 'Forbidden' }); // outside scope OR not found — same response
    res.json({ success: true, data: filterFields(row, req.actor) });
  } catch (err) {
    next(err);
  }
}

// GET /api/hr/employees/:id/payslips — finalized payroll lines for an employee,
// newest first. Salary data: only the employee themselves (SELF) or an HR Admin /
// Super Admin may read it (field-level rule).
export async function getEmployeePayslips(req, res, next) {
  try {
    const id = Number(req.params.id);
    const isSelf = Number(req.actor.employeeId) === id;
    if (!isSelf && !['SUPER_ADMIN', 'HR_ADMIN'].includes(req.actor.role)) {
      return res.status(403).json({ success: false, message: 'Not permitted to view these payslips.' });
    }
    const [rows] = await pool.query(
      `SELECT pl.run_id, pr.label, pr.status, pr.je_ref, pl.gross, pl.tax, pl.net, pl.cost_center
         FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
        WHERE pl.employee_id = ? AND pr.status IN ('APPROVED', 'POSTED')
        ORDER BY pr.label DESC, pr.id DESC`,
      [id]
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
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
    await conn.query("UPDATE employees SET hr_status = 'terminated', date_of_exit = COALESCE(date_of_exit, CURDATE()) WHERE id = ?", [emp.id]);
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

// PUT /api/hr/employees/:id — maintain HR master data (salary feed, department,
// joining/exit dates, designation). Scope-guarded; salary edits are SUPER_ADMIN/
// HR_ADMIN only (field-level rule).
export async function updateEmployee(req, res, next) {
  try {
    const { sql, params } = scopeToSql(req.scope);
    const [[emp]] = await pool.query(`SELECT id FROM employees WHERE id = ? AND (${sql})`, [req.params.id, ...params]);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const b = req.body || {};
    const sets = [];
    const vals = [];
    if (b.designation !== undefined) { sets.push('role = ?'); vals.push(String(b.designation).slice(0, 120)); }
    if (b.department !== undefined) { sets.push('department = ?'); vals.push(b.department || null); }
    if (b.date_of_joining !== undefined) { sets.push('date_of_joining = ?'); vals.push(b.date_of_joining || null); }
    if (b.date_of_exit !== undefined) { sets.push('date_of_exit = ?'); vals.push(b.date_of_exit || null); }
    if (b.monthly_salary !== undefined) {
      if (!['SUPER_ADMIN', 'HR_ADMIN'].includes(req.actor.role)) return res.status(403).json({ success: false, message: 'Only HR Admin may change salary.' });
      if (b.monthly_salary === null || b.monthly_salary === '') { sets.push('monthly_salary = NULL'); }
      else {
        const s = Number(b.monthly_salary);
        if (!Number.isFinite(s) || s < 0 || s > 9999999999.99) return res.status(422).json({ success: false, message: 'Invalid salary amount.' });
        sets.push('monthly_salary = ?'); vals.push(s);
      }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'Nothing to update.' });

    vals.push(emp.id);
    await pool.query(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, vals);
    await writeAudit(pool, { ...auditCtx(req), action: 'EMPLOYEE_UPDATED', entityType: 'employee', entityId: emp.id, after: { fields: sets.map((s) => s.split(' ')[0]) } });
    res.json({ success: true, message: 'Employee updated.' });
  } catch (err) { next(err); }
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

// GET /api/hr/settings — company document settings (used to render offer letters).
export async function getHrSettings(req, res, next) {
  try {
    const [[row]] = await pool.query('SELECT * FROM hr_settings WHERE id = 1');
    res.json({ success: true, data: row || {} });
  } catch (err) { next(err); }
}

// PUT /api/hr/settings — update company document settings (HR Admin / Super Admin).
export async function updateHrSettings(req, res, next) {
  try {
    const b = req.body || {};
    const num = (v, d) => (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
    const dec = (v, d) => (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) / 100 : d);
    const str = (v) => (v == null || v === '' ? null : String(v).slice(0, 250));
    await pool.query(
      `INSERT INTO hr_settings
         (id, signatory_name, signatory_designation, probation_months, notice_probation_days, notice_confirmed_days, work_location, work_hours, governing_city, offer_validity_days, company_address, basic_pct, hra_pct, pf_rate_pct, pf_wage_ceiling, professional_tax, gratuity_pct)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         signatory_name=VALUES(signatory_name), signatory_designation=VALUES(signatory_designation),
         probation_months=VALUES(probation_months), notice_probation_days=VALUES(notice_probation_days),
         notice_confirmed_days=VALUES(notice_confirmed_days), work_location=VALUES(work_location),
         work_hours=VALUES(work_hours), governing_city=VALUES(governing_city),
         offer_validity_days=VALUES(offer_validity_days), company_address=VALUES(company_address),
         basic_pct=VALUES(basic_pct), hra_pct=VALUES(hra_pct), pf_rate_pct=VALUES(pf_rate_pct),
         pf_wage_ceiling=VALUES(pf_wage_ceiling), professional_tax=VALUES(professional_tax),
         gratuity_pct=VALUES(gratuity_pct)`,
      [
        str(b.signatory_name), str(b.signatory_designation), num(b.probation_months, 3),
        num(b.notice_probation_days, 15), num(b.notice_confirmed_days, 60), str(b.work_location),
        str(b.work_hours), str(b.governing_city), num(b.offer_validity_days, 7), str(b.company_address),
        num(b.basic_pct, 46), num(b.hra_pct, 40), num(b.pf_rate_pct, 12), num(b.pf_wage_ceiling, 15000), num(b.professional_tax, 200),
        dec(b.gratuity_pct, 4.81),
      ]
    );
    await writeAudit(pool, { ...auditCtx(req), action: 'HR_SETTINGS_UPDATED', entityType: 'hr_settings', entityId: 1 });
    res.json({ success: true, message: 'Settings saved.' });
  } catch (err) { next(err); }
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
