USE vendor_management_system;

CREATE TABLE IF NOT EXISTS cart_items (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, product_id),
  KEY idx_cart_items_product_id (product_id),
  CONSTRAINT fk_cart_items_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- The application user only needs data access on the new table.
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_management_system.cart_items TO 'vendor_app'@'localhost';
