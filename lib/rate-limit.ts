/**
 * GIMMS — IN-MEMORY SLIDING-WINDOW RATE LIMITER + LOCKOUT.
 *
 * HONEST LIMITATION (stated up front, do not overstate this): state lives in the
 * process. On Vercel each serverless instance has its own map, and instances are
 * recycled. So this is a REAL control against single-source bursts and against
 * lockout-evasion from one client, but it is NOT a global quota. For a global quota
 * the same interface should be backed by Supabase (a `rate_limits` table) or Redis —
 * listed as an open item in the Phase 1 report.
 *
 * Server-only. Zero dependencies.
 */

type Bucket = { hits: number[]; blockedUntil: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

function prune(now: number): void {
  if (buckets.size <= MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    const idle = bucket.hits.length === 0 && bucket.blockedUntil < now;
    if (idle) buckets.delete(key);
  }
  // Still too big: drop the oldest insertion order entries.
  if (buckets.size > MAX_KEYS) {
    const excess = buckets.size - MAX_KEYS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

export type RateResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
  reason?: string;
};

/**
 * @param key      unique per subject (e.g. `owner-login:1.2.3.4`)
 * @param limit    max events inside the window
 * @param windowMs sliding window length
 * @param lockMs   after exceeding the limit, refuse everything for this long
 */
export function rateLimit(key: string, limit: number, windowMs: number, lockMs = 0): RateResult {
  const now = Date.now();
  prune(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [], blockedUntil: 0 };
    buckets.set(key, bucket);
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
      reason: "locked",
    };
  }

  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);
  if (bucket.hits.length >= limit) {
    if (lockMs > 0) bucket.blockedUntil = now + lockMs;
    return {
      allowed: false,
      remaining: 0,
      limit,
      retryAfterSeconds: Math.ceil((lockMs > 0 ? lockMs : windowMs) / 1000),
      reason: "rate_limited",
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.hits.length),
    limit,
    retryAfterSeconds: 0,
  };
}

/** Reset a subject's window — call after a successful login so typos do not accumulate. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Best-effort client identity for rate limiting. Trusts proxy headers only when set. */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  const ip =
    first ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}

export const RATE_LIMITS = {
  /** Owner login: 8 attempts / 10 min, then a 15 min lock. */
  ownerLogin: { limit: 8, windowMs: 10 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  /** Owner registration is a one-time event; keep it very tight. */
  ownerRegister: { limit: 5, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  /** Agent command issuance from the admin console. */
  agentCommand: { limit: 30, windowMs: 5 * 60 * 1000, lockMs: 0 },
  /** Public task creation (kept for backwards compatibility, now Origin-guarded). */
  publicWrite: { limit: 20, windowMs: 5 * 60 * 1000, lockMs: 0 },
} as const;
