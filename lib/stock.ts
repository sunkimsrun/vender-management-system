import "server-only";

import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { z } from "zod";

import { getDatabasePool } from "@/lib/db";
import { HttpError } from "@/lib/http/errors";
import type { stockListQuerySchema, stockMovementSchema } from "@/lib/validation/catalog";

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  quantityChange: number;
  previousQuantity: number | null;
  resultingQuantity: number | null;
  reason: string | null;
  reference: string | null;
  userEmail: string | null;
  createdAt: string;
};

function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
    throw new HttpError("SERVICE_UNAVAILABLE", "Stock tables are outdated. Run db/006_inventory.sql and db/007_inventory_details.sql as MySQL root.");
  }
  throw error;
}

// Row lock + quantity update + movement insert happen in one transaction, so concurrent movements can't lose updates.
export async function recordMovement(userId: string, input: z.infer<typeof stockMovementSchema>) {
  const connection = await getDatabasePool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT quantity FROM products WHERE id = ? FOR UPDATE", [input.productId]);
    if (!rows[0]) throw new HttpError("NOT_FOUND", "Product not found");
    const previous = Number(rows[0].quantity);

    let change: number;
    if (input.type === "STOCK_IN") change = input.quantity;
    else if (input.type === "STOCK_OUT") change = -input.quantity;
    else change = input.quantity - previous;

    const resulting = previous + change;
    if (resulting < 0) throw new HttpError("CONFLICT", `Not enough stock: only ${previous} available`);
    if (change === 0) throw new HttpError("VALIDATION_ERROR", "The quantity already matches the current stock");

    await connection.execute("UPDATE products SET quantity = ? WHERE id = ?", [resulting, input.productId]);
    const id = randomUUID();
    await connection.execute(
      `INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, previous_quantity, resulting_quantity, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.productId, input.type, change, previous, resulting, input.reason, userId],
    );
    await connection.commit();
    return { id, previousQuantity: previous, resultingQuantity: resulting, quantityChange: change };
  } catch (error) {
    await connection.rollback();
    if (error instanceof HttpError) throw error;
    return mapError(error);
  } finally {
    connection.release();
  }
}

export async function listMovements(query: z.infer<typeof stockListQuerySchema>) {
  const where: string[] = [];
  const params: string[] = [];
  if (query.productId) { where.push("m.product_id = ?"); params.push(query.productId); }
  if (query.userId) { where.push("m.created_by = ?"); params.push(query.userId); }
  if (query.type) { where.push("m.movement_type = ?"); params.push(query.type); }
  if (query.from) { where.push("m.created_at >= ?"); params.push(`${query.from} 00:00:00.000`); }
  if (query.to) { where.push("m.created_at <= ?"); params.push(`${query.to} 23:59:59.999`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pool = getDatabasePool();
  try {
    const [count] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM stock_movements m ${clause}`, params);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.id, m.product_id, p.name AS product_name, m.movement_type, m.quantity_change, m.previous_quantity,
              m.resulting_quantity, m.reason, m.reference, u.email AS user_email, m.created_at
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       ${clause} ORDER BY m.created_at DESC, m.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      params,
    );
    const total = Number(count[0].total);
    const items: StockMovement[] = rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      type: r.movement_type,
      quantityChange: Number(r.quantity_change),
      previousQuantity: r.previous_quantity === null ? null : Number(r.previous_quantity),
      resultingQuantity: r.resulting_quantity === null ? null : Number(r.resulting_quantity),
      reason: r.reason,
      reference: r.reference ?? null,
      userEmail: r.user_email,
      createdAt: new Date(r.created_at).toISOString(),
    }));
    return { items, page: query.page, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
  } catch (error) {
    return mapError(error);
  }
}

// Small lookups for the stock page filters/form.
export async function listStockLookups() {
  const pool = getDatabasePool();
  const [products] = await pool.execute<RowDataPacket[]>("SELECT id, name, quantity FROM products ORDER BY name LIMIT 1000");
  const [users] = await pool.execute<RowDataPacket[]>("SELECT id, email FROM users WHERE id IN (SELECT DISTINCT created_by FROM stock_movements) ORDER BY email LIMIT 200");
  return {
    products: products.map((r) => ({ id: r.id as string, name: r.name as string, quantity: Number(r.quantity) })),
    users: users.map((r) => ({ id: r.id as string, email: r.email as string })),
  };
}
