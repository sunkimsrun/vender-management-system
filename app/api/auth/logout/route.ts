import type { NextRequest } from "next/server";

import { revokeRefreshSession } from "@/lib/auth/refresh-token";
import { clearRefreshCookie, REFRESH_COOKIE_NAME } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/csrf";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Logout ends only the current session (this token's family); other devices stay signed in.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    const limit = checkRateLimit(`logout:ip:${getClientIp(request)}`, 60, 15 * 60 * 1000);
    if (!limit.allowed) {
      const response = jsonError(
        new HttpError("RATE_LIMITED", "Too many attempts. Try again later."),
      );
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }

    const rawToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (rawToken && rawToken.length <= 200) {
      await revokeRefreshSession(rawToken);
    }

    // Always succeed and clear the cookie, so repeated or cookie-less logouts are harmless.
    const response = jsonOk({ success: true });
    clearRefreshCookie(response);
    return response;
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("logout", error);
    return jsonError(error);
  }
}
