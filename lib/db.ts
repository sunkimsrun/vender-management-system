import "server-only";

import mysql, { type Pool } from "mysql2/promise";

import { getDatabaseConfig } from "@/lib/env";

declare global {
  var authSystemMysqlPool: Pool | undefined;
}

export function getDatabasePool(): Pool {
  if (!globalThis.authSystemMysqlPool) {
    globalThis.authSystemMysqlPool = mysql.createPool({
      ...getDatabaseConfig(),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return globalThis.authSystemMysqlPool;
}
