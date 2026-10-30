USE vendor_management_system;

-- Run as a MySQL account with ALTER and GRANT rights (e.g. root), after 008_staff_orders.sql.
-- Safe to re-run. It repairs two problems found by the integration tests:
--
-- 1. products.sku must be UNIQUE. Earlier migrations created `uq_products_sku` as a plain index, so duplicate SKUs
--    were accepted. If this fails with "Duplicate entry", remove or rename the duplicate SKUs it names and re-run.
-- 2. stock_movements must be append-only. schema.sql granted SELECT/INSERT/UPDATE/DELETE on the whole database, and a
--    table-level REVOKE cannot subtract from a database-level grant, so the application could still edit and delete
--    movement history. This replaces the database-wide grant with explicit per-table grants.

DROP PROCEDURE IF EXISTS fix_sku_unique;
DROP PROCEDURE IF EXISTS drop_database_wide_grant;

DELIMITER $$
CREATE PROCEDURE fix_sku_unique()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'uq_products_sku' AND NON_UNIQUE = 1
  ) THEN
    ALTER TABLE products DROP INDEX uq_products_sku;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'uq_products_sku'
  ) THEN
    ALTER TABLE products ADD UNIQUE KEY uq_products_sku (sku);
  END IF;
END$$

-- Ignores the error MySQL raises when the database-wide grant is already gone, so re-running is harmless.
CREATE PROCEDURE drop_database_wide_grant()
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.* FROM 'vendor_app'@'localhost';
END$$
DELIMITER ;

CALL fix_sku_unique();
CALL drop_database_wide_grant();

DROP PROCEDURE fix_sku_unique;
DROP PROCEDURE drop_database_wide_grant;

GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.users TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.refresh_tokens TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.notes TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.products TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.cart_items TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.categories TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.suppliers TO 'vendor_app'@'localhost';

-- Append-only: history and purchase records can be read and added, never edited or deleted by the application.
GRANT SELECT, INSERT ON vendor_management_system.stock_movements TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT ON vendor_management_system.orders TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT ON vendor_management_system.order_items TO 'vendor_app'@'localhost';

SHOW GRANTS FOR 'vendor_app'@'localhost';
