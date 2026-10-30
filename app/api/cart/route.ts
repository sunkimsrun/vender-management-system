import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { addToCart, listCart } from "@/lib/cart";
import { readJsonBody } from "@/lib/http/body";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { addToCartSchema } from "@/lib/validation/cart";

// Carts belong to customer (USER) and STAFF accounts; the owner is always the authenticated user.
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireAuth(request);
    requireRole(user, "USER", "STAFF");
    return jsonOk({ items: await listCart(user.id) });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("list cart", error);
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    requireRole(user, "USER", "STAFF");
    const parsed = addToCartSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return validationError(parsed.error);
    if (!(await addToCart(user.id, parsed.data.productId, parsed.data.quantity))) {
      throw new HttpError("NOT_FOUND", "Product not found");
    }
    return jsonOk({ items: await listCart(user.id) }, 201);
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("add to cart", error);
    return jsonError(error);
  }
}
