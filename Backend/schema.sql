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
