/**
 * GIMMS — SINGLE SOURCE OF TRUTH FOR SERVER-SIDE ENVIRONMENT ACCESS.
 *
 * Rules enforced by this module:
 *  1. SECRET VALUES ARE NEVER EXPORTED AS CONSTANTS AT MODULE LOAD. Every getter is
 *     lazy, so `next build` succeeds with zero secrets present (it does today) and a
 *     missing secret only fails the one feature that needs it, at request time.
 *  2. NO VALUE IS EVER LOGGED, RETURNED TO A CLIENT, OR INCLUDED IN AN ERROR MESSAGE.
 *     Only `present: boolean` is ever surfaced (see `envHealth()`).
 *  3. PRODUCTION FAILS CLOSED. `requireVar()` throws in production; in development it
 *     throws the same way, so a missing secret can never silently become "enabled".
 *
 * Server-only. Never import this from a "use client" component.
 */

export const isProduction = process.env.NODE_ENV === "production";
export const isVercel = Boolean(process.env.VERCEL);

/** A non-secret env var with a default (safe to echo to clients). */
export function optionalVar(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

/** True when the variable exists and is non-empty. Never reveals the value. */
export function hasVar(name: string): boolean {
  const raw = process.env[name];
  return Boolean(raw && raw.trim().length > 0);
}

/**
 * Returns the secret, or throws a message that names the VARIABLE only.
 * The thrown message is safe to log (it never contains the value).
 */
export function requireVar(name: string, feature: string): string {
  const raw = process.env[name];
  if (raw && raw.trim().length > 0) return raw.trim();
  throw new Error(`[env] ${name} is not configured. It is required for: ${feature}. Set it in Vercel → Project → Settings → Environment Variables (never in chat).`);
}

/** Supabase REST access used by lib/store.ts. Both vars or neither. */
export function supabaseConfig(): { url: string; serviceRoleKey: string; table: string } {
  return {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    table: optionalVar("HUB_STATE_TABLE", "hub_state"),
  };
}

export const OWNER_EMAIL = () => optionalVar("OWNER_EMAIL", "info.ceyteq@gmail.com");

/**
 * Presence-only health map. This is what `/api/admin/security` reports so the Owner
 * can see *which* protections are live without any value crossing the wire.
 */
export function envHealth() {
  return {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    runtimeHost: isVercel ? "vercel" : "local",
    present: {
      SUPABASE_URL: hasVar("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: hasVar("SUPABASE_SERVICE_ROLE_KEY"),
      OWNER_BOOTSTRAP_TOKEN: hasVar("OWNER_BOOTSTRAP_TOKEN"),
      AGENT_WORKER_URL: hasVar("AGENT_WORKER_URL"),
      AGENT_WORKER_SECRET: hasVar("AGENT_WORKER_SECRET"),
      BROWSERLESS_TOKEN: hasVar("BROWSERLESS_TOKEN"),
      CRON_SECRET: hasVar("CRON_SECRET"),
    },
    note: "Presence flags only. No secret value is read into this response.",
  };
}
