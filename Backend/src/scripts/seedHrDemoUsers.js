// Create labelled DUMMY HR accounts with KNOWN passwords, for testing the HR
// console across all roles. This deliberately bypasses the normal provisioning
// flow (which is invite-link based and never sets a password) — it is for test
// data only. Emails use the @bitwix.test domain so they never collide with real
// @bitwix.co.in accounts.
//
// Two ways to run:
//   1) On boot (private RDS): set SEED_HR_DEMO=true (or PURGE_HR_DEMO=true) in
//      the App Runner env and redeploy — server.js invokes this once, then set
//      the flag back to false.
//   2) CLI, if the DB is reachable from where you run it:
//        node src/scripts/seedHrDemoUsers.js           # create / refresh
//        node src/scripts/seedHrDemoUsers.js --purge    # remove them
//
// The credentials it creates are fixed and documented below.
import 'dotenv/config';
import { pool } from '../config/db.js';
import { hashPassword } from '../hr/password.js';

export const DEMO_HR_USERS = [
  { role: 'HR_ADMIN', name: 'Dummy HR Admin', email: 'hr.admin@bitwix.test', code: 'DUMMY-HRA', password: 'HrAdmin@2026', department: 'Human Resources', designation: 'HR Administrator' },
  { role: 'HR_EXEC', name: 'Dummy HR Exec', email: 'hr.exec@bitwix.test', code: 'DUMMY-HRE', password: 'HrExec@2026', department: 'Human Resources', designation: 'HR Executive' },
  { role: 'MANAGER', name: 'Dummy Manager', email: 'manager@bitwix.test', code: 'DUMMY-MGR', password: 'Manager@2026', department: 'Delivery', designation: 'Team Manager' },
  { role: 'EMPLOYEE', name: 'Dummy Employee', email: 'employee@bitwix.test', code: 'DUMMY-EMP', password: 'Employee@2026', department: 'Engineering', designation: 'Software Engineer' },
];

async function roleId(conn, name) {
  const [[r]] = await conn.query('SELECT id FROM roles WHERE name = ?', [name]);
  if (!r) throw new Error(`Role ${name} not found — initialise the HR schema first (RUN_DB_INIT).`);
  return r.id;
}

// Best-effort master fields — columns may be absent on a pre-migration schema.
async function setMasterFields(conn, empId, d) {
  try {
    await conn.query(
      'UPDATE employees SET department = ?, date_of_joining = COALESCE(date_of_joining, CURDATE()), monthly_salary = COALESCE(monthly_salary, ?) WHERE id = ?',
      [d.department, 100000, empId]
    );
  } catch { /* older schema without these columns — ignore */ }
}

export async function seedHrDemoUsers(db) {
  const conn = await db.getConnection();
  const created = [];
  try {
    const idByRole = {};
    for (const d of DEMO_HR_USERS) {
      const rid = await roleId(conn, d.role);

      let [[emp]] = await conn.query('SELECT id FROM employees WHERE work_email = ?', [d.email]);
      if (!emp) {
        const [r] = await conn.query(
          "INSERT INTO employees (name, role, work_email, employee_code, hr_status) VALUES (?, ?, ?, ?, 'active')",
          [d.name, d.designation, d.email, d.code]
        );
        emp = { id: r.insertId };
      } else {
        await conn.query("UPDATE employees SET hr_status = 'active' WHERE id = ?", [emp.id]);
      }
      await setMasterFields(conn, emp.id, d);
      idByRole[d.role] = emp.id;

      const hash = hashPassword(d.password);
      const [[acct]] = await conn.query('SELECT id FROM hr_accounts WHERE email = ?', [d.email]);
      if (acct) {
        await conn.query(
          "UPDATE hr_accounts SET password_hash = ?, role_id = ?, status = 'ACTIVE', failed_attempts = 0, locked_until = NULL, must_change_password = 0, token_version = token_version + 1 WHERE id = ?",
          [hash, rid, acct.id]
        );
      } else {
        await conn.query(
          "INSERT INTO hr_accounts (employee_id, email, password_hash, role_id, status, must_change_password, created_by) VALUES (?, ?, ?, ?, 'ACTIVE', 0, NULL)",
          [emp.id, d.email, hash, rid]
        );
      }
      created.push({ role: d.role, email: d.email, password: d.password });
    }

    // Link the dummy employee under the dummy manager so leave-approval scope is testable.
    if (idByRole.EMPLOYEE && idByRole.MANAGER) {
      await conn.query('UPDATE employees SET manager_id = ? WHERE id = ?', [idByRole.MANAGER, idByRole.EMPLOYEE]);
    }
    return created;
  } finally {
    conn.release();
  }
}

export async function purgeHrDemoUsers(db) {
  const conn = await db.getConnection();
  try {
    for (const d of DEMO_HR_USERS) {
      // Clear the manager link first so the FK on employees.manager_id can't block deletes.
      await conn.query('UPDATE employees SET manager_id = NULL WHERE work_email = ?', [d.email]);
    }
    for (const d of DEMO_HR_USERS) {
      await conn.query('DELETE FROM hr_accounts WHERE email = ?', [d.email]);
      await conn.query('DELETE FROM employees WHERE work_email = ?', [d.email]);
    }
  } finally {
    conn.release();
  }
}

function printCreds(rows) {
  console.log('\n=== DUMMY HR CREDENTIALS (test only — login at /hr/login) ===');
  console.log('ROLE'.padEnd(11) + 'LOGIN EMAIL'.padEnd(26) + 'PASSWORD');
  for (const r of rows) console.log(r.role.padEnd(11) + r.email.padEnd(26) + r.password);
  console.log('Remove later with: node src/scripts/seedHrDemoUsers.js --purge\n');
}

// CLI entry — only when invoked directly, not when imported by server.js.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/seedHrDemoUsers.js')) {
  const purge = process.argv.includes('--purge');
  (async () => {
    try {
      if (purge) { await purgeHrDemoUsers(pool); console.log('Dummy HR users removed.'); }
      else { printCreds(await seedHrDemoUsers(pool)); }
    } catch (e) {
      console.error('seedHrDemoUsers failed:', e.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
