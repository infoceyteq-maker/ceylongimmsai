import { NextResponse } from "next/server";
import { getJob, patchJob, sanitiseResult, evidence } from "@/lib/agent/store";
import { leaseMatches } from "@/lib/agent/dispatcher";
import { bearerToken, guardMutation } from "@/lib/request-guard";
import type { AgentJobStatus } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GIMMS AUTO-PILOT — WORKER CALLBACK.
 *
 * The external worker reports progress and results here. This is the ONLY endpoint
 * a machine calls, so it is authenticated differently from the Owner API:
 *
 *   Authorization: Bearer <per-job lease>   ← issued by the dispatcher, single use,
 *                                            expires with the lease window
 *
 * It is deliberately NOT behind the Owner cookie, and it deliberately does not
 * accept `action: "approved"` or any state change other than the job's own result.
 * A compromised worker can only mark its own job finished or failed — it cannot
 * create jobs, approve jobs, or read another job's data.
 *
 * CSRF guard allows a missing Origin only for this route, because a server-to-server
 * caller has no origin. The Bearer lease is the authentication in that case.
 */

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const LEASE_GRACE_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const guard = guardMutation(request, { allowMissingOrigin: true });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE });
  }

  const lease = bearerToken(request);
  if (!lease || !/^[0-9a-f]{64}$/.test(lease)) {
    return NextResponse.json({ ok: false, error: "A valid per-job lease is required (Authorization: Bearer <lease>)." }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const jobId = String(body.jobId ?? "").trim();
  const phase = String(body.phase ?? "result").trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400, headers: NO_STORE });
  }

  const { job } = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "job not found" }, { status: 404, headers: NO_STORE });
  }

  const storedLeaseHash = (job as unknown as { leaseHash?: string }).leaseHash;
  if (!leaseMatches(lease, storedLeaseHash)) {
    return NextResponse.json({ ok: false, error: "lease does not match this job" }, { status: 403, headers: NO_STORE });
  }

  const expiresAt = job.leaseExpiresAt ? new Date(job.leaseExpiresAt).getTime() : 0;
  if (expiresAt > 0 && Date.now() > expiresAt + LEASE_GRACE_MS) {
    return NextResponse.json({ ok: false, error: "lease expired" }, { status: 410, headers: NO_STORE });
  }

  // ── progress ping (cheap, append-only, capped by the store)
  if (phase === "progress") {
    const line = evidence(
      ["info", "progress", "warn", "error", "result"].includes(String(body.level))
        ? (String(body.level) as "info" | "progress" | "warn" | "error" | "result")
        : "progress",
      String(body.message ?? "").slice(0, 500),
    );
    const result = await patchJob(jobId, (draft) => {
      if (draft.status === "DISPATCHED") draft.status = "RUNNING";
      draft.result = draft.result ?? {
        ok: false,
        finishedAt: "",
        durationMs: 0,
        finalUrl: draft.startUrl,
        title: "",
        extracted: {},
        screenshots: [],
        log: [],
      };
      draft.result.log = [...draft.result.log.slice(-199), line];
    });
    return NextResponse.json({ ok: true, status: result.job?.status }, { headers: NO_STORE });
  }

  // ── final result
  if (phase === "result") {
    const sanitised = sanitiseResult(body.result ?? body);

    // A worker must never be able to escalate a job's status arbitrarily.
    let nextStatus: AgentJobStatus = sanitised.ok ? "COMPLETED" : "FAILED";
    if (job.status === "CANCELLED") {
      // Ignore a late result for a job the Owner already cancelled — but keep the log.
      await patchJob(jobId, (draft) => {
        draft.result = sanitised;
      });
      return NextResponse.json({ ok: true, status: "CANCELLED", note: "Job was cancelled; result recorded without changing status." }, { headers: NO_STORE });
    }

    const updated = await patchJob(jobId, (draft) => {
      draft.result = sanitised;
      draft.status = nextStatus;
      // Burn the lease so it can never be replayed.
      (draft as unknown as { leaseHash?: string }).leaseHash = undefined;
      draft.leaseExpiresAt = undefined;
      if (!sanitised.ok && sanitised.error) draft.error = sanitised.error;
    });

    return NextResponse.json(
      { ok: true, status: updated.job?.status ?? nextStatus, jobId },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { ok: false, error: `unknown phase: ${phase}`, availablePhases: ["progress", "result"] },
    { status: 400, headers: NO_STORE },
  );
}

/** Health probe so the worker (and the console) can confirm reachability. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: "agent-callback",
      accepts: "POST with Authorization: Bearer <per-job lease>",
      phases: ["progress", "result"],
      note: "Reachable. Authentication happens on POST, not on this probe.",
    },
    { headers: NO_STORE },
  );
}
