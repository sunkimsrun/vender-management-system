import { hashPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createUser, emailExists, isDuplicateEntryError } from "@/lib/users";
import { registerSchema } from "@/lib/validation/auth";

const MAX_BODY_BYTES = 4 * 1024;
const DUPLICATE_MESSAGE = "Unable to register with these details";

export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(`register:${getClientIp(request)}`, 5, 60 * 60 * 1000);
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

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { email, password } = parsed.data;

    // Hash before the existence check so duplicate and new emails take similar time.
    const passwordHash = await hashPassword(password);

    if (await emailExists(email)) {
      throw new HttpError("CONFLICT", DUPLICATE_MESSAGE);
    }

    try {
      const user = await createUser(email, passwordHash);
      return jsonOk({ user }, 201);
    } catch (error) {
      // A concurrent registration can win the race after the check above.
      if (isDuplicateEntryError(error)) {
        throw new HttpError("CONFLICT", DUPLICATE_MESSAGE);
      }
      throw error;
    }
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("register", error);
    return jsonError(error);
  }
}
