import "server-only";

import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";
import { HttpError } from "@/lib/http/errors";
import type { ProductListQuery } from "@/lib/validation/inventory-products";

export type AdminProduct = {
  id: string;
  name: string;
  sku: string | null;
  description: string;
  price: number;
  costPrice: number | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  reorderThreshold: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  description: string;
  sku: string | null;
  price: number;
  costPrice: number | null;
  categoryId: string | null;
  supplierId: string | null;
  reorderThreshold: number;
  isActive: boolean;
};

type Image = { type: string; data: Buffer };

const SELECT = `
  SELECT p.id, p.name, p.sku, p.description, p.price, p.cost_price, p.category_id, c.name AS category_name,
         p.supplier_id, s.name AS supplier_name, p.quantity, p.reorder_threshold, p.is_active,
         p.image_type, p.created_at, p.updated_at
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id`;

function toAdminProduct(row: RowDataPacket): AdminProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    price: Number(row.price),
    costPrice: row.cost_price === null ? null : Number(row.cost_price),
    categoryId: row.category_id,
    categoryName: row.category_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    quantity: Number(row.quantity),
    reorderThreshold: Number(row.reorder_threshold),
    isActive: Boolean(row.is_active),
    imageUrl: row.image_type ? `/api/products/${row.id}/image` : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// Translate database constraint failures into client-safe errors.
function mapDbError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "ER_DUP_ENTRY") throw new HttpError("CONFLICT", "That SKU is already in use");
  if (code === "ER_NO_REFERENCED_ROW" || code === "ER_NO_REFERENCED_ROW_2") {
    throw new HttpError("VALIDATION_ERROR", "Selected category or supplier does not exist");
  }
  if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
    throw new HttpError("SERVICE_UNAVAILABLE", "Inventory tables are missing. Run db/006_inventory.sql as MySQL root.");
  }
  throw error;
}

const SORT_COLUMNS = { name: "p.name", price: "p.price", quantity: "p.quantity", created_at: "p.created_at" } as const;

export async function listAdminProducts(query: ProductListQuery) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(p.name LIKE ? OR p.sku LIKE ?)");
    params.push(like, like);
  }
  if (query.categoryId) {
    where.push("p.category_id = ?");
    params.push(query.categoryId);
  }
  if (query.supplierId) {
    where.push("p.supplier_id = ?");
    params.push(query.supplierId);
  }
  if (query.stock === "out") where.push("p.quantity <= 0");
  if (query.stock === "low") where.push("p.quantity > 0 AND p.quantity <= p.reorder_threshold");
  if (query.stock === "in") where.push("p.quantity > p.reorder_threshold");

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const direction = query.order === "asc" ? "ASC" : "DESC";
  // sort/order/page values are whitelisted or validated integers, so inlining them is safe.
  const offset = (query.page - 1) * query.pageSize;

  try {
    const pool = getDatabasePool();
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM products p ${clause}`,
      params,
    );
    const count = countRows;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${SELECT} ${clause} ORDER BY ${SORT_COLUMNS[query.sort]} ${direction}, p.id LIMIT ${query.pageSize} OFFSET ${offset}`,
      params,
    );
    const total = Number(count[0].total);
    return {
      products: rows.map(toAdminProduct),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  } catch (error) {
    return mapDbError(error);
  }
}

export async function getAdminProduct(id: string): Promise<AdminProduct> {
  try {
    const [rows] = await getDatabasePool().execute<RowDataPacket[]>(`${SELECT} WHERE p.id = ? LIMIT 1`, [id]);
    if (!rows[0]) throw new HttpError("NOT_FOUND", "Product not found");
    return toAdminProduct(rows[0]);
  } catch (error) {
    return mapDbError(error);
  }
}

export async function createAdminProduct(
  userId: string,
  input: ProductInput,
  initialQuantity: number,
  image: Image | null,
): Promise<AdminProduct> {
  const id = randomUUID();
  const connection = await getDatabasePool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO products (id, name, sku, description, price, cost_price, category_id, supplier_id,
                             quantity, reorder_threshold, is_active, image_type, image_data, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.name, input.sku, input.description, input.price.toFixed(2),
        input.costPrice === null ? null : input.costPrice.toFixed(2),
        input.categoryId, input.supplierId, initialQuantity, input.reorderThreshold,
        input.isActive ? 1 : 0, image?.type ?? null, image?.data ?? null, userId,
      ],
    );
    if (initialQuantity > 0) {
      await connection.execute(
        "INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, previous_quantity, resulting_quantity, reason, created_by) VALUES (?, ?, 'STOCK_IN', ?, 0, ?, ?, ?)",
        [randomUUID(), id, initialQuantity, initialQuantity, "Initial stock", userId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    return mapDbError(error);
  } finally {
    connection.release();
  }
  return getAdminProduct(id);
}

// Quantity is intentionally absent: it only changes through stock movements.
export async function updateAdminProduct(
  id: string,
  input: ProductInput,
  image: { replace: Image | null; remove: boolean },
): Promise<AdminProduct> {
  const sets = [
    "name = ?", "sku = ?", "description = ?", "price = ?", "cost_price = ?",
    "category_id = ?", "supplier_id = ?", "reorder_threshold = ?", "is_active = ?",
  ];
  const params: (string | number | Buffer | null)[] = [
    input.name, input.sku, input.description, input.price.toFixed(2),
    input.costPrice === null ? null : input.costPrice.toFixed(2),
    input.categoryId, input.supplierId, input.reorderThreshold, input.isActive ? 1 : 0,
  ];
  if (image.replace) {
    sets.push("image_type = ?", "image_data = ?");
    params.push(image.replace.type, image.replace.data);
  } else if (image.remove) {
    sets.push("image_type = NULL", "image_data = NULL");
  }
  try {
    const [result] = await getDatabasePool().execute<ResultSetHeader>(
      `UPDATE products SET ${sets.join(", ")} WHERE id = ?`,
      [...params, id],
    );
    if (result.affectedRows === 0) throw new HttpError("NOT_FOUND", "Product not found");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    mapDbError(error);
  }
  return getAdminProduct(id);
}

// Products with movement history are deactivated so the history stays intact; others are deleted.
export async function removeAdminProduct(id: string): Promise<"deleted" | "deactivated"> {
  const pool = getDatabasePool();
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM stock_movements WHERE product_id = p.id) AS movements FROM products p WHERE p.id = ?",
      [id],
    );
    if (!rows[0]) throw new HttpError("NOT_FOUND", "Product not found");
    if (Number(rows[0].movements) > 0) {
      await pool.execute("UPDATE products SET is_active = 0 WHERE id = ?", [id]);
      return "deactivated";
    }
    await pool.execute("DELETE FROM products WHERE id = ?", [id]);
    return "deleted";
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return mapDbError(error);
  }
}

export async function listLookups() {
  const pool = getDatabasePool();
  try {
    const [categories] = await pool.execute<RowDataPacket[]>("SELECT id, name FROM categories ORDER BY name LIMIT 500");
    const [suppliers] = await pool.execute<RowDataPacket[]>("SELECT id, name FROM suppliers ORDER BY name LIMIT 500");
    return {
      categories: categories.map((r) => ({ id: r.id as string, name: r.name as string })),
      suppliers: suppliers.map((r) => ({ id: r.id as string, name: r.name as string })),
    };
  } catch (error) {
    return mapDbError(error);
  }
}
