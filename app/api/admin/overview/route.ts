import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { getInventoryOverview } from "@/lib/inventory-stats";

const DAY_MS = 86_400_000;

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireAuth(request);
    requireRole(user, "ADMIN");

    const params = new URL(request.url).searchParams;
    const to = parseDate(params.get("to")) ?? new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS);
    const from = parseDate(params.get("from")) ?? new Date(to.getTime() - 29 * DAY_MS);
    if (from > to || to.getTime() - from.getTime() > 366 * DAY_MS) {
      throw new HttpError("VALIDATION_ERROR", "Choose a valid date range of at most one year.");
    }
    // Make the "to" day inclusive.
    const end = new Date(to.getTime() + DAY_MS - 1);

    try {
      return jsonOk(await getInventoryOverview(from, end));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
        throw new HttpError("SERVICE_UNAVAILABLE", "Inventory tables are missing. Run db/006_inventory.sql as MySQL root.");
      }
      throw error;
    }
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("inventory overview", error);
    return jsonError(error);
  }
}
