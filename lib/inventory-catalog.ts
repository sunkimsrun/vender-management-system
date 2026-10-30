import "server-only";

import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { z } from "zod";

import { getDatabasePool } from "@/lib/db";
import { HttpError } from "@/lib/http/errors";
import type {
  categoryListQuerySchema,
  categorySchema,
  supplierListQuerySchema,
  supplierSchema,
} from "@/lib/validation/catalog";

export type Category = { id: string; name: string; description: string | null; productCount: number; createdAt: string; updatedAt: string };
export type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export function mapCatalogError(error: unknown, label: string): never {
  const code = (error as { code?: string }).code;
  if (code === "ER_DUP_ENTRY") throw new HttpError("CONFLICT", `A ${label} with that name already exists`);
  if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
    throw new HttpError("SERVICE_UNAVAILABLE", "Inventory tables are outdated. Run db/006_inventory.sql and db/007_inventory_details.sql as MySQL root.");
  }
  throw error;
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const iso = (value: unknown) => new Date(value as string).toISOString();

function toCategory(r: RowDataPacket): Category {
  return {
    id: r.id, name: r.name, description: r.description, productCount: Number(r.product_count),
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

function toSupplier(r: RowDataPacket): Supplier {
  return {
    id: r.id, name: r.name, contactPerson: r.contact_person, email: r.contact_email, phone: r.contact_phone,
    address: r.address, isActive: Boolean(r.is_active), productCount: Number(r.product_count),
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

const CATEGORY_SELECT = `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count FROM categories c`;
const SUPPLIER_SELECT = `SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS product_count FROM suppliers s`;

export async function listCategories(query: z.infer<typeof categoryListQuerySchema>) {
  const pool = getDatabasePool();
  const where = query.q ? "WHERE c.name LIKE ? OR c.description LIKE ?" : "";
  const params = query.q ? [like(query.q), like(query.q)] : [];
  try {
    const [count] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM categories c ${where}`, params);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${CATEGORY_SELECT} ${where} ORDER BY c.name LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      params,
    );
    const total = Number(count[0].total);
    return { items: rows.map(toCategory), page: query.page, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
  } catch (error) {
    return mapCatalogError(error, "category");
  }
}

async function getCategory(id: string): Promise<Category> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(`${CATEGORY_SELECT} WHERE c.id = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new HttpError("NOT_FOUND", "Category not found");
  return toCategory(rows[0]);
}

export async function createCategory(input: z.infer<typeof categorySchema>): Promise<Category> {
  const id = randomUUID();
  try {
    await getDatabasePool().execute("INSERT INTO categories (id, name, description) VALUES (?, ?, ?)", [id, input.name, input.description]);
  } catch (error) {
    mapCatalogError(error, "category");
  }
  return getCategory(id);
}

export async function updateCategory(id: string, input: z.infer<typeof categorySchema>): Promise<Category> {
  try {
    const [result] = await getDatabasePool().execute<ResultSetHeader>(
      "UPDATE categories SET name = ?, description = ? WHERE id = ?",
      [input.name, input.description, id],
    );
    if (result.affectedRows === 0) throw new HttpError("NOT_FOUND", "Category not found");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    mapCatalogError(error, "category");
  }
  return getCategory(id);
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await getCategory(id).catch((error) => mapCatalogError(error, "category"));
  if (category.productCount > 0) {
    throw new HttpError(
      "CONFLICT",
      `This category is used by ${category.productCount} product${category.productCount === 1 ? "" : "s"}. Reassign them before deleting it.`,
    );
  }
  await getDatabasePool().execute("DELETE FROM categories WHERE id = ?", [id]);
}

export async function listSuppliers(query: z.infer<typeof supplierListQuerySchema>) {
  const pool = getDatabasePool();
  const where: string[] = [];
  const params: string[] = [];
  if (query.q) {
    where.push("(s.name LIKE ? OR s.contact_person LIKE ? OR s.contact_email LIKE ?)");
    params.push(like(query.q), like(query.q), like(query.q));
  }
  if (query.status) where.push(`s.is_active = ${query.status === "active" ? 1 : 0}`);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  try {
    const [count] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM suppliers s ${clause}`, params);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${SUPPLIER_SELECT} ${clause} ORDER BY s.name LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      params,
    );
    const total = Number(count[0].total);
    return { items: rows.map(toSupplier), page: query.page, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
  } catch (error) {
    return mapCatalogError(error, "supplier");
  }
}

async function getSupplier(id: string): Promise<Supplier> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(`${SUPPLIER_SELECT} WHERE s.id = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new HttpError("NOT_FOUND", "Supplier not found");
  return toSupplier(rows[0]);
}

const supplierValues = (i: z.infer<typeof supplierSchema>) => [i.name, i.contactPerson, i.email, i.phone, i.address, i.isActive ? 1 : 0];

export async function createSupplier(input: z.infer<typeof supplierSchema>): Promise<Supplier> {
  const id = randomUUID();
  try {
    await getDatabasePool().execute(
      "INSERT INTO suppliers (id, name, contact_person, contact_email, contact_phone, address, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, ...supplierValues(input)],
    );
  } catch (error) {
    mapCatalogError(error, "supplier");
  }
  return getSupplier(id);
}

export async function updateSupplier(id: string, input: z.infer<typeof supplierSchema>): Promise<Supplier> {
  try {
    const [result] = await getDatabasePool().execute<ResultSetHeader>(
      "UPDATE suppliers SET name = ?, contact_person = ?, contact_email = ?, contact_phone = ?, address = ?, is_active = ? WHERE id = ?",
      [...supplierValues(input), id],
    );
    if (result.affectedRows === 0) throw new HttpError("NOT_FOUND", "Supplier not found");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    mapCatalogError(error, "supplier");
  }
  return getSupplier(id);
}

// A supplier that products still depend on is deactivated instead of deleted.
export async function removeSupplier(id: string): Promise<"deleted" | "deactivated"> {
  const supplier = await getSupplier(id).catch((error) => mapCatalogError(error, "supplier"));
  const pool = getDatabasePool();
  if (supplier.productCount > 0) {
    await pool.execute("UPDATE suppliers SET is_active = 0 WHERE id = ?", [id]);
    return "deactivated";
  }
  await pool.execute("DELETE FROM suppliers WHERE id = ?", [id]);
  return "deleted";
}
