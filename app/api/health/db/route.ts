import { connection } from "next/server";

import { getDatabasePool } from "@/lib/db";

export async function GET() {
  await connection();

  try {
    await getDatabasePool().query("SELECT 1");
    return Response.json({ status: "ok", database: "connected" });
  } catch {
    return Response.json(
      { status: "error", error: "Database unavailable" },
      { status: 503 },
    );
  }
}
