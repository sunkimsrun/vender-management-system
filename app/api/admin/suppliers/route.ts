import { connection } from "next/server";

import { adminRoute, parseBody, queryParams } from "@/lib/http/admin-route";
import { jsonOk } from "@/lib/http/responses";
import { createSupplier, listSuppliers } from "@/lib/inventory-catalog";
import { supplierListQuerySchema, supplierSchema } from "@/lib/validation/catalog";

export async function GET(request: Request) {
  await connection();
  return adminRoute(request, "list suppliers", async () =>
    jsonOk(await listSuppliers(supplierListQuerySchema.parse(queryParams(request)))),
  );
}

export async function POST(request: Request) {
  return adminRoute(request, "create supplier", async () => {
    const body = await parseBody(request, supplierSchema);
    if (body.response) return body.response;
    return jsonOk({ supplier: await createSupplier(body.data) }, 201);
  });
}
