import { connection } from "next/server";

import { requireRole } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { createProduct, listProducts } from "@/lib/products";
import { MAX_IMAGE_BYTES, readImageFile } from "@/lib/validation/image";
import { createProductSchema } from "@/lib/validation/products";

// Public: the home page catalog is visible to everyone.
export async function GET() {
  await connection();
  try {
    return jsonOk({ products: await listProducts() });
  } catch (error) {
    logServerError("list products", error);
    return jsonError(error);
  }
}

// Admin-only: authentication (401) first, then the role (403). Accepts multipart form data.
export async function POST(request: Request) {
  try {
    const admin = await requireAuth(request);
    requireRole(admin, "ADMIN");

    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError("BAD_REQUEST", "Image must be 2 MB or smaller");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError("BAD_REQUEST", "Invalid form data");
    }

    const priceRaw = form.get("price");
    const parsed = createProductSchema.safeParse({
      name: form.get("name"),
      description: form.get("description") ?? "",
      price: typeof priceRaw === "string" && priceRaw.trim() !== "" ? Number(priceRaw) : undefined,
    });
    if (!parsed.success) return validationError(parsed.error);

    const file = form.get("image");
    const image = file instanceof File && file.size > 0 ? await readImageFile(file) : null;

    return jsonOk({ product: await createProduct(admin.id, parsed.data, image) }, 201);
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("create product", error);
    return jsonError(error);
  }
}
