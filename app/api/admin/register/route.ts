import { createHash, timingSafeEqual } from "node:crypto";

import { hashPassword } from "@/lib/auth/password";
import { getAdminInviteCode, getStaffInviteCode } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http/csrf";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createAdminUser, createUser, emailExists, isDuplicateEntryError } from "@/lib/users";
import { adminRegisterSchema } from "@/lib/validation/auth";

const MAX_BODY_BYTES = 4 * 1024;
const REJECTED = "Unable to register with these details";

function inviteCodeMatches(provided: string, expected: string): boolean {
  // Hashing gives equal-length buffers, so the comparison is constant-time.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const limit = checkRateLimit(`admin-register:${getClientIp(request)}`, 5, 60 * 60 * 1000);
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

    const parsed = adminRegisterSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { email, password, inviteCode } = parsed.data;

    // The code picks the role. Disabled, wrong code, and duplicate email all look the same to the caller.
    const adminCode = getAdminInviteCode();
    const staffCode = getStaffInviteCode();
    const passwordHash = await hashPassword(password);
    // Both comparisons always run so timing doesn't reveal which code was close.
    const isAdminCode = adminCode !== null && inviteCodeMatches(inviteCode, adminCode);
    const isStaffCode = staffCode !== null && inviteCodeMatches(inviteCode, staffCode);
    if (!isAdminCode && !isStaffCode) {
      throw new HttpError("FORBIDDEN", REJECTED);
    }
    if (await emailExists(email)) throw new HttpError("FORBIDDEN", REJECTED);

    try {
      const user = isAdminCode
        ? await createAdminUser(email, passwordHash)
        : await createUser(email, passwordHash, "STAFF");
      return jsonOk({ user }, 201);
    } catch (error) {
      if (isDuplicateEntryError(error)) throw new HttpError("FORBIDDEN", REJECTED);
      throw error;
    }
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("admin register", error);
    return jsonError(error);
  }
}
