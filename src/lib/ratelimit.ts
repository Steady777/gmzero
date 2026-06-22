import "server-only";

/**
 * Dependency-free in-memory rate limiter (fixed window per key).
 *
 * Cost-bearing routes (0G Compute inference, on-chain txs, Storage writes) are
 * otherwise unauthenticated — without this, anyone can loop requests and drain
 * the server wallet's balance/ledger. This is a best-effort guard suited to a
 * single-instance deployment; a multi-instance prod deploy should swap this for
 * a shared store (e.g. Upstash Redis) keyed the same way.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Remove expired buckets occasionally so the map can't grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfter: number; // seconds until the window resets
}

/**
 * @param key      unique identifier for the caller (e.g. `gm:<ip>`)
 * @param limit    max requests allowed per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { success: true, remaining: limit - existing.count, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel/standard reverse proxies). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

/**
 * Convenience guard: returns a 429 Response when the caller is over the limit,
 * or null when the request may proceed.
 */
export function enforceRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Response | null {
  const { success, retryAfter } = rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (success) return null;
  return new Response(
    JSON.stringify({ error: "Too many requests. Slow down." }),
    {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
    },
  );
}
