import { z } from "zod";

import { emailSchema, newPasswordSchema } from "@/lib/validation/auth";

export const userIdSchema = z.uuid();

export const adminCreateUserSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

// Only these fields can change; a role can never be set through this API.
export const adminUpdateUserSchema = z
  .object({
    email: emailSchema.optional(),
    password: newPasswordSchema.optional(),
  })
  .refine((value) => value.email !== undefined || value.password !== undefined, {
    message: "Provide an email or a password to update",
  });
