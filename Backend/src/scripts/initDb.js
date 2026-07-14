// Creates the database + tables and seeds the services/team content.
// Usage: npm run db:init  (CLI)  — or imported and called as initializeDatabase()
// e.g. the server runs it on boot when RUN_DB_INIT=true (first deploy on RDS).
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { pathToFileURL } from 'url';
import { ensureHrSchema } from '../hr/schema.js';
import { ensureCrmSchema } from '../crm/schema.js';
import { ensureFmsSchema } from '../fms/schema.js';

dotenv.config();

// Optional TLS for managed databases (RDS). Mirrors src/config/db.js.
const dbSsl = process.env.DB_SSL === 'true'
  ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
  : {};

const DB_NAME = process.env.DB_NAME || 'bitwix';

const services = [
  {
    title: 'Website Development',
    description:
      'Create stunning, responsive websites that captivate your audience and drive business growth.',
    icon: 'Monitor',
    features: [
      'Responsive Design',
      'E-commerce Solutions',
      'Content Management Systems',
      'SEO Optimization',
      'Performance Optimization',
      'Custom Web Applications',
    ],
    sort_order: 1,
  },
  {
    title: 'Android App Development',
    description:
      'Build powerful Android applications that deliver exceptional user experiences and functionality.',
    icon: 'Smartphone',
    features: [
      'Native Android Apps',
      'Cross-Platform Solutions',
      'UI/UX Design',
      'API Integration',
      'App Store Deployment',
      'Maintenance & Support',
    ],
    sort_order: 2,
  },
];

const team = [
  {
    name: 'Amruta Shejul',
    role: 'Managing Director & Founder',
    description:
      'Co-founder and Managing Director of Bitwix Technologies, driving the company vision, strategy, and growth. Leads operations and client partnerships to deliver reliable digital solutions.',
    image_url: null, // upload a photo from the admin console; shows initials until then
    skills: ['Business Strategy', 'Leadership', 'Operations', 'Client Partnerships'],
    phone: '+91-8261861224',
    email: 'support@bitwix.co.in',
    sort_order: 1,
  },
  {
    name: 'Sarita Palakudetwar',
    role: 'CEO & Co-Founder',
    description:
      'Chief Executive Officer and Co-Founder of Bitwix Technologies, setting the strategic direction and driving the company growth, partnerships, and client success.',
    image_url: null,
    skills: ['Leadership', 'Strategy', 'Business Development', 'Client Success'],
    phone: '+91-8261861224',
    email: 'support@bitwix.co.in',
    sort_order: 2,
  },
];

