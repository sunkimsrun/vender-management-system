import { z } from "zod";

const quantity = z
  .number({ error: "Quantity must be a number" })
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(99, "Quantity cannot exceed 99");

export const cartProductIdSchema = z.uuid();

export const addToCartSchema = z.object({
  productId: z.uuid({ error: "Invalid product" }),
  quantity: quantity.default(1),
});

export const updateCartSchema = z.object({ quantity });
