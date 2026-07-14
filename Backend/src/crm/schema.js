// CRM schema (MySQL). Two identity tables (crm_users internal, crm_portal_users
// external) — separated so no value writable into the portal table can grant
// internal access. account_id is carried on every client-owned table so the
// tenant predicate is uniform. Consent is an append-only event log.
import { hashPassword } from '../hr/password.js';

export async function ensureCrmSchema(conn) {
  // --- Internal identity ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_users (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name          VARCHAR(120) NOT NULL,
      email         VARCHAR(160) NOT NULL UNIQUE,
      password_hash TEXT NULL,
      role          VARCHAR(24) NOT NULL,   -- SUPER_ADMIN | SALES_REP | ...
      territories   JSON NULL,              -- territory ids for SALES_MANAGER
      status        ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
      token_version INT NOT NULL DEFAULT 1,
      failed_attempts SMALLINT NOT NULL DEFAULT 0,
      locked_until  TIMESTAMP NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS territories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(80) NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name               VARCHAR(160) NOT NULL,
      domain             VARCHAR(120) NULL,
      industry           VARCHAR(80) NULL,
      segment            ENUM('SMB','MID_MARKET','ENTERPRISE') NULL,
      territory_id       BIGINT UNSIGNED NULL,
      owner_id           BIGINT UNSIGNED NULL,
      account_manager_id BIGINT UNSIGNED NULL,
      portal_tier        ENUM('NONE','BASIC','FULL') NOT NULL DEFAULT 'NONE',
      status             ENUM('PROSPECT','ACTIVE','SUSPENDED','CHURNED') NOT NULL DEFAULT 'PROSPECT',
      health_score       SMALLINT NULL,
      created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_acc_owner (owner_id), INDEX idx_acc_am (account_manager_id), INDEX idx_acc_terr (territory_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id BIGINT UNSIGNED NOT NULL,
      first_name VARCHAR(80) NOT NULL,
      last_name  VARCHAR(80) NOT NULL,
      email      VARCHAR(160) NOT NULL,
      title      VARCHAR(100) NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      status     ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      PRIMARY KEY (id),
      UNIQUE KEY uq_contact_email (account_id, email),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // --- External identity (portal). account_id COPIED here and treated immutable. ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_portal_users (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      contact_id    BIGINT UNSIGNED NOT NULL UNIQUE,
      account_id    BIGINT UNSIGNED NOT NULL,               -- IMMUTABLE tenant binding
      email         VARCHAR(160) NOT NULL UNIQUE,
      password_hash TEXT NULL,
      role          ENUM('CLIENT_ADMIN','CLIENT_USER','CLIENT_FINANCE') NOT NULL,
      status        ENUM('PENDING_VENDOR_APPROVAL','PENDING_ACTIVATION','ACTIVE','LOCKED','SUSPENDED','REVOKED')
                      NOT NULL DEFAULT 'PENDING_ACTIVATION',
      token_version INT NOT NULL DEFAULT 1,
      failed_attempts SMALLINT NOT NULL DEFAULT 0,
      locked_until  TIMESTAMP NULL,
      invited_by    BIGINT UNSIGNED NULL,                   -- internal user who granted access
      approved_by   BIGINT UNSIGNED NULL,                   -- for delegated invites
      last_login_at TIMESTAMP NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_invitations (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      portal_user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at    TIMESTAMP NULL,
      PRIMARY KEY (id),
      INDEX idx_crminv_hash (token_hash),
      FOREIGN KEY (portal_user_id) REFERENCES crm_portal_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // --- Sales pipeline ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id    BIGINT UNSIGNED NOT NULL,
      name          VARCHAR(160) NOT NULL,
      stage         ENUM('QUALIFICATION','DISCOVERY','PROPOSAL','NEGOTIATION','CLOSED_WON','CLOSED_LOST') NOT NULL DEFAULT 'QUALIFICATION',
      amount        DECIMAL(14,2) NOT NULL,
      probability   SMALLINT NOT NULL DEFAULT 10,
      expected_close DATE NOT NULL,
      owner_id      BIGINT UNSIGNED NOT NULL,
      closed_at     TIMESTAMP NULL,
      lost_reason   VARCHAR(60) NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_opp_owner (owner_id), INDEX idx_opp_acc (account_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // --- Support tickets (dual-plane: portal creates/reads own account; staff resolve) ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id   BIGINT UNSIGNED NOT NULL,               -- tenant boundary
      contact_id   BIGINT UNSIGNED NULL,
      subject      VARCHAR(200) NOT NULL,
      body         TEXT NULL,
      priority     ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
      status       ENUM('OPEN','IN_PROGRESS','AWAITING_CLIENT','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
      assignee_id  BIGINT UNSIGNED NULL,
      sla_due_at   TIMESTAMP NULL,
      resolved_at  TIMESTAMP NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_ticket_acc (account_id, status),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // --- Consent: append-only event log; current consent is DERIVED ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS consent_events (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      contact_id  BIGINT UNSIGNED NOT NULL,
      channel     ENUM('EMAIL','SMS','PHONE') NOT NULL,
      action      ENUM('GRANTED','WITHDRAWN') NOT NULL,
      basis       VARCHAR(30) NOT NULL DEFAULT 'OPT_IN_FORM',
      evidence    JSON NULL,
      occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_consent_contact (contact_id, channel, occurred_at),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  // --- Invoices (portal: Client Finance / Client Admin, tenant-isolated) ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id  BIGINT UNSIGNED NOT NULL,               -- tenant boundary
      number      VARCHAR(40) NOT NULL,
      amount      DECIMAL(14,2) NOT NULL,
      currency    VARCHAR(8) NOT NULL DEFAULT 'INR',
      status      ENUM('DRAFT','SENT','PAID','OVERDUE','VOID') NOT NULL DEFAULT 'SENT',
      issued_at   DATE NOT NULL,
      due_date    DATE NULL,
      paid_at     DATE NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_invoice_number (number),
      INDEX idx_invoice_acc (account_id, status),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_audit_log (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      actor_plane  VARCHAR(12) NOT NULL,
      actor_id     BIGINT UNSIGNED NULL,
      actor_role   VARCHAR(30) NOT NULL,
      account_id   BIGINT UNSIGNED NULL,
      action       VARCHAR(60) NOT NULL,
      entity_type  VARCHAR(40) NOT NULL,
      entity_id    BIGINT NULL,
      detail       JSON NULL,
      ip_address   VARCHAR(45) NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_crmaudit_acct (account_id), INDEX idx_crmaudit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await seedBootstrapInternalAdmin(conn);
}

async function seedBootstrapInternalAdmin(conn) {
  const email = process.env.CRM_BOOTSTRAP_EMAIL || 'crmadmin@bitwix.co.in';
  const password = process.env.CRM_BOOTSTRAP_PASSWORD || 'ChangeMe-crmadmin-123';
  const [[existing]] = await conn.query('SELECT id FROM crm_users WHERE email = ?', [email]);
  if (existing) return;
  await conn.query(
    `INSERT INTO crm_users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE')`,
    ['CRM Administrator', email, hashPassword(password)]
  );
  console.log(`Seeded bootstrap CRM Super Admin: ${email}`);
}
