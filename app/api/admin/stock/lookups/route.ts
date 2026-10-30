import { connection } from "next/server";

import { adminRoute } from "@/lib/http/admin-route";
import { jsonOk } from "@/lib/http/responses";
import { listStockLookups } from "@/lib/stock";

export async function GET(request: Request) {
  await connection();
  return adminRoute(request, "stock lookups", async () => jsonOk(await listStockLookups()));
}
