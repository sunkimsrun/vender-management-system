import type { NextRequest } from "next/server";

import { signAccessToken } from "@/lib/auth/access-token";
import { rotateRefreshToken } from "@/lib/auth/refresh-token";
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/csrf";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const SESSION_INVALID = "Session expired. Please sign in again.";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    const limit = checkRateLimit(`refresh:ip:${getClientIp(request)}`, 30, 15 * 60 * 1000);
    if (!limit.allowed) {
      const response = jsonError(
        new HttpError("RATE_LIMITED", "Too many attempts. Try again later."),
      );
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }

    const rawToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (!rawToken || rawToken.length > 200) {
      throw new HttpError("UNAUTHORIZED", SESSION_INVALID);
    }

    const result = await rotateRefreshToken(rawToken);
    if (result.status !== "ok") {
      // Missing, expired, revoked, and reused tokens all look the same to the client.
      const response = jsonError(new HttpError("UNAUTHORIZED", SESSION_INVALID));
      clearRefreshCookie(response);
      return response;
    }

    const { token, expiresIn } = await signAccessToken({
      id: result.userId,
      role: result.role,
    });
    const response = jsonOk({ accessToken: token, tokenType: "Bearer", expiresIn });
    setRefreshCookie(response, result.token);
    return response;
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("refresh", error);
    return jsonError(error);
  }
}
