CREATE DATABASE IF NOT EXISTS vendor_management_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'vendor_app'@'localhost'
  IDENTIFIED BY 'CHANGE_ME_BEFORE_RUNNING';

USE vendor_management_system;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('USER', 'STAFF', 'ADMIN') NOT NULL DEFAULT 'USER',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  family_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at TIMESTAMP(3) NULL,
  replaced_by_token_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user_id (user_id),
  KEY idx_refresh_tokens_family_id (family_id),
  KEY idx_refresh_tokens_expires_at (expires_at),
  KEY idx_refresh_tokens_revoked_at (revoked_at),
  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_refresh_tokens_replacement
    FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens (id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Grants are per table on purpose: a database-wide grant would also give the app UPDATE/DELETE on append-only tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.users TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.refresh_tokens TO 'vendor_app'@'localhost';
