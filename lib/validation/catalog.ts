import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number, label: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `${label} is too long`).nullable().default(null));

export const categorySchema = z.object({
  name: z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(100, "Name is too long"),
  description: optionalText(500, "Description"),
});

export const supplierSchema = z.object({
  name: z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(150, "Name is too long"),
  contactPerson: optionalText(150, "Contact person"),
  email: z.preprocess(
    blankToNull,
    z.string().trim().max(254, "Email is too long").pipe(z.email("Enter a valid email address")).nullable().default(null),
  ),
  phone: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(50, "Phone is too long")
      .regex(/^[0-9+()\-.\s]+$/, "Phone may only contain digits, spaces and + - ( ) .")
      .nullable()
      .default(null),
  ),
  address: optionalText(500, "Address"),
  isActive: z.boolean().default(true),
});

const page = {
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(10),
  q: z.string().trim().max(100).catch(""),
};

export const categoryListQuerySchema = z.object(page);
export const supplierListQuerySchema = z.object({
  ...page,
  status: z.enum(["active", "inactive"]).optional().catch(undefined),
});

const quantity = z
  .number({ error: "Quantity must be a number" })
  .int("Quantity must be a whole number")
  .min(0, "Quantity cannot be negative")
  .max(1_000_000, "Quantity is too large");

// STOCK_IN / STOCK_OUT: `quantity` is the amount moved (>= 1).
// ADJUSTMENT: `quantity` is the new counted quantity; the stored change is the difference (a reason is required).
export const stockMovementSchema = z
  .object({
    productId: z.uuid({ error: "Choose a product" }),
    type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT"], { error: "Choose a movement type" }),
    quantity,
    reason: z.preprocess(blankToNull, z.string().trim().max(255, "Reason is too long").nullable().default(null)),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "ADJUSTMENT" && value.quantity < 1) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be at least 1" });
    }
    if (value.type === "ADJUSTMENT" && !value.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for adjustments" });
    }
  });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const stockListQuerySchema = z.object({
  ...page,
  productId: z.uuid().optional().catch(undefined),
  userId: z.uuid().optional().catch(undefined),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT"]).optional().catch(undefined),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
});
