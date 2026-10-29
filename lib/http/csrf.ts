import "server-only";

import { getAuthConfig } from "@/lib/env";
import { HttpError } from "@/lib/http/errors";

// CSRF defense for cookie-related requests, layered on SameSite=Strict cookies.
// Browsers always send Origin on cross-site POSTs; Referer is only a fallback.
// A missing or foreign origin is rejected. No separate CSRF token is needed: the refresh
// cookie is Strict, and the access token is returned in the body, which other sites cannot read.
export function assertSameOrigin(request: Request): void {
  const expected = getAuthConfig().appOrigin;
  let actual = request.headers.get("origin");

  if (!actual) {
    const referer = request.headers.get("referer");
    try {
      actual = referer ? new URL(referer).origin : null;
    } catch {
      actual = null;
    }
  }

  if (actual !== expected) {
    throw new HttpError("FORBIDDEN", "Request origin not allowed");
  }
}
