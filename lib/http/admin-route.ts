import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, validationError } from "@/lib/http/responses";
import { readJsonBody } from "@/lib/http/body";
import { productIdSchema } from "@/lib/validation/products";
import type { z } from "zod";

type Admin = Awaited<ReturnType<typeof requireAuth>>;

// Wraps an admin-only handler: auth (401) then role (403), consistent logging and error shaping.
export async function adminRoute(request: Request, label: string, run: (admin: Admin) => Promise<Response>) {
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");
    return await run(admin);
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError(label, error);
    return jsonError(error);
  }
}

export async function parseBody<S extends z.ZodType>(request: Request, schema: S) {
  const parsed = schema.safeParse(await readJsonBody(request));
  return parsed.success ? { data: parsed.data as z.infer<S> } : { response: validationError(parsed.error) };
}

export function parseId(value: string, label: string) {
  const id = productIdSchema.safeParse(value);
  if (!id.success) throw new HttpError("NOT_FOUND", `${label} not found`);
  return id.data;
}

export const queryParams = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);
