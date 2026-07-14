// Financial Management System schema (MySQL 8). Adapted from the paper's
// PostgreSQL DDL: BIGSERIAL→AUTO_INCREMENT, NUMERIC→DECIMAL, TIMESTAMPTZ→
// TIMESTAMP. The paper's DEFERRABLE balance trigger and REVOKE-based immutability
// are not available in MySQL, so those invariants are enforced by the posting
// engine (Σ DR = Σ CR checked in-transaction; append-only by never issuing
// UPDATE/DELETE against posted rows — only reversal). maker≠checker IS a CHECK
// constraint. Tables are namespaced (gl_*, fms_*) to avoid colliding with the
// CRM's `accounts`/`invoices`/`contacts`.
import { CHART, NORMAL_SIDE } from './accounts.js';

export async function ensureFmsSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS gl_accounts (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code         VARCHAR(12) NOT NULL UNIQUE,
      name         VARCHAR(120) NOT NULL,
      account_type ENUM('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL,
      normal_side  ENUM('DR','CR') NOT NULL,
      parent_id    BIGINT UNSIGNED NULL,
      is_postable  BOOLEAN NOT NULL DEFAULT TRUE,
      active       BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code     VARCHAR(20) NOT NULL UNIQUE,
      name     VARCHAR(80) NOT NULL,
      owner_id BIGINT UNSIGNED NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      fiscal_year  SMALLINT NOT NULL,
      fiscal_month TINYINT NOT NULL,
      status       ENUM('OPEN','CLOSING','CLOSED') NOT NULL DEFAULT 'OPEN',
      closed_by    BIGINT UNSIGNED NULL,
      closed_at    TIMESTAMP NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_period (fiscal_year, fiscal_month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // The journal. Append-only, balanced, period-gated. maker≠checker is a CHECK;
  // the "posted needs approval" rule applies only to MANUAL entries — system
  // event-driven postings are authoritative, idempotent and balanced by the
  // engine, so they post without a human checker.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      entry_no        VARCHAR(24) NOT NULL UNIQUE,
      period_id       BIGINT UNSIGNED NOT NULL,
      entry_date      DATE NOT NULL,
      description     VARCHAR(255) NOT NULL,
      source          VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
      source_event_id VARCHAR(64) NULL,
      status          ENUM('DRAFT','SUBMITTED','POSTED','REVERSED') NOT NULL DEFAULT 'DRAFT',
      created_by      BIGINT UNSIGNED NULL,
      approved_by     BIGINT UNSIGNED NULL,
      reverses_id     BIGINT UNSIGNED NULL,
      posted_at       TIMESTAMP NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_je_period (period_id),
      INDEX idx_je_source_event (source_event_id),
      FOREIGN KEY (period_id) REFERENCES fiscal_periods(id),
      FOREIGN KEY (reverses_id) REFERENCES journal_entries(id),
      CONSTRAINT je_maker_not_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
      CONSTRAINT je_posted_manual_needs_approval CHECK (status <> 'POSTED' OR source <> 'MANUAL' OR approved_by IS NOT NULL)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS journal_lines (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      je_id          BIGINT UNSIGNED NOT NULL,
      account_id     BIGINT UNSIGNED NOT NULL,
      cost_center_id BIGINT UNSIGNED NULL,
      side           ENUM('DR','CR') NOT NULL,
      amount         DECIMAL(18,4) NOT NULL,
      project_id     BIGINT UNSIGNED NULL,
      account_ref_id BIGINT UNSIGNED NULL,   -- CRM client account
      employee_id    BIGINT UNSIGNED NULL,   -- HR employee
      campaign_id    BIGINT UNSIGNED NULL,   -- marketing campaign
      PRIMARY KEY (id),
      INDEX idx_jl_je (je_id),
      INDEX idx_jl_account (account_id),
      INDEX idx_jl_dims (project_id, account_ref_id, campaign_id),
      FOREIGN KEY (je_id) REFERENCES journal_entries(id),
      FOREIGN KEY (account_id) REFERENCES gl_accounts(id),
      FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id),
      CONSTRAINT jl_amount_positive CHECK (amount > 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // Idempotency ledger (Section 4.2, step 1): one row per processed event.
  // The UNIQUE key is what makes at-least-once delivery safe.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fms_postings (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id   VARCHAR(64) NOT NULL UNIQUE,
      je_id      BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (je_id) REFERENCES journal_entries(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS gl_contracts (
      id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_ref_id     BIGINT UNSIGNED NOT NULL,
      opportunity_ref_id BIGINT UNSIGNED NULL,
      total_value        DECIMAL(14,2) NOT NULL,
      start_date         DATE NOT NULL,
      end_date           DATE NOT NULL,
      billing_freq       ENUM('MONTHLY','QUARTERLY','ANNUAL','MILESTONE') NOT NULL DEFAULT 'MONTHLY',
      status             ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
      created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // WHEN each dollar becomes revenue (ASC 606). Deferred revenue = Σ of the
  // unrecognized rows, reconcilable against the ledger exactly (BR-04).
  await conn.query(`
    CREATE TABLE IF NOT EXISTS revenue_schedule (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      contract_id BIGINT UNSIGNED NOT NULL,
      period_id   BIGINT UNSIGNED NOT NULL,
      amount      DECIMAL(14,2) NOT NULL,
      recognized  BOOLEAN NOT NULL DEFAULT FALSE,
      je_id       BIGINT UNSIGNED NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_revsched (contract_id, period_id),
      FOREIGN KEY (contract_id) REFERENCES gl_contracts(id),
      FOREIGN KEY (period_id) REFERENCES fiscal_periods(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      cost_center_id BIGINT UNSIGNED NOT NULL,
      period_id      BIGINT UNSIGNED NOT NULL,
      amount         DECIMAL(14,2) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_budget (cost_center_id, period_id),
      FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id),
      FOREIGN KEY (period_id) REFERENCES fiscal_periods(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // A maker–checker value transfer (Section 2.2). maker≠checker is a CHECK.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fms_payments (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      payee          VARCHAR(160) NOT NULL,
      amount         DECIMAL(14,2) NOT NULL,
      cost_center_id BIGINT UNSIGNED NULL,
      status         ENUM('DRAFT','SUBMITTED','APPROVED','POSTED','REJECTED') NOT NULL DEFAULT 'DRAFT',
      created_by     BIGINT UNSIGNED NOT NULL,
      approved_by    BIGINT UNSIGNED NULL,
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id),
      CONSTRAINT pay_maker_not_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
      CONSTRAINT pay_approved_needs_approver CHECK (status <> 'APPROVED' OR approved_by IS NOT NULL)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS fms_audit_log (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      actor_id    BIGINT UNSIGNED NULL,
      actor_role  VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
      action      VARCHAR(60) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id   BIGINT NULL,
      detail      JSON NULL,
      ip_address  VARCHAR(45) NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_fmsaudit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await seedChartOfAccounts(conn);
  await seedCostCenters(conn);
  await ensureOpenPeriod(conn);
}

async function seedChartOfAccounts(conn) {
  for (const a of CHART) {
    await conn.query(
      'INSERT IGNORE INTO gl_accounts (code, name, account_type, normal_side) VALUES (?, ?, ?, ?)',
      [a.code, a.name, a.type, NORMAL_SIDE[a.type]]
    );
  }
}

async function seedCostCenters(conn) {
  const centers = [
    ['ENG', 'Engineering'],
    ['SALES', 'Sales'],
    ['MKTG', 'Marketing'],
    ['G&A', 'General & Administrative'],
  ];
  for (const [code, name] of centers) {
    await conn.query('INSERT IGNORE INTO cost_centers (code, name) VALUES (?, ?)', [code, name]);
  }
}

// Guarantee an OPEN period exists for the current month (postings need one).
async function ensureOpenPeriod(conn) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  await conn.query(
    "INSERT IGNORE INTO fiscal_periods (fiscal_year, fiscal_month, status) VALUES (?, ?, 'OPEN')",
    [year, month]
  );
}
