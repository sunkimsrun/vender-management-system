import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
};

export const MAX_QUANTITY = 99;

// Every query is scoped by user_id, so a cart can only ever be read or changed by its owner.
export async function listCart(userId: string): Promise<CartItem[]> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    `SELECT c.product_id, c.quantity, p.name, p.price, p.image_type
     FROM cart_items c JOIN products p ON p.id = c.product_id
     WHERE c.user_id = ? ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    price: Number(row.price),
    imageUrl: row.image_type ? `/api/products/${row.product_id}/image` : null,
    quantity: row.quantity,
  }));
}

// Returns false when the product does not exist.
export async function addToCart(userId: string, productId: string, quantity: number): Promise<boolean> {
  const pool = getDatabasePool();
  const [products] = await pool.execute<RowDataPacket[]>("SELECT id FROM products WHERE id = ? LIMIT 1", [productId]);
  if (!products[0]) return false;
  await pool.execute(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = LEAST(quantity + VALUES(quantity), ${MAX_QUANTITY})`,
    [userId, productId, quantity],
  );
  return true;
}

export async function setCartQuantity(userId: string, productId: string, quantity: number): Promise<boolean> {
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?",
    [quantity, userId, productId],
  );
  return result.affectedRows > 0;
}

export async function removeFromCart(userId: string, productId: string): Promise<boolean> {
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
    [userId, productId],
  );
  return result.affectedRows > 0;
}
