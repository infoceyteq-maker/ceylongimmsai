/**
 * GIMMS — cookie name constants with ZERO imports.
 *
 * This file exists so that `middleware.ts` (Edge runtime) and server routes can agree
 * on cookie names without the Edge bundle pulling in `node:fs` / `node:crypto` from
 * lib/owner-auth.ts.
 */

/** Development / non-HTTPS name. */
export const OWNER_COOKIE_DEV = "gimms_owner_session";

/**
 * Production name using the `__Host-` prefix. This prefix is enforced by the browser:
 *  - must be set with Secure
 *  - must have Path=/
 *  - must NOT have a Domain attribute
 * Those three properties make cookie injection from a sibling subdomain impossible.
 */
export const OWNER_COOKIE_PROD = "__Host-gimms_owner_session";

export function ownerCookieName(isProduction: boolean): string {
  return isProduction ? OWNER_COOKIE_PROD : OWNER_COOKIE_DEV;
}

/** Both names, for read paths that must tolerate a mid-migration cookie. */
export const OWNER_COOKIE_NAMES = [OWNER_COOKIE_PROD, OWNER_COOKIE_DEV] as const;

/** Length of a real session token: 32 random bytes hex-encoded. */
export const OWNER_TOKEN_LENGTH = 64;

/**
 * Cheap structural check used by middleware. This is NOT authentication — it only
 * rejects obviously junk cookies before a route handler runs. The authoritative check
 * is `verifySession()` in lib/owner-auth.ts.
 */
export function looksLikeOwnerToken(value: string | undefined | null): boolean {
  return typeof value === "string" && value.length === OWNER_TOKEN_LENGTH && /^[0-9a-f]+$/.test(value);
}
