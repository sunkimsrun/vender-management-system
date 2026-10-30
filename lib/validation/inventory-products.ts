import { z } from "zod";

const optionalId = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid("Invalid selection").nullable());
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
  z.number({ error: "Must be a number" }).min(0, "Cannot be negative").max(99_999_999.99, "Too large").nullable(),
);
const intField = (label: string, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number({ error: `${label} is required` }).int(`${label} must be a whole number`).min(0, `${label} cannot be negative`).max(max, `${label} is too large`),
  );

const baseFields = {
  name: z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(200, "Name is too long"),
  description: z.string().trim().max(5_000, "Description is too long").default(""),
  sku: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .min(1)
      .max(64, "SKU is too long")
      .regex(/^[A-Za-z0-9._-]+$/, "SKU may only contain letters, numbers, dots, dashes and underscores")
      .nullable(),
  ),
  price: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number({ error: "Price is required" }).min(0, "Price cannot be negative").max(99_999_999.99, "Price is too large"),
  ),
  costPrice: optionalMoney,
  categoryId: optionalId,
  supplierId: optionalId,
  reorderThreshold: intField("Reorder threshold", 1_000_000),
  isActive: z.preprocess((v) => v !== "false" && v !== false, z.boolean()),
};

// Stock quantity is only accepted on creation (as the initial stock movement); edits never touch it.
export const createInventoryProductSchema = z.object({
  ...baseFields,
  initialQuantity: intField("Initial quantity", 1_000_000),
});

export const updateInventoryProductSchema = z.object(baseFields);

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(10),
  q: z.string().trim().max(100).catch(""),
  categoryId: z.uuid().optional().catch(undefined),
  supplierId: z.uuid().optional().catch(undefined),
  stock: z.enum(["in", "low", "out"]).optional().catch(undefined),
  sort: z.enum(["name", "price", "quantity", "created_at"]).catch("created_at"),
  order: z.enum(["asc", "desc"]).catch("desc"),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
