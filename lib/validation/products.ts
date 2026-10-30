import { z } from "zod";

export const productIdSchema = z.uuid();

export const createProductSchema = z.object({
  name: z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(200, "Name is too long"),
  description: z.string({ error: "Description is required" }).trim().max(5_000, "Description is too long"),
  price: z
    .number({ error: "Price must be a number" })
    .min(0, "Price cannot be negative")
    .max(99_999_999.99, "Price is too large"),
});
