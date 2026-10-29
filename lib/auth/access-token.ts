import "server-only";

import { jwtVerify, SignJWT } from "jose";

import { getAuthConfig } from "@/lib/env";
import type { Role } from "@/lib/users";

export type AccessTokenClaims = { sub: string; role: Role };

const ALGORITHM = "HS256";

export async function signAccessToken(user: {
  id: string;
  role: Role;
}): Promise<{ token: string; expiresIn: number }> {
  const config = getAuthConfig();

  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(user.id)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(config.secret);

  return { token, expiresIn: config.accessTokenTtlSeconds };
}

// Returns null for any invalid, expired, or tampered token.
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | null> {
  const config = getAuthConfig();

  try {
    const { payload } = await jwtVerify(token, config.secret, {
      algorithms: [ALGORITHM],
      issuer: config.issuer,
      audience: config.audience,
    });

    if (
      typeof payload.sub !== "string" ||
      (payload.role !== "USER" && payload.role !== "ADMIN")
    ) {
      return null;
    }

    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
