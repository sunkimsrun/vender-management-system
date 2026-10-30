import "server-only";

import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  createdAt: string;
};

export type ProductImage = { type: string; data: Buffer };

function toProduct(row: RowDataPacket): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    imageUrl: row.image_type ? `/api/products/${row.id}/image` : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// image_data is deliberately excluded; it is served by its own endpoint.
const COLUMNS = "id, name, description, price, image_type, created_at";

export async function listProducts(): Promise<Product[]> {
  const pool = getDatabasePool();
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${COLUMNS} FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT 200`,
    );
    return rows.map(toProduct);
  } catch (error) {
    // Before db/006_inventory.sql is applied there is no is_active column.
    if ((error as { code?: string }).code !== "ER_BAD_FIELD_ERROR") throw error;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${COLUMNS} FROM products ORDER BY created_at DESC LIMIT 200`,
    );
    return rows.map(toProduct);
  }
}

export async function createProduct(
  userId: string,
  input: { name: string; description: string; price: number },
  image: ProductImage | null,
): Promise<Product> {
  const id = randomUUID();
  const pool = getDatabasePool();
  await pool.execute(
    `INSERT INTO products (id, name, description, price, image_type, image_data, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.description, input.price.toFixed(2), image?.type ?? null, image?.data ?? null, userId],
  );
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM products WHERE id = ? LIMIT 1`,
    [id],
  );
  return toProduct(rows[0]);
}

export async function getProductImage(id: string): Promise<ProductImage | null> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    "SELECT image_type, image_data FROM products WHERE id = ? AND image_type IS NOT NULL LIMIT 1",
    [id],
  );
  return rows[0] ? { type: rows[0].image_type, data: rows[0].image_data } : null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM products WHERE id = ?",
    [id],
  );
  return result.affectedRows > 0;
}
