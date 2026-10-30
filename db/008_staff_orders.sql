USE vendor_management_system;

-- Run as a MySQL account with ALTER/CREATE/GRANT rights (e.g. root), after 007_inventory_details.sql.
-- Safe to re-run.

-- STAFF role (existing rows keep their role).
ALTER TABLE users MODIFY COLUMN role ENUM('USER', 'STAFF', 'ADMIN') NOT NULL DEFAULT 'USER';

-- Purchases. Prices are copied at purchase time so later price edits don't rewrite history.
CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_orders_user_created (user_id, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  product_name VARCHAR(200) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB;

GRANT SELECT, INSERT ON vendor_management_system.orders TO 'vendor_app'@'localhost';
GRANT SELECT, INSERT ON vendor_management_system.order_items TO 'vendor_app'@'localhost';
