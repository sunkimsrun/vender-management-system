USE vendor_management_system;

-- Run as a MySQL account with CREATE/ALTER rights (e.g. root), after 005_cart.sql.

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
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(50) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_name (name)
) ENGINE=InnoDB;

ALTER TABLE products
  ADD COLUMN sku VARCHAR(64) NULL AFTER name,
  ADD COLUMN category_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN supplier_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN cost_price DECIMAL(10,2) NULL,
  ADD COLUMN quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN reorder_threshold INT NOT NULL DEFAULT 5,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ADD UNIQUE KEY uq_products_sku (sku),
  ADD KEY idx_products_category_id (category_id),
  ADD KEY idx_products_supplier_id (supplier_id),
  ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.categories TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.suppliers TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.stock_movements TO 'vendor_app'@'localhost';
