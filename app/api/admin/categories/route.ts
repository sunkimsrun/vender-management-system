import { connection } from "next/server";

import { adminRoute, parseBody, queryParams } from "@/lib/http/admin-route";
import { jsonOk } from "@/lib/http/responses";
import { createCategory, listCategories } from "@/lib/inventory-catalog";
import { categoryListQuerySchema, categorySchema } from "@/lib/validation/catalog";

export async function GET(request: Request) {
  await connection();
  return adminRoute(request, "list categories", async () =>
    jsonOk(await listCategories(categoryListQuerySchema.parse(queryParams(request)))),
  );
}

export async function POST(request: Request) {
  return adminRoute(request, "create category", async () => {
    const body = await parseBody(request, categorySchema);
    if (body.response) return body.response;
    return jsonOk({ category: await createCategory(body.data) }, 201);
  });
}
