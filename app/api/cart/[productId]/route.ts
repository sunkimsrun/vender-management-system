import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { listCart, removeFromCart, setCartQuantity } from "@/lib/cart";
import { readJsonBody } from "@/lib/http/body";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { cartProductIdSchema, updateCartSchema } from "@/lib/validation/cart";

type Context = { params: Promise<{ productId: string }> };

const NOT_FOUND = () => new HttpError("NOT_FOUND", "Item not found in cart");

async function resolveId(context: Context): Promise<string> {
  const parsed = cartProductIdSchema.safeParse((await context.params).productId);
  if (!parsed.success) throw NOT_FOUND();
  return parsed.data;
}

function fail(error: unknown, action: string) {
  if (!(error instanceof HttpError)) logServerError(action, error);
  return jsonError(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireAuth(request);
    requireRole(user, "USER", "STAFF");
    const productId = await resolveId(context);
    const parsed = updateCartSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return validationError(parsed.error);
    if (!(await setCartQuantity(user.id, productId, parsed.data.quantity))) throw NOT_FOUND();
    return jsonOk({ items: await listCart(user.id) });
  } catch (error) {
    return fail(error, "update cart");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireAuth(request);
    requireRole(user, "USER", "STAFF");
    if (!(await removeFromCart(user.id, await resolveId(context)))) throw NOT_FOUND();
    return jsonOk({ items: await listCart(user.id) });
  } catch (error) {
    return fail(error, "remove from cart");
  }
}
