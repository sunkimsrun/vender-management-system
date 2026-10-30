import "server-only";

import type { RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";

export type InventoryOverview = {
  totals: {
    products: number;
    categories: number;
    suppliers: number;
    quantity: number;
    lowStock: number;
    outOfStock: number;
    inventoryValue: number | null;
  };
  recentMovements: {
    id: string;
    productName: string;
    quantityChange: number;
    reason: string | null;
    userEmail: string | null;
    createdAt: string;
  }[];
  byCategory: { name: string; products: number }[];
  attention: { id: string; name: string; quantity: number; reorderThreshold: number }[];
  byType: { type: string; movements: number; units: number }[];
  topMoved: { id: string; name: string; movements: number; units: number }[];
  recentProducts: { id: string; name: string; updatedAt: string }[];
  daily: { date: string; stockIn: number; stockOut: number }[];
  range: { from: string; to: string };
};

// All aggregation happens in SQL; only small result sets reach application memory.
export async function getInventoryOverview(from: Date, to: Date): Promise<InventoryOverview> {
  const pool = getDatabasePool();

  const [totals] = await pool.execute<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
         (SELECT COUNT(*) FROM categories) AS categories,
         (SELECT COUNT(*) FROM suppliers) AS suppliers,
         COALESCE(SUM(quantity), 0) AS quantity,
         COALESCE(SUM(quantity > 0 AND quantity <= reorder_threshold), 0) AS low_stock,
         COALESCE(SUM(quantity <= 0), 0) AS out_of_stock,
         -- Valuation basis: on-hand quantity x cost price; products without a cost price are excluded.
         SUM(CASE WHEN cost_price IS NOT NULL THEN quantity * cost_price END) AS inventory_value
       FROM products WHERE is_active = 1`,
  );

  const [movements] = await pool.execute<RowDataPacket[]>(
    `SELECT m.id, p.name, m.quantity_change, m.reason, m.created_at, u.email AS user_email
     FROM stock_movements m JOIN products p ON p.id = m.product_id
         LEFT JOIN users u ON u.id = m.created_by
     WHERE m.created_at BETWEEN ? AND ?
     ORDER BY m.created_at DESC LIMIT 10`,
    [from, to],
  );

  const [recent] = await pool.execute<RowDataPacket[]>(
    "SELECT id, name, updated_at FROM products ORDER BY updated_at DESC LIMIT 5",
  );

  const [daily] = await pool.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
            SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END) AS stock_in,
            SUM(CASE WHEN quantity_change < 0 THEN -quantity_change ELSE 0 END) AS stock_out
     FROM stock_movements WHERE created_at BETWEEN ? AND ?
     GROUP BY d ORDER BY d`,
    [from, to],
  );

  const [categories] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(c.name, 'Uncategorized') AS name, COUNT(*) AS products
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = 1 GROUP BY c.id, c.name ORDER BY products DESC, name LIMIT 20`,
  );

  const [attention] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, quantity, reorder_threshold FROM products
     WHERE is_active = 1 AND quantity <= reorder_threshold
     ORDER BY quantity, name LIMIT 10`,
  );

  const [byType] = await pool.execute<RowDataPacket[]>(
    `SELECT movement_type, COUNT(*) AS movements, SUM(ABS(quantity_change)) AS units
     FROM stock_movements WHERE created_at BETWEEN ? AND ? GROUP BY movement_type`,
    [from, to],
  );

  const [topMoved] = await pool.execute<RowDataPacket[]>(
    `SELECT p.id, p.name, COUNT(*) AS movements, SUM(ABS(m.quantity_change)) AS units
     FROM stock_movements m JOIN products p ON p.id = m.product_id
     WHERE m.created_at BETWEEN ? AND ?
     GROUP BY p.id, p.name ORDER BY movements DESC, units DESC LIMIT 5`,
    [from, to],
  );

  const t = totals[0];
  return {
    totals: {
      products: Number(t.products),
      categories: Number(t.categories),
      suppliers: Number(t.suppliers),
      quantity: Number(t.quantity),
      lowStock: Number(t.low_stock),
      outOfStock: Number(t.out_of_stock),
      inventoryValue: t.inventory_value === null ? null : Number(t.inventory_value),
    },
    recentMovements: movements.map((r) => ({
      id: r.id,
      productName: r.name,
      quantityChange: Number(r.quantity_change),
      reason: r.reason,
      userEmail: r.user_email,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    byCategory: categories.map((r) => ({ name: r.name, products: Number(r.products) })),
    attention: attention.map((r) => ({
      id: r.id,
      name: r.name,
      quantity: Number(r.quantity),
      reorderThreshold: Number(r.reorder_threshold),
    })),
    byType: byType.map((r) => ({ type: r.movement_type, movements: Number(r.movements), units: Number(r.units) })),
    topMoved: topMoved.map((r) => ({ id: r.id, name: r.name, movements: Number(r.movements), units: Number(r.units) })),
    recentProducts: recent.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
    daily: daily.map((r) => ({ date: r.d, stockIn: Number(r.stock_in), stockOut: Number(r.stock_out) })),
    range: { from: from.toISOString(), to: to.toISOString() },
  };
}
