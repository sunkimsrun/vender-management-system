import { HttpError } from "@/lib/http/errors";
import { MAX_IMAGE_BYTES, readImageFile } from "@/lib/validation/image";

export async function readProductForm(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError("BAD_REQUEST", "Image must be 2 MB or smaller");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError("BAD_REQUEST", "Invalid form data");
  }
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : undefined;
  };
  const raw = {
    name: text("name"),
    description: text("description") ?? "",
    sku: text("sku") ?? null,
    price: text("price"),
    costPrice: text("costPrice"),
    categoryId: text("categoryId"),
    supplierId: text("supplierId"),
    reorderThreshold: text("reorderThreshold"),
    isActive: text("isActive"),
    initialQuantity: text("initialQuantity"),
  };
  const file = form.get("image");
  const image = file instanceof File && file.size > 0 ? await readImageFile(file) : null;
  return { raw, image, removeImage: text("removeImage") === "true" };
}
