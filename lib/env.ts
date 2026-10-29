import "server-only";

import { z } from "zod";

const databaseEnvSchema = z.object({
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1).default("auth_system"),
  DB_USER: z.string().min(1).default("auth_app"),
  DB_PASSWORD: z.string().min(1),
});

const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default("auth-system"),
  JWT_AUDIENCE: z.string().min(1).default("auth-system-api"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
});

export function getAuthConfig() {
  const result = authEnvSchema.safeParse(process.env);

  if (!result.success) {
    const invalidVariables = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");

    throw new Error(`Invalid auth environment configuration: ${invalidVariables}`);
  }

  return {
    secret: new TextEncoder().encode(result.data.JWT_SECRET),
    issuer: result.data.JWT_ISSUER,
    audience: result.data.JWT_AUDIENCE,
    accessTokenTtlSeconds: result.data.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: result.data.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    appOrigin: new URL(result.data.APP_ORIGIN).origin,
  };
}

// Admin sign-up is disabled unless an invite code of at least 20 characters is configured.
export function getAdminInviteCode(): string | null {
  const code = process.env.ADMIN_INVITE_CODE;
  return code && code.length >= 20 ? code : null;
}

export function getDatabaseConfig() {
  const result = databaseEnvSchema.safeParse(process.env);

  if (!result.success) {
    const invalidVariables = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");

    throw new Error(
      `Invalid database environment configuration: ${invalidVariables}`,
    );
  }

  return {
    host: result.data.DB_HOST,
    port: result.data.DB_PORT,
    database: result.data.DB_NAME,
    user: result.data.DB_USER,
    password: result.data.DB_PASSWORD,
  };
}
