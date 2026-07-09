-- Bitwix Technologies database schema
-- Run manually with: mysql -u root -p < schema.sql
-- Or use `npm run db:init` which creates the database and tables automatically.

CREATE DATABASE IF NOT EXISTS bitwix
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bitwix;

-- Contact form submissions coming from the website Contact section.
CREATE TABLE IF NOT EXISTS contact_messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120)  NOT NULL,
  email       VARCHAR(180)  NOT NULL,
  phone       VARCHAR(40)   NULL,
  subject     VARCHAR(200)  NULL,
  message     TEXT          NOT NULL,
  status      ENUM('new', 'read', 'archived') NOT NULL DEFAULT 'new',
  ip_address  VARCHAR(45)   NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_contact_created_at (created_at),
  INDEX idx_contact_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Services shown on the site (seeded from the frontend content).
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

-- ==========================================================================
-- Employee Management module (Operations Research framework)
-- ==========================================================================

-- Engineering roster. engagement_state feeds the Markov retention model.
CREATE TABLE IF NOT EXISTS employees (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(120) NOT NULL,
  role             VARCHAR(120) NULL,
  skills           JSON         NULL,
  monthly_salary   DECIMAL(12,2) NULL,
  utilization      DECIMAL(5,2) NULL,
  engagement_state ENUM('engaged','at_risk','departed') NOT NULL DEFAULT 'engaged',
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_employees_state (engagement_state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saved assignment-problem scenarios (agents x tasks cost matrix).
CREATE TABLE IF NOT EXISTS assignment_scenarios (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(180) NOT NULL,
  agents       JSON         NOT NULL,
  tasks        JSON         NOT NULL,
  cost_matrix  JSON         NOT NULL,
  mode         ENUM('min','max') NOT NULL DEFAULT 'min',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saved Markov retention scenarios.
CREATE TABLE IF NOT EXISTS retention_scenarios (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(180) NOT NULL,
  states              JSON         NOT NULL,
  transition_matrix   JSON         NOT NULL,
  intervention_matrix JSON         NULL,
  initial_vector      JSON         NOT NULL,
  horizon             INT UNSIGNED NOT NULL DEFAULT 6,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- Financial Management module (Operations Research framework)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS lp_scenarios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(180) NOT NULL,
  objective   JSON         NOT NULL,
  constraints JSON         NOT NULL,
  sense       ENUM('max','min') NOT NULL DEFAULT 'max',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investments (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name               VARCHAR(180) NOT NULL,
  initial_investment DECIMAL(14,2) NOT NULL,
  cash_flows         JSON         NOT NULL,
  discount_rate      DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- ==========================================================================
-- Client Management module (Operations Research framework)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS clients (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(180) NOT NULL,
  annual_margin   DECIMAL(14,2) NOT NULL DEFAULT 0,
  retention_rate  DECIMAL(5,4)  NOT NULL DEFAULT 0.8500,
  discount_rate   DECIMAL(6,4)  NOT NULL DEFAULT 0.1000,
  strategic_score TINYINT      NOT NULL DEFAULT 3,
  notes           VARCHAR(255)  NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS queue_scenarios (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(180) NOT NULL,
  arrival_rate     DECIMAL(10,4) NOT NULL,
  service_rate     DECIMAL(10,4) NOT NULL,
  servers          INT          NOT NULL DEFAULT 1,
  target_wait_prob DECIMAL(5,4) NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- Project Management module (Operations Research framework)
-- ==========================================================================

-- A project / engagement being planned and controlled.
CREATE TABLE IF NOT EXISTS projects (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(180) NOT NULL,
  client_name  VARCHAR(180) NULL,
  description  TEXT         NULL,
  bac          DECIMAL(14,2) NULL,          -- Budget At Completion (EVM)
  start_date   DATE         NULL,
  deadline_days INT UNSIGNED NULL,          -- client-committed duration in days
  status       ENUM('planning','active','on_hold','completed','cancelled')
                 NOT NULL DEFAULT 'planning',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_projects_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activities (tasks) within a project. Stores three-point PERT estimates;
-- the deterministic CPM duration is derived (expected duration) or set to `most_likely`.
CREATE TABLE IF NOT EXISTS project_activities (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED NOT NULL,
  code         VARCHAR(20)  NOT NULL,       -- e.g. 'A', 'B', unique within a project
  name         VARCHAR(200) NOT NULL,
  optimistic   DECIMAL(8,2) NOT NULL,       -- o
  most_likely  DECIMAL(8,2) NOT NULL,       -- m
  pessimistic  DECIMAL(8,2) NOT NULL,       -- p
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_activity_code (project_id, code),
  CONSTRAINT fk_activity_project FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Precedence edges: activity depends on predecessor (both in the same project).
CREATE TABLE IF NOT EXISTS activity_dependencies (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id    INT UNSIGNED NOT NULL,
  predecessor_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dependency (activity_id, predecessor_id),
  CONSTRAINT fk_dep_activity FOREIGN KEY (activity_id)
    REFERENCES project_activities (id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_predecessor FOREIGN KEY (predecessor_id)
    REFERENCES project_activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Earned Value Management status snapshots for a project.
CREATE TABLE IF NOT EXISTS evm_snapshots (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED NOT NULL,
  status_date  DATE          NOT NULL,
  planned_value DECIMAL(14,2) NOT NULL,     -- PV
  earned_value  DECIMAL(14,2) NOT NULL,     -- EV
  actual_cost   DECIMAL(14,2) NOT NULL,     -- AC
  note         VARCHAR(255)  NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_evm_project_date (project_id, status_date),
  CONSTRAINT fk_evm_project FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team members shown on the site.
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
