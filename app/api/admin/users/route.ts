import { connection } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/http/body";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { createUser, emailExists, isDuplicateEntryError, listUsers } from "@/lib/users";
import { adminCreateUserSchema } from "@/lib/validation/admin-users";

// Admin-only: authentication (401) is checked first, then the role (403), both server-side.
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireAuth(request);
    requireRole(user, "ADMIN");
    return jsonOk({ users: await listUsers() });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("admin users", error);
    return jsonError(error);
  }
}

// Creates a USER account; the role is fixed server-side.
export async function POST(request: Request) {
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");

    const parsed = adminCreateUserSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return validationError(parsed.error);
    const { email, password } = parsed.data;

    if (await emailExists(email)) throw new HttpError("CONFLICT", "That email is already in use");
    const passwordHash = await hashPassword(password);
    try {
      return jsonOk({ user: await createUser(email, passwordHash) }, 201);
    } catch (error) {
      if (isDuplicateEntryError(error)) throw new HttpError("CONFLICT", "That email is already in use");
      throw error;
    }
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("admin create user", error);
    return jsonError(error);
  }
}
