import { connection } from "next/server";

import { adminRoute, parseBody, queryParams } from "@/lib/http/admin-route";
import { jsonOk } from "@/lib/http/responses";
import { listMovements, recordMovement } from "@/lib/stock";
import { stockListQuerySchema, stockMovementSchema } from "@/lib/validation/catalog";

export async function GET(request: Request) {
  await connection();
  return adminRoute(request, "list stock movements", async () =>
    jsonOk(await listMovements(stockListQuerySchema.parse(queryParams(request)))),
  );
}

// Movements are append-only: there is deliberately no PATCH or DELETE. Corrections are new ADJUSTMENT movements.
export async function POST(request: Request) {
  return adminRoute(request, "record stock movement", async (admin) => {
    const body = await parseBody(request, stockMovementSchema);
    if (body.response) return body.response;
    return jsonOk({ movement: await recordMovement(admin.id, body.data) }, 201);
  });
}
