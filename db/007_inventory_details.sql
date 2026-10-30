USE vendor_management_system;

-- Run as a MySQL account with ALTER/REVOKE rights (e.g. root), after 006_inventory.sql.
-- Safe to re-run: each column/index is added only if it is missing.

DROP PROCEDURE IF EXISTS add_col;
DROP PROCEDURE IF EXISTS add_idx;
DROP PROCEDURE IF EXISTS add_uq;
DROP PROCEDURE IF EXISTS add_fk;

DELIMITER $$
CREATE PROCEDURE add_col(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE add_idx(IN t VARCHAR(64), IN i VARCHAR(64), IN cols VARCHAR(128))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND INDEX_NAME = i
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD KEY `', i, '` (', cols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE add_uq(IN t VARCHAR(64), IN i VARCHAR(64), IN cols VARCHAR(128))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND INDEX_NAME = i
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD UNIQUE KEY `', i, '` (', cols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
CREATE PROCEDURE add_fk(IN t VARCHAR(64), IN f VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND CONSTRAINT_NAME = f
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD CONSTRAINT `', f, '` ', def);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- Base tables (no-ops if 006 already created them).
CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_name (name)
) ENGINE=InnoDB;

-- New product columns used by inventory.
CALL add_col('products', 'sku', 'VARCHAR(64) NULL');
CALL add_col('products', 'category_id', 'CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL');
CALL add_col('products', 'supplier_id', 'CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL');
CALL add_col('products', 'cost_price', 'DECIMAL(10,2) NULL');
CALL add_col('products', 'quantity', 'INT NOT NULL DEFAULT 0');
CALL add_col('products', 'reorder_threshold', 'INT NOT NULL DEFAULT 5');
CALL add_col('products', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_col('products', 'updated_at', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)');
CALL add_uq('products', 'uq_products_sku', '`sku`');
CALL add_idx('products', 'idx_products_category_id', '`category_id`');
CALL add_idx('products', 'idx_products_supplier_id', '`supplier_id`');
CALL add_fk('products', 'fk_products_category', 'FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL');
CALL add_fk('products', 'fk_products_supplier', 'FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL');

CREATE TABLE IF NOT EXISTS stock_movements (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  quantity_change INT NOT NULL,
  reason VARCHAR(255) NULL,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_stock_movements_product_id (product_id),
  KEY idx_stock_movements_created_at (created_at),
  CONSTRAINT fk_stock_movements_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CALL add_col('categories', 'description', 'VARCHAR(500) NULL');
CALL add_col('categories', 'updated_at', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)');

CALL add_col('suppliers', 'contact_person', 'VARCHAR(150) NULL');
CALL add_col('suppliers', 'contact_email', 'VARCHAR(255) NULL');
CALL add_col('suppliers', 'contact_phone', 'VARCHAR(50) NULL');
CALL add_col('suppliers', 'address', 'VARCHAR(500) NULL');
CALL add_col('suppliers', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_col('suppliers', 'updated_at', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)');

CALL add_col('stock_movements', 'movement_type', "ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT') NOT NULL DEFAULT 'STOCK_IN'");
CALL add_col('stock_movements', 'previous_quantity', 'INT NULL');
CALL add_col('stock_movements', 'resulting_quantity', 'INT NULL');
CALL add_idx('stock_movements', 'idx_stock_movements_type', '`movement_type`');
CALL add_idx('stock_movements', 'idx_stock_movements_created_by', '`created_by`');

-- Section 5: free-text reference (e.g. an order or purchase number), plus indexes for search and history queries.
CALL add_col('stock_movements', 'reference', 'VARCHAR(100) NULL');
CALL add_idx('stock_movements', 'idx_stock_movements_product_created', '`product_id`, `created_at`');
CALL add_idx('products', 'idx_products_name', '`name`');
CALL add_idx('products', 'idx_products_is_active', '`is_active`');

-- Data-integrity checks (enforced by MySQL 8.0.16+). The quantity check also guards against overselling.
CALL add_fk('products', 'chk_products_quantity', 'CHECK (quantity >= 0)');
CALL add_fk('products', 'chk_products_reorder', 'CHECK (reorder_threshold >= 0)');
CALL add_fk('products', 'chk_products_cost', 'CHECK (cost_price IS NULL OR cost_price >= 0)');

DROP PROCEDURE add_col;
DROP PROCEDURE add_idx;
DROP PROCEDURE add_uq;
DROP PROCEDURE add_fk;

GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.categories TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.suppliers TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT ON vendor_management_system.stock_movements TO 'vendor_app'@'localhost';

-- Movement history is append-only: only SELECT/INSERT are granted on this table. This only holds when there is no
-- database-wide grant for vendor_app (see 009_security_fixes.sql, which removes the one older schema.sql created).