export async function initializeDatabase() {
  // Connect WITHOUT a database first so we can create it.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    ...dbSsl,
  });

  // Opt-in CLEAN RESET: drop the entire database first so init rebuilds it from
  // scratch with only the required data. Destructive — pre-production use only.
  // Set RUN_DB_RESET=true for ONE deploy, then set it back to false.
  if (process.env.RUN_DB_RESET === 'true') {
    console.warn(`⚠️  RUN_DB_RESET=true — DROPPING database "${DB_NAME}" for a clean install.`);
    await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\`;`);
  }

  console.log(`Creating database "${DB_NAME}" (if it does not exist)...`);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await conn.changeUser({ database: DB_NAME });

  console.log('Creating tables...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name        VARCHAR(120)  NOT NULL,
      email       VARCHAR(180)  NOT NULL,
      phone       VARCHAR(40)   NULL,
      subject     VARCHAR(200)  NULL,
      message     TEXT          NOT NULL,
      status      ENUM('new','read','archived') NOT NULL DEFAULT 'new',
      ip_address  VARCHAR(45)   NULL,
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_contact_created_at (created_at),
      INDEX idx_contact_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS services (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title       VARCHAR(150) NOT NULL,
      description TEXT         NOT NULL,
      icon        VARCHAR(60)  NULL,
      features    JSON         NULL,
      sort_order  INT          NOT NULL DEFAULT 0,
      is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name        VARCHAR(120) NOT NULL,
      role        VARCHAR(120) NOT NULL,
      description TEXT         NULL,
      image_url   VARCHAR(500) NULL,
      skills      JSON         NULL,
      phone       VARCHAR(40)  NULL,
      email       VARCHAR(180) NULL,
      sort_order  INT          NOT NULL DEFAULT 0,
      is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // --- Project Management module tables ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name          VARCHAR(180) NOT NULL,
      client_name   VARCHAR(180) NULL,
      description   TEXT         NULL,
      bac           DECIMAL(14,2) NULL,
      start_date    DATE         NULL,
      deadline_days INT UNSIGNED NULL,
      status        ENUM('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_projects_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_activities (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id   INT UNSIGNED NOT NULL,
      code         VARCHAR(20)  NOT NULL,
      name         VARCHAR(200) NOT NULL,
      optimistic   DECIMAL(8,2) NOT NULL,
      most_likely  DECIMAL(8,2) NOT NULL,
      pessimistic  DECIMAL(8,2) NOT NULL,
      sort_order   INT          NOT NULL DEFAULT 0,
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_activity_code (project_id, code),
      CONSTRAINT fk_activity_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS activity_dependencies (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      activity_id    INT UNSIGNED NOT NULL,
      predecessor_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_dependency (activity_id, predecessor_id),
      CONSTRAINT fk_dep_activity FOREIGN KEY (activity_id) REFERENCES project_activities (id) ON DELETE CASCADE,
      CONSTRAINT fk_dep_predecessor FOREIGN KEY (predecessor_id) REFERENCES project_activities (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS evm_snapshots (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id    INT UNSIGNED NOT NULL,
      status_date   DATE          NOT NULL,
      planned_value DECIMAL(14,2) NOT NULL,
      earned_value  DECIMAL(14,2) NOT NULL,
      actual_cost   DECIMAL(14,2) NOT NULL,
      note          VARCHAR(255)  NULL,
      created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_evm_project_date (project_id, status_date),
      CONSTRAINT fk_evm_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Seed services/team only if the tables are empty (idempotent).
  const [[svcCount]] = await conn.query('SELECT COUNT(*) AS c FROM services;');
  if (svcCount.c === 0) {
    console.log('Seeding services...');
    for (const s of services) {
      await conn.query(
        'INSERT INTO services (title, description, icon, features, sort_order) VALUES (?, ?, ?, ?, ?)',
        [s.title, s.description, s.icon, JSON.stringify(s.features), s.sort_order]
      );
    }
  }

  // Team is refreshed from the seed on every init, so content edits go live by
  // redeploying the backend once with RUN_DB_INIT=true.
  console.log('Syncing team members...');
  await conn.query('DELETE FROM team_members;');
  for (const m of team) {
    await conn.query(
      'INSERT INTO team_members (name, role, description, image_url, skills, phone, email, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [m.name, m.role, m.description, m.image_url, JSON.stringify(m.skills), m.phone, m.email, m.sort_order]
    );
  }

  // --- Employee Management module tables ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name            VARCHAR(120) NOT NULL,
      role            VARCHAR(120) NULL,
      skills          JSON         NULL,
      monthly_salary  DECIMAL(12,2) NULL,
      utilization     DECIMAL(5,2) NULL,          -- percent billable (0-100)
      engagement_state ENUM('engaged','at_risk','departed') NOT NULL DEFAULT 'engaged',
      created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_employees_state (engagement_state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS assignment_scenarios (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name         VARCHAR(180) NOT NULL,
      agents       JSON         NOT NULL,          -- ["Ava", ...]
      tasks        JSON         NOT NULL,          -- ["Auth", ...]
      cost_matrix  JSON         NOT NULL,          -- [[9,11,14], ...]
      mode         ENUM('min','max') NOT NULL DEFAULT 'min',
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS retention_scenarios (
      id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name               VARCHAR(180) NOT NULL,
      states             JSON         NOT NULL,    -- ["Engaged","At-Risk","Departed"]
      transition_matrix  JSON         NOT NULL,    -- [[...], ...]
      intervention_matrix JSON        NULL,        -- optional what-if matrix
      initial_vector     JSON         NOT NULL,    -- [100, 0, 0]
      horizon            INT UNSIGNED NOT NULL DEFAULT 6,
      created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // --- Financial Management module tables ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS lp_scenarios (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name        VARCHAR(180) NOT NULL,
      objective   JSON         NOT NULL,          -- { coeffs:[], labels:[] }
      constraints JSON         NOT NULL,          -- [{ coeffs:[], op, rhs, label }]
      sense       ENUM('max','min') NOT NULL DEFAULT 'max',
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS investments (
      id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name               VARCHAR(180) NOT NULL,
      initial_investment DECIMAL(14,2) NOT NULL,
      cash_flows         JSON         NOT NULL,   -- [90000, 90000, ...]
      discount_rate      DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
      created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS service_lines (
      id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name             VARCHAR(180) NOT NULL,
      fixed_cost       DECIMAL(14,2) NOT NULL,
      price            DECIMAL(12,2) NOT NULL,
      variable_cost    DECIMAL(12,2) NOT NULL,
      periods_per_year INT          NOT NULL DEFAULT 1,
      created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // --- Client Management module tables ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name           VARCHAR(180) NOT NULL,
      annual_margin  DECIMAL(14,2) NOT NULL DEFAULT 0,
      retention_rate DECIMAL(5,4)  NOT NULL DEFAULT 0.8500,
      discount_rate  DECIMAL(6,4)  NOT NULL DEFAULT 0.1000,
      strategic_score TINYINT      NOT NULL DEFAULT 3,      -- 1..5 reference/growth value
      notes          VARCHAR(255)  NULL,
      created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS queue_scenarios (
      id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name             VARCHAR(180) NOT NULL,
      arrival_rate     DECIMAL(10,4) NOT NULL,   -- lambda, per hour
      service_rate     DECIMAL(10,4) NOT NULL,   -- mu, per hour per agent
      servers          INT          NOT NULL DEFAULT 1,
      target_wait_prob DECIMAL(5,4) NULL,        -- SLA: max acceptable P(wait)
      created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Clean install: NO demo/example data is seeded. The OR analytics tools
  // (projects, employee roster, financial + client scenarios) start empty — add
  // your own records through the admin console.

  // Employee Management System (RBAC / HR) tables, matrix seed, bootstrap admin.
  console.log('Setting up HR / RBAC schema...');
  await ensureHrSchema(conn);

  // CRM (dual-plane) tables + bootstrap internal Super Admin.
  console.log('Setting up CRM schema...');
  await ensureCrmSchema(conn);

  // Financial Management System — double-entry ledger, chart of accounts,
  // cost centers, and the open fiscal period.
  console.log('Setting up FMS (ledger) schema...');
  await ensureFmsSchema(conn);

  // One-off cleanup: remove the OR demo employees (Ava/Ben/Cara/Dev/Ella/Farin)
  // that were seeded before the clean-system change. Guarded, FK-safe, and only
  // touches demo rows that were never turned into HR login accounts — real
  // provisioned employees are left untouched.
  if (process.env.PURGE_DEMO_EMPLOYEES === 'true') {
    const demoNames = ['Ava Sharma', 'Ben Torres', 'Cara Lin', 'Dev Patel', 'Ella Novak', 'Farin Rao'];
    const [rows] = await conn.query(
      `SELECT e.id FROM employees e LEFT JOIN hr_accounts a ON a.employee_id = e.id
        WHERE e.name IN (${demoNames.map(() => '?').join(',')}) AND a.id IS NULL`,
      demoNames
    );
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const inC = ids.map(() => '?').join(',');
      await conn.query(`DELETE FROM payroll_lines WHERE employee_id IN (${inC})`, ids);
      await conn.query(`DELETE FROM leave_requests WHERE employee_id IN (${inC})`, ids);
      await conn.query(`DELETE FROM leave_balances WHERE employee_id IN (${inC})`, ids);
      await conn.query(`DELETE FROM employees WHERE id IN (${inC})`, ids);
      console.log(`Purged ${ids.length} demo employee(s).`);
    }
  }

  await conn.end();
  console.log('\n✅ Database initialized successfully.');
}

// Run automatically only when executed directly (npm run db:init), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  initializeDatabase().catch((err) => {
    console.error('\n❌ Database initialization failed:', err.message);
    process.exit(1);
  });
}
