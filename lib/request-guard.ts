/**
 * GIMMS — CSRF / CROSS-SITE REQUEST GUARD.
 *
 * Every state-changing request (POST/PUT/PATCH/DELETE) must prove it came from the
 * GIMMS app itself. Defence in depth, three independent checks:
 *
 *   1. Sec-Fetch-Site   → modern browsers send this automatically. "same-origin" or
 *                         "none" is allowed; "cross-site" / "same-site" is rejected.
 *   2. Origin           → if present it must match the request's own Host. A page on
 *                         evil.com cannot forge this header from a browser.
 *   3. Referer          → fallback for older clients, same rule as Origin.
 *
 * Why the cookie's SameSite=Lax is not enough on its own: Lax still permits top-level
 * GET navigations, and a GET handler that mutates state (a real bug we are fixing in
 * this same patchset) would be reachable. This guard closes that class entirely.
 *
 * Server-only, Edge-safe (uses only Web APIs).
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type GuardResult = { ok: true } | { ok: false; status: number; error: string };

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * @param request the incoming Request
 * @param options.allowMissingOrigin set true ONLY for a non-browser caller that is
 *        already authenticated by a shared secret (e.g. Vercel Cron, worker callback).
 */
export function guardMutation(
  request: Request,
  options: { allowMissingOrigin?: boolean } = {},
): GuardResult {
  if (!MUTATING.has(request.method.toUpperCase())) return { ok: true };

  /**
   * The set of hosts this request legitimately arrived on.
   *
   * Why not just `new URL(request.url).host`? A dev server bound to 0.0.0.0 reports
   * `0.0.0.0:3000` in request.url while the browser sends `Origin: http://localhost:3000`,
   * which is a legitimate same-origin request. The `Host` header is authoritative for
   * what the client actually addressed, and browsers always keep Origin and Host
   * consistent, so comparing Origin against Host is both correct and standard.
   *
   * `x-forwarded-host` is added for reverse-proxied deployments. It is NOT trusted on
   * its own: a forged value only widens the match set for a browser that already had
   * to send a matching Origin, and a non-browser attacker gains nothing because the
   * session cookie is httpOnly and is not sent cross-site.
   */
  const allowedHosts = new Set<string>();
  for (const candidate of [
    (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return null;
      }
    })(),
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",")[0] ?? null,
  ]) {
    if (candidate) allowedHosts.add(candidate.trim().toLowerCase());
  }
  if (allowedHosts.size === 0) return { ok: false, status: 400, error: "Malformed request: no usable Host." };

  const matchesHost = (value: string | null): boolean => {
    if (!value) return false;
    const host = hostOf(value);
    return Boolean(host && allowedHosts.has(host));
  };

  const fetchSite = (request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { ok: false, status: 403, error: `Cross-site request blocked (Sec-Fetch-Site: ${fetchSite}).` };
  }

  const origin = request.headers.get("origin");
  if (origin) {
    // `origin: null` is sent for sandboxed iframes and file:// — reject it outright.
    if (origin === "null") return { ok: false, status: 403, error: "Opaque origin blocked." };
    if (!matchesHost(origin)) {
      const detail = process.env.NODE_ENV === "production" ? "" : ` [origin=${origin} allowed=${[...allowedHosts].join("|")}]`;
      return { ok: false, status: 403, error: `Cross-origin request blocked (Origin does not match Host).${detail}` };
    }
    return { ok: true };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    if (!matchesHost(referer)) {
      return { ok: false, status: 403, error: "Cross-origin request blocked (Referer does not match Host)." };
    }
    return { ok: true };
  }

  if (options.allowMissingOrigin) return { ok: true };

  return {
    ok: false,
    status: 403,
    error: "Request rejected: no Origin or Referer header. State-changing calls must come from the GIMMS app.",
  };
}

/**
 * Constant-time string comparison for shared secrets (cron secret, worker secret).
 * Uses a length-normalising XOR loop so timing does not leak the shared prefix.
 */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = provided.trim();
  const b = expected.trim();
  if (a.length === 0 || b.length === 0) return false;
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

/** Extract `Bearer <token>` from an Authorization header. */
export function bearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}
