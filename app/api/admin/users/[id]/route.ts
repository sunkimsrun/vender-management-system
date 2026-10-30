import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/http/body";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { deleteManagedUser, isDuplicateEntryError, updateManagedUser } from "@/lib/users";
import { adminUpdateUserSchema, userIdSchema } from "@/lib/validation/admin-users";

type Context = { params: Promise<{ id: string }> };

// Only USER and STAFF accounts are manageable; admins and unknown IDs both look like "not found".
const NOT_FOUND = () => new HttpError("NOT_FOUND", "User not found");

async function resolveId(context: Context): Promise<string> {
  const parsed = userIdSchema.safeParse((await context.params).id);
  if (!parsed.success) throw NOT_FOUND();
  return parsed.data;
}

function fail(error: unknown, action: string) {
  if (!(error instanceof HttpError)) logServerError(action, error);
  return jsonError(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    requireRole(await requireAuth(request), "ADMIN");
    const id = await resolveId(context);

    const parsed = adminUpdateUserSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return validationError(parsed.error);

    const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : undefined;
    try {
      const user = await updateManagedUser(id, { email: parsed.data.email, passwordHash, role: parsed.data.role });
      if (!user) throw NOT_FOUND();
      return jsonOk({ user });
    } catch (error) {
      if (isDuplicateEntryError(error)) throw new HttpError("CONFLICT", "That email is already in use");
      throw error;
    }
  } catch (error) {
    return fail(error, "admin update user");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireRole(await requireAuth(request), "ADMIN");
    if (!(await deleteManagedUser(await resolveId(context)))) throw NOT_FOUND();
    return jsonOk({ success: true });
  } catch (error) {
    return fail(error, "admin delete user");
  }
}
