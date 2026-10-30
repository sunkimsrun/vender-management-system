import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { listLookups } from "@/lib/inventory-products";

export async function GET(request: Request) {
  await connection();
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");
    return jsonOk(await listLookups());
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("list lookups", error);
    return jsonError(error);
  }
}
