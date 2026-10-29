import { z } from "zod";

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 9;
// bcrypt only uses the first 72 bytes, so longer input is rejected instead of silently truncated.
export const PASSWORD_MAX_BYTES = 72;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string({ error: "Email is required" })
  .max(EMAIL_MAX_LENGTH, "Email is too long")
  .transform(normalizeEmail)
  .pipe(z.email("Enter a valid email address"));

const withinByteLimit = (value: string) =>
  new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES;

// Password policy: length over complexity (NIST-style). No composition rules.
export const newPasswordSchema = z
  .string({ error: "Password is required" })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .refine(withinByteLimit, `Password must be at most ${PASSWORD_MAX_BYTES} bytes`);

// Unknown keys (e.g. a submitted "role") are stripped, so clients can never set a role.
export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

export const adminRegisterSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  inviteCode: z.string({ error: "Invite code is required" }).min(1).max(200),
});

// Login does not enforce the registration policy, so it reveals nothing about it.
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required")
    .refine(withinByteLimit, "Invalid credentials"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
