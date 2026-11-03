/**
 * GIMMS — ONE WRITE GUARD FOR EVERY MUTATING API ROUTE.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this patchset, 7 of 14 API routes accepted unauthenticated POSTs:
 *   /api/tasks, /api/jobs, /api/skills, /api/dept01, /api/developer-team,
 *   /api/production/ai-team, /api/connect
 * Anyone who found the public Vercel URL could create jobs, run the 114 local
 * skills (which spawn `git`/`npx tsc` and write files), approve records, and fire
 * outbound probes. That is the highest-severity finding in the Phase 1 audit.
 *
 * POLICY
 * ------
 *   1. `guardMutation()` runs first — blocks cross-site/cross-origin POSTs.
 *   2. A valid Owner session always passes.
 *   3. In PRODUCTION, no valid session means 401. Fail closed. Always.
 *   4. In DEVELOPMENT, an anonymous caller is allowed and the response is tagged
 *      `authMode: "development-anonymous"` so nothing can mistake a dev run for a
 *      production-authorised action. This keeps the existing CI harness working
 *      against `npm run dev` without weakening the deployed app.
 *
 * Read-only GET handlers are intentionally NOT gated (the hub is a read-mostly
 * dashboard); they must never return a secret, and several strip internals.
 *
 * Server-only. Node runtime.
 */

import { requireOwner, type OwnerProfile } from "@/lib/owner-auth";
import { guardMutation } from "@/lib/request-guard";
import { isProduction } from "@/lib/env";

export type WriteAuth =
  | { ok: true; mode: "owner"; profile: OwnerProfile }
  | { ok: true; mode: "development-anonymous"; profile: null }
  | { ok: false; status: number; error: string };

export async function requireOwnerWrite(request: Request): Promise<WriteAuth> {
  const guard = guardMutation(request);
  if (!guard.ok) return { ok: false, status: guard.status, error: guard.error };

  const auth = await requireOwner(request);
  if (auth.ok) return { ok: true, mode: "owner", profile: auth.profile };

  if (!isProduction) {
    return { ok: true, mode: "development-anonymous", profile: null };
  }

  return {
    ok: false,
    status: 401,
    error: "Owner session required for this action. Sign in at /admin/login (or /chat), then retry.",
  };
}

/** Headers + body fragment so every response states which auth mode applied. */
export function authTag(auth: WriteAuth): { authMode: string } {
  return { authMode: auth.ok ? auth.mode : "rejected" };
}
