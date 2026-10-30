import "server-only";

import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";
import { HttpError } from "@/lib/http/errors";

export type Order = {
  id: string;
  total: number;
  createdAt: string;
  items: { productName: string; unitPrice: number; quantity: number }[];
};

function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
    throw new HttpError("SERVICE_UNAVAILABLE", "Orders are not set up yet. Run db/007_inventory_details.sql and db/008_staff_orders.sql as MySQL root.");
  }
  throw error;
}

// Buys everything in the caller's cart. Product price, availability and stock are read server-side inside one
// transaction with the product rows locked, so two buyers can never oversell the same stock.
export async function checkout(userId: string): Promise<Order> {
  const connection = await getDatabasePool().getConnection();
  try {
    await connection.beginTransaction();

    // Locking in a stable order (by id) avoids deadlocks between concurrent checkouts.
    const [lines] = await connection.execute<RowDataPacket[]>(
      `SELECT c.product_id, c.quantity AS wanted, p.name, p.price, p.quantity AS stock, p.is_active
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ? ORDER BY p.id FOR UPDATE`,
      [userId],
    );
    if (lines.length === 0) throw new HttpError("BAD_REQUEST", "Your cart is empty");

    for (const line of lines) {
      if (!line.is_active) throw new HttpError("CONFLICT", `"${line.name}" is no longer available. Remove it from your cart.`);
      if (Number(line.stock) < Number(line.wanted)) {
        throw new HttpError("CONFLICT", `Not enough stock for "${line.name}" (${Number(line.stock)} left)`);
      }
    }

    const orderId = randomUUID();
    const total = lines.reduce((sum, l) => sum + Math.round(Number(l.price) * 100) * Number(l.wanted), 0) / 100;
    await connection.execute("INSERT INTO orders (id, user_id, total) VALUES (?, ?, ?)", [orderId, userId, total.toFixed(2)]);

    for (const line of lines) {
      const wanted = Number(line.wanted);
      const previous = Number(line.stock);
      await connection.execute(
        "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)",
        [orderId, line.product_id, line.name, Number(line.price).toFixed(2), wanted],
      );
      await connection.execute("UPDATE products SET quantity = quantity - ? WHERE id = ?", [wanted, line.product_id]);
      await connection.execute(
        `INSERT INTO stock_movements (id, product_id, movement_type, quantity_change,         previous_quantity, resulting_quantity, reason, reference, created_by)
                 VALUES (?, ?, 'STOCK_OUT', ?, ?, ?, ?, ?, ?)`,
                [randomUUID(), line.product_id, -wanted, previous, previous - wanted, "Customer order", `ORDER-${orderId}`, userId],
      );
    }

    await connection.execute("DELETE FROM cart_items WHERE user_id = ?", [userId]);
    await connection.commit();

    return {
      id: orderId,
      total,
      createdAt: new Date().toISOString(),
      items: lines.map((l) => ({ productName: l.name, unitPrice: Number(l.price), quantity: Number(l.wanted) })),
    };
  } catch (error) {
    await connection.rollback();
    if (error instanceof HttpError) throw error;
    return mapError(error);
  } finally {
    connection.release();
  }
}

// Always scoped to the caller: nobody can read another customer's orders.
export async function listOrders(userId: string): Promise<Order[]> {
  const pool = getDatabasePool();
  try {
    const [orders] = await pool.execute<RowDataPacket[]>(
      "SELECT id, total, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [userId],
    );
    if (orders.length === 0) return [];
    const [items] = await pool.execute<RowDataPacket[]>(
      `SELECT i.order_id, i.product_name, i.unit_price, i.quantity
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.user_id = ? AND o.id IN (SELECT id FROM (SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50) recent)`,
      [userId, userId],
    );
    return orders.map((o) => ({
      id: o.id,
      total: Number(o.total),
      createdAt: new Date(o.created_at).toISOString(),
      items: items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ productName: i.product_name, unitPrice: Number(i.unit_price), quantity: Number(i.quantity) })),
    }));
  } catch (error) {
    return mapError(error);
  }
}
