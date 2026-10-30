import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { readProductForm } from "@/lib/inventory-form";
import { createAdminProduct, listAdminProducts } from "@/lib/inventory-products";
import { createInventoryProductSchema, productListQuerySchema } from "@/lib/validation/inventory-products";

export async function GET(request: Request) {
  await connection();
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return jsonOk(await listAdminProducts(productListQuerySchema.parse(params)));
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("list admin products", error);
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");
    const { raw, image } = await readProductForm(request);
    const parsed = createInventoryProductSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const { initialQuantity, ...input } = parsed.data;
    return jsonOk({ product: await createAdminProduct(admin.id, input, initialQuantity, image) }, 201);
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("create admin product", error);
    return jsonError(error);
  }
}
