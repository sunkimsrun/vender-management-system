import { connection } from "next/server";

import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError } from "@/lib/http/responses";
import { getProductImage } from "@/lib/products";
import { productIdSchema } from "@/lib/validation/products";

// Public, like the catalog itself. The stored content type comes from server-side byte sniffing.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const id = productIdSchema.safeParse((await params).id);
    const image = id.success ? await getProductImage(id.data) : null;
    if (!image) throw new HttpError("NOT_FOUND", "Image not found");
    return new Response(new Uint8Array(image.data), {
      headers: { "Content-Type": image.type, "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("product image", error);
    return jsonError(error);
  }
}
