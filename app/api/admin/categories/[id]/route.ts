import { adminRoute, parseBody, parseId } from "@/lib/http/admin-route";
import { jsonOk } from "@/lib/http/responses";
import { deleteCategory, updateCategory } from "@/lib/inventory-catalog";
import { categorySchema } from "@/lib/validation/catalog";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return adminRoute(request, "update category", async () => {
    const id = parseId((await context.params).id, "Category");
    const body = await parseBody(request, categorySchema);
    if (body.response) return body.response;
    return jsonOk({ category: await updateCategory(id, body.data) });
  });
}

export async function DELETE(request: Request, context: Context) {
  return adminRoute(request, "delete category", async () => {
    await deleteCategory(parseId((await context.params).id, "Category"));
    return jsonOk({ ok: true });
  });
}
