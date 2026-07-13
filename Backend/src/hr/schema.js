// Creates the HR/EMS tables (MySQL) and seeds roles, the permission matrix,
// a bootstrap Super Admin, and default leave types. Idempotent. Adapted from
// the paper's PostgreSQL schema (BIGSERIAL→AUTO_INCREMENT, JSONB→JSON,
// TIMESTAMPTZ→TIMESTAMP, BYTEA→VARBINARY, recursive-CTE scope→app predicate).
import { ROLES, ROLE_RANK, PERMISSIONS, ROLE_MATRIX } from './rbac.js';
import { hashPassword } from './password.js';

export async function ensureHrSchema(conn) {
  // --- Extend the existing employees table with HR master fields (nullable) ---
  await addColumnIfMissing(conn, 'employees', 'employee_code', "VARCHAR(20) NULL UNIQUE");
  await addColumnIfMissing(conn, 'employees', 'work_email', "VARCHAR(160) NULL UNIQUE");
  await addColumnIfMissing(conn, 'employees', 'manager_id', 'INT UNSIGNED NULL');
  await addColumnIfMissing(conn, 'employees', 'hr_status',
    "ENUM('active','on_leave','suspended','terminated') NOT NULL DEFAULT 'active'");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(30) NOT NULL UNIQUE,
      rank SMALLINT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(60) NOT NULL UNIQUE,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       BIGINT UNSIGNED NOT NULL,
      permission_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // Login accounts — one-to-one with an employee (identity separated from person).
  await conn.query(`
    CREATE TABLE IF NOT EXISTS hr_accounts (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id    INT UNSIGNED NOT NULL UNIQUE,
      email          VARCHAR(160) NOT NULL UNIQUE,
      password_hash  TEXT NULL,
      role_id        BIGINT UNSIGNED NOT NULL,
      status         ENUM('PENDING_ACTIVATION','ACTIVE','LOCKED','SUSPENDED','DEACTIVATED')
                       NOT NULL DEFAULT 'PENDING_ACTIVATION',
      mfa_secret_enc VARBINARY(255) NULL,
      mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
      failed_attempts SMALLINT NOT NULL DEFAULT 0,
      locked_until   TIMESTAMP NULL,
      token_version  INT NOT NULL DEFAULT 1,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      last_login_at  TIMESTAMP NULL,
      created_by     BIGINT UNSIGNED NULL,
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS hr_invitations (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      purpose    ENUM('ACTIVATION','RESET') NOT NULL DEFAULT 'ACTIVATION',
      expires_at TIMESTAMP NOT NULL,
      used_at    TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_inv_hash (token_hash),
      FOREIGN KEY (account_id) REFERENCES hr_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // Append-only audit log (Section 6.4 / 9.2). The app never issues UPDATE/DELETE
  // against it; a hardened deployment also REVOKEs those from the DB user.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS hr_audit_log (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      actor_id     BIGINT UNSIGNED NULL,
      actor_role   VARCHAR(30) NOT NULL,
      action       VARCHAR(60) NOT NULL,
      entity_type  VARCHAR(40) NOT NULL,
      entity_id    BIGINT NULL,
      before_state JSON NULL,
      after_state  JSON NULL,
      ip_address   VARCHAR(45) NULL,
      user_agent   TEXT NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_audit_actor (actor_id),
      INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // --- Leave module ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS leave_types (
      id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name              VARCHAR(40) NOT NULL,
      annual_quota      DECIMAL(5,1) NOT NULL,
      accrual_method    ENUM('MONTHLY','ANNUAL','NONE') NOT NULL DEFAULT 'ANNUAL',
      carry_forward_max DECIMAL(5,1) NOT NULL DEFAULT 0,
      allow_negative    BOOLEAN NOT NULL DEFAULT FALSE,
      requires_document BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS leave_balances (
      employee_id   INT UNSIGNED NOT NULL,
      leave_type_id BIGINT UNSIGNED NOT NULL,
      year          SMALLINT NOT NULL,
      entitled      DECIMAL(5,1) NOT NULL,
      used          DECIMAL(5,1) NOT NULL DEFAULT 0,
      pending       DECIMAL(5,1) NOT NULL DEFAULT 0,
      PRIMARY KEY (employee_id, leave_type_id, year),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id   INT UNSIGNED NOT NULL,
      leave_type_id BIGINT UNSIGNED NOT NULL,
      start_date    DATE NOT NULL,
      end_date      DATE NOT NULL,
      days          DECIMAL(4,1) NOT NULL,
      reason        TEXT NULL,
      status        ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
      approver_id   BIGINT UNSIGNED NULL,
      decided_at    TIMESTAMP NULL,
      decision_note TEXT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_leave_emp (employee_id, status),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (leave_type_id) REFERENCES leave_types(id),
      CHECK (end_date >= start_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await seedRolesAndPermissions(conn);
  await seedLeaveTypes(conn);
  await seedBootstrapSuperAdmin(conn);
}

async function addColumnIfMissing(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows[0].c === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function seedRolesAndPermissions(conn) {
  for (const name of ROLES) {
    await conn.query('INSERT IGNORE INTO roles (name, rank) VALUES (?, ?)', [name, ROLE_RANK[name]]);
  }
  for (const code of PERMISSIONS) {
    await conn.query('INSERT IGNORE INTO permissions (code) VALUES (?)', [code]);
  }
  const [roleRows] = await conn.query('SELECT id, name FROM roles');
  const [permRows] = await conn.query('SELECT id, code FROM permissions');
  const roleId = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));
  const permId = Object.fromEntries(permRows.map((p) => [p.code, p.id]));

  // Rebuild the matrix authoritatively from ROLE_MATRIX.
  await conn.query('DELETE FROM role_permissions');
  for (const role of ROLES) {
    for (const code of ROLE_MATRIX[role]) {
      if (permId[code]) {
        await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleId[role], permId[code]]);
      }
    }
  }
}

async function seedLeaveTypes(conn) {
  const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM leave_types');
  if (c > 0) return;
  const types = [
    ['Casual', 12, 'MONTHLY', 6, false, false],
    ['Sick', 10, 'ANNUAL', 0, false, true],
    ['Earned', 18, 'MONTHLY', 30, false, false],
  ];
  for (const t of types) {
    await conn.query(
      'INSERT INTO leave_types (name, annual_quota, accrual_method, carry_forward_max, allow_negative, requires_document) VALUES (?, ?, ?, ?, ?, ?)',
      t
    );
  }
}

// Bootstrap Super Admin (Section 6.2 note on the NULL-creator anomaly): the one
// account with created_by = NULL, established from env, so the system has an
// initial identity that can then provision everyone else.
async function seedBootstrapSuperAdmin(conn) {
  const email = process.env.HR_BOOTSTRAP_EMAIL || 'superadmin@bitwix.co.in';
  const password = process.env.HR_BOOTSTRAP_PASSWORD || 'ChangeMe-superadmin-123';

  const [[existing]] = await conn.query('SELECT id FROM hr_accounts WHERE email = ?', [email]);
  if (existing) return;

  const [[role]] = await conn.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN'");

  // Ensure an employee master row exists for the bootstrap admin.
  let [[emp]] = await conn.query('SELECT id FROM employees WHERE work_email = ?', [email]);
  if (!emp) {
    const [r] = await conn.query(
      `INSERT INTO employees (name, role, work_email, employee_code, hr_status)
       VALUES (?, ?, ?, ?, 'active')`,
      ['System Administrator', 'Super Admin', email, 'EMP-0001']
    );
    emp = { id: r.insertId };
  }

  await conn.query(
    `INSERT INTO hr_accounts (employee_id, email, password_hash, role_id, status, created_by)
     VALUES (?, ?, ?, ?, 'ACTIVE', NULL)`,
    [emp.id, email, hashPassword(password), role.id]
  );
  console.log(`Seeded bootstrap Super Admin: ${email}`);
}
