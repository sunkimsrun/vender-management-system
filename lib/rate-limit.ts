import "server-only";

type Bucket = { count: number; resetAt: number };

declare global {
  var authSystemRateLimitBuckets: Map<string, Bucket> | undefined;
}

// In-memory store: fine for one local instance. Production (multi-instance) should swap this module's
// storage for a shared store such as Redis (INCR + EXPIRE) behind the same checkRateLimit signature.
const buckets = (globalThis.authSystemRateLimitBuckets ??= new Map<string, Bucket>());

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// The forwarded header is client-controlled, so it is only used when TRUST_PROXY=true
// (set it only behind a proxy you control that overwrites the header).
// Otherwise all clients share one bucket, which is safe but coarse.
export function getClientIp(request: Request): string {
  if (process.env.TRUST_PROXY !== "true") return "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  // The last entry is the one appended by the trusted proxy.
  return forwarded?.split(",").at(-1)?.trim() || "unknown";
}
