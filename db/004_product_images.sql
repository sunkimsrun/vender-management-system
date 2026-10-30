USE vendor_management_system;

ALTER TABLE products
  ADD COLUMN image_type VARCHAR(30) CHARACTER SET ascii NULL AFTER price,
  ADD COLUMN image_data MEDIUMBLOB NULL AFTER image_type;
