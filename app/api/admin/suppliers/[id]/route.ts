import { adminRoute, parseBody, parseId } from "@/lib/http/admin-route";
import { jsonOk } from "@/lib/http/responses";
import { removeSupplier, updateSupplier } from "@/lib/inventory-catalog";
import { supplierSchema } from "@/lib/validation/catalog";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return adminRoute(request, "update supplier", async () => {
    const id = parseId((await context.params).id, "Supplier");
    const body = await parseBody(request, supplierSchema);
    if (body.response) return body.response;
    return jsonOk({ supplier: await updateSupplier(id, body.data) });
  });
}

export async function DELETE(request: Request, context: Context) {
  return adminRoute(request, "remove supplier", async () =>
    jsonOk({ result: await removeSupplier(parseId((await context.params).id, "Supplier")) }),
  );
}
