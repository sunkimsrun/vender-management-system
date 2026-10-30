import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { readProductForm } from "@/lib/inventory-form";
import { getAdminProduct, removeAdminProduct, updateAdminProduct } from "@/lib/inventory-products";
import { updateInventoryProductSchema } from "@/lib/validation/inventory-products";
import { productIdSchema } from "@/lib/validation/products";

type Context = { params: Promise<{ id: string }> };

async function authorizedId(request: Request, context: Context) {
  const admin = await requireAuth(request);
  requireRole(admin, "ADMIN");
  const id = productIdSchema.safeParse((await context.params).id);
  if (!id.success) throw new HttpError("NOT_FOUND", "Product not found");
  return id.data;
}

export async function GET(request: Request, context: Context) {
  await connection();
  try {
    return jsonOk({ product: await getAdminProduct(await authorizedId(request, context)) });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("get admin product", error);
    return jsonError(error);
  }
}

// Does not accept a quantity; stock changes go through stock movements.
export async function PATCH(request: Request, context: Context) {
  try {
    const id = await authorizedId(request, context);
    const { raw, image, removeImage } = await readProductForm(request);
    const parsed = updateInventoryProductSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    return jsonOk({ product: await updateAdminProduct(id, parsed.data, { replace: image, remove: removeImage }) });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("update admin product", error);
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    return jsonOk({ result: await removeAdminProduct(await authorizedId(request, context)) });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("remove admin product", error);
    return jsonError(error);
  }
}
