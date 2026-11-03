import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner-auth";
import { envHealth, isProduction, isVercel } from "@/lib/env";
import { ownerStatus, ownerStoreIsDurable, SECURITY_BOUNDARIES } from "@/lib/owner-auth";
import { EXEC_POLICY } from "@/lib/exec-guard";
import { POLICY_SUMMARY } from "@/lib/agent/policy";
import { workerConfigured } from "@/lib/agent/dispatcher";
import { storageMode } from "@/lib/agent/store";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

/**
 * GET /api/admin/security — Owner-only posture report.
 *
 * Returns PRESENCE FLAGS ONLY. No secret value, no prefix, no length, no hash of a
 * secret is ever included. The purpose is to let the Owner answer "is my deployment
 * actually hardened?" without opening a terminal — which matters here because the
 * Owner has no working local shell.
 */

type RouteAuth = { route: string; mutations: number; ownerGated: boolean; exception?: string };

/**
 * Routes that legitimately mutate without an Owner session. Each entry needs a
 * written justification — this is how the audit stays honest instead of either
 * producing a false alarm every run or being quietly muted.
 */
const JUSTIFIED_EXCEPTIONS: Record<string, string> = {
  "/api/owner": "the authentication endpoint itself — it cannot require a session to create one",
  "/api/connect": "POST always returns 403 and connects nothing; it exists only to refuse",
};

/** Static audit of the route tree: every route with a POST must be Owner-gated. */
function auditRouteAuth(): { routes: RouteAuth[]; ungated: string[] } {
  const root = path.join(process.cwd(), "app", "api");
  const routes: RouteAuth[] = [];

  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "route.ts") continue;
      let source = "";
      try {
        source = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const mutations = (source.match(/export async function (POST|PUT|PATCH|DELETE)/g) || []).length;
      const ownerGated =
        source.includes("requireOwnerWrite") ||
        source.includes("requireOwner(") ||
        // The callback authenticates with a per-job lease instead of the Owner cookie;
        // it can only ever affect its own job.
        source.includes("leaseMatches");
      const route = "/" + path.relative(path.join(process.cwd(), "app"), full).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
      routes.push({ route, mutations, ownerGated, ...(JUSTIFIED_EXCEPTIONS[route] ? { exception: JUSTIFIED_EXCEPTIONS[route] } : {}) });
    }
  };

  walk(root);
  const ungated = routes
    .filter((entry) => entry.mutations > 0 && !entry.ownerGated && !entry.exception)
    .map((entry) => entry.route);
  return { routes: routes.sort((a, b) => a.route.localeCompare(b.route)), ungated };
}

export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  }

  const audit = auditRouteAuth();
  const status = await ownerStatus();

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      runtime: { production: isProduction, vercel: isVercel },
      owner: {
        registered: status.registered,
        durable: ownerStoreIsDurable(),
        cookieName: status.cookieName,
        registrationOpen: status.registrationOpen,
        bootstrapTokenRequired: status.bootstrapTokenRequired,
        sessionTtlHours: 8,
      },
      env: envHealth(),
      routes: {
        total: audit.routes.length,
        mutationsTotal: audit.routes.reduce((sum, entry) => sum + entry.mutations, 0),
        ungatedMutations: audit.ungated,
        verdict: audit.ungated.length === 0 ? "ALL MUTATING ROUTES OWNER-GATED" : `UNGATED: ${audit.ungated.join(", ")}`,
        detail: audit.routes,
      },
      controls: {
        middleware: "proxy.ts — security headers + /admin & /api/admin first-line gate",
        csrf: "lib/request-guard.ts — Origin + Sec-Fetch-Site + Referer on every mutation",
        rateLimit: "lib/rate-limit.ts — in-memory sliding window (NOT a global quota)",
        childProcess: EXEC_POLICY,
        agentWorkerConfigured: workerConfigured(),
        agentStorage: await storageMode(),
      },
      boundaries: SECURITY_BOUNDARIES,
      agentPolicy: POLICY_SUMMARY,
    },
    { headers: NO_STORE },
  );
}
