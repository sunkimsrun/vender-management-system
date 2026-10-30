import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { deleteProduct } from "@/lib/products";
import { productIdSchema } from "@/lib/validation/products";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");
    const id = productIdSchema.safeParse((await params).id);
    if (!id.success || !(await deleteProduct(id.data))) throw new HttpError("NOT_FOUND", "Product not found");
    return jsonOk({ ok: true });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("delete product", error);
    return jsonError(error);
  }
}
