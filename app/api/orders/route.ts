import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { checkout, listOrders } from "@/lib/orders";
import { checkRateLimit } from "@/lib/rate-limit";

// Customers (USER) and STAFF buy; admins manage the catalog instead. The buyer is always the authenticated user.
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireAuth(request);
    requireRole(user, "USER", "STAFF");
    return jsonOk({ orders: await listOrders(user.id) });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("list orders", error);
    return jsonError(error);
  }
}

// Takes no body: the purchase is built from the server-side cart, so the client can't set prices or quantities.
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    requireRole(user, "USER", "STAFF");
    const limit = checkRateLimit(`checkout:${user.id}`, 20, 15 * 60 * 1000);
    if (!limit.allowed) {
      const response = jsonError(new HttpError("RATE_LIMITED", "Too many orders. Try again later."));
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }
    return jsonOk({ order: await checkout(user.id) }, 201);
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("checkout", error);
    return jsonError(error);
  }
}
