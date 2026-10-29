import { signAccessToken } from "@/lib/auth/access-token";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { issueRefreshToken } from "@/lib/auth/refresh-token";
import { setRefreshCookie } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { assertSameOrigin } from "@/lib/http/csrf";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { findCredentialsByEmail } from "@/lib/users";
import { loginSchema } from "@/lib/validation/auth";

const MAX_BODY_BYTES = 4 * 1024;
const INVALID_CREDENTIALS = "Invalid email or password";

// Compared against when the account doesn't exist so response time doesn't reveal it.
let dummyHash: Promise<string> | undefined;

export async function POST(request: Request) {
  try {
    // Login sets a cookie, so block cross-site "login CSRF".
    assertSameOrigin(request);

    const ip = getClientIp(request);
    const limit = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
    if (!limit.allowed) {
      const response = jsonError(
        new HttpError("RATE_LIMITED", "Too many attempts. Try again later."),
      );
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      throw new HttpError("BAD_REQUEST", "Request body too large");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError("BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { email, password } = parsed.data;

    // Per-account limit slows password guessing spread across many IPs.
    const accountLimit = checkRateLimit(`login:email:${email}`, 10, 15 * 60 * 1000);
    if (!accountLimit.allowed) {
      const response = jsonError(
        new HttpError("RATE_LIMITED", "Too many attempts. Try again later."),
      );
      response.headers.set("Retry-After", String(accountLimit.retryAfterSeconds));
      return response;
    }

    const user = await findCredentialsByEmail(email);
    dummyHash ??= hashPassword("dummy-password-for-timing");
    const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));

    if (!user || !valid) {
      throw new HttpError("UNAUTHORIZED", INVALID_CREDENTIALS);
    }

    const { token, expiresIn } = await signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    const response = jsonOk({ accessToken: token, tokenType: "Bearer", expiresIn });
    setRefreshCookie(response, refreshToken);
    return response;
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("login", error);
    return jsonError(error);
  }
}
