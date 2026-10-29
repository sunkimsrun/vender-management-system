import "server-only";

import { verifyAccessToken } from "@/lib/auth/access-token";
import { getAuthConfig } from "@/lib/env";
import { HttpError } from "@/lib/http/errors";
import { findPublicUserById, type PublicUser } from "@/lib/users";

const UNAUTHENTICATED = "Authentication required";

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9._-]{1,4096})$/.exec(header);
  return match ? match[1] : null;
}

// Authenticates a request from its Bearer access token. Identity and role come only from the
// verified token and the database, never from the body, query string, or client state.
export async function requireAuth(request: Request): Promise<PublicUser> {
  const token = readBearerToken(request);
  if (!token) throw new HttpError("UNAUTHORIZED", UNAUTHENTICATED);

  const claims = await verifyAccessToken(token);
  if (!claims) throw new HttpError("UNAUTHORIZED", UNAUTHENTICATED);

  // Reload the user so deleted accounts and role changes apply before the token expires.
  const user = await findPublicUserById(claims.sub);
  if (!user) throw new HttpError("UNAUTHORIZED", UNAUTHENTICATED);

  return user;
}

export const REFRESH_COOKIE_NAME = "refresh_token";
// Scoped so the browser only sends the cookie to auth endpoints.
const REFRESH_COOKIE_PATH = "/api/auth";

function cookieAttributes(maxAge: number): string {
  const parts = [
    `Path=${REFRESH_COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function setRefreshCookie(response: Response, token: string): void {
  const maxAge = getAuthConfig().refreshTokenTtlSeconds;
  response.headers.append(
    "Set-Cookie",
    `${REFRESH_COOKIE_NAME}=${token}; ${cookieAttributes(maxAge)}`,
  );
}

export function clearRefreshCookie(response: Response): void {
  response.headers.append(
    "Set-Cookie",
    `${REFRESH_COOKIE_NAME}=; ${cookieAttributes(0)}`,
  );
}
