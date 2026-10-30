import { z } from "zod";

import { emailSchema, newPasswordSchema } from "@/lib/validation/auth";

export const userIdSchema = z.uuid();

// Anything other than USER or STAFF (e.g. ADMIN) is ignored, so admin rights can't be granted here.
const assignableRole = z.enum(["USER", "STAFF"]).optional().catch(undefined);

export const adminCreateUserSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  role: assignableRole,
});

export const adminUpdateUserSchema = z
  .object({
    email: emailSchema.optional(),
    password: newPasswordSchema.optional(),
    role: assignableRole,
  })
  .refine((value) => value.email !== undefined || value.password !== undefined || value.role !== undefined, {
    message: "Provide an email, a password or a role to update",
  });
