import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner-auth";
import { guardMutation } from "@/lib/request-guard";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { planFromCommand } from "@/lib/agent/planner";
import { evaluatePolicy, POLICY_SUMMARY, WORKER_LIMITS } from "@/lib/agent/policy";
import { dispatchToWorker, issueLease, workerConfigured } from "@/lib/agent/dispatcher";
import { listJobs, getJob, patchJob, putJob, newJobId, canTransition, storageMode, evidence } from "@/lib/agent/store";
import { toJobView, type AgentJob, type AgentJobKind } from "@/lib/agent/types";
import { isProduction } from "@/lib/env";
import { OWNER_EMAIL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GIMMS AUTO-PILOT — OWNER-ONLY CONTROL API.
 *
 * Every method requires a real Owner session (middleware is only a first line of
 * defence; this is the authoritative check). Nothing here is reachable anonymously.
 *
 *   GET  ?jobId=...   one job          |  GET (no param)  recent jobs + capability report
 *   POST action=plan      command → policy-checked plan + a queued job (no browser)
 *   POST action=approve   Owner approves an outbound plan                 → dispatch
 *   POST action=run       dispatch a read-only plan immediately           → dispatch
 *   POST action=cancel    cancel a job that has not completed
 */

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

function requireOwnerJson(request: Request) {
  const auth = requireOwner(request);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE }) };
  }
  return { ok: true as const, profile: auth.profile };
}

export async function GET(request: Request) {
  const auth = requireOwnerJson(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (jobId) {
    const { job, mode } = await getJob(jobId);
    if (!job) return NextResponse.json({ ok: false, error: `job not found: ${jobId}` }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ ok: true, job: toJobView(job), storage: mode }, { headers: NO_STORE });
  }

  const { jobs, mode, durable } = await listJobs(80);
  const worker = workerConfigured();

  return NextResponse.json(
    {
      ok: true,
      storage: { mode, durable },
      worker: {
        configured: worker,
        missing: worker ? [] : ["AGENT_WORKER_URL", "AGENT_WORKER_SECRET"].filter((name) => !process.env[name]),
        note: worker
          ? "An external browser worker is configured. Jobs can be dispatched."
          : "No browser worker configured. Plans can be created, checked and stored — but nothing can run yet.",
      },
      outbound: {
        allowedPlatforms: (process.env.AGENT_ALLOW_OUTBOUND || "").split(",").map((s) => s.trim()).filter(Boolean),
        operatorAttested: process.env.AGENT_OPERATOR_ATTESTED === "1",
      },
      limits: WORKER_LIMITS,
      policy: POLICY_SUMMARY,
      jobs: jobs.map(toJobView),
      counts: {
        total: jobs.length,
        awaitingApproval: jobs.filter((job) => job.status === "AWAITING_APPROVAL").length,
        running: jobs.filter((job) => job.status === "RUNNING" || job.status === "DISPATCHED").length,
        completed: jobs.filter((job) => job.status === "COMPLETED").length,
        failed: jobs.filter((job) => job.status === "FAILED").length,
        blocked: jobs.filter((job) => job.status === "BLOCKED_BY_POLICY").length,
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const auth = requireOwnerJson(request);
  if (!auth.ok) return auth.response;

  const guard = guardMutation(request);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE });

  const limit = rateLimit(clientKey(request, "agent-command"), RATE_LIMITS.agentCommand.limit, RATE_LIMITS.agentCommand.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many agent commands. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim();

  // ───────────────────────────────────────────────────────────── plan + queue
  if (action === "plan" || action === "run") {
    const command = String(body.command ?? "").trim();
    if (!command) {
      return NextResponse.json({ ok: false, error: "command is required" }, { status: 400, headers: NO_STORE });
    }

    const draft = planFromCommand(command);
    if (!draft.ok) {
      return NextResponse.json(
        { ok: false, error: draft.error, interpretation: draft.interpretation, needs: draft.needs, kind: draft.kind, platform: draft.platform },
        { status: 400, headers: NO_STORE },
      );
    }

    const verdict = evaluatePolicy({ kind: draft.kind, startUrl: draft.startUrl, steps: draft.steps, platform: draft.platform });

    const now = new Date().toISOString();
    const job: AgentJob = {
      id: newJobId(),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.profile.employeeId,
      kind: draft.kind,
      status: "QUEUED",
      command,
      platform: draft.platform,
      startUrl: draft.startUrl,
      steps: draft.steps,
      requiresApproval: verdict.requiresApproval,
      approvalReasons: verdict.requiresApproval
        ? ["OUTBOUND_WRITE", ...(draft.kind === "social.engage" ? (["PLATFORM_TOS_REQUIRES_OPT_IN"] as const) : [])]
        : [],
      policyChecks: verdict.checks,
      attempts: 0,
      maxAttempts: 2,
    };

    if (!verdict.allowed) {
      job.status = "BLOCKED_BY_POLICY";
      job.error = verdict.reasons.join(" ");
      const { persisted, mode } = await putJob(job);
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          job: toJobView(job),
          policy: { checks: verdict.checks, reasons: verdict.reasons, codes: verdict.codes },
          persisted,
          storage: mode,
          note: "The plan was refused by policy before any browser started. Nothing ran.",
        },
        { status: 403, headers: NO_STORE },
      );
    }

    // A plan with an outside effect is NOT dispatched by `run`. Approval is separate.
    if (verdict.requiresApproval) {
      job.status = "AWAITING_APPROVAL";
      const { persisted, mode } = await putJob(job);
      return NextResponse.json(
        {
          ok: true,
          awaitingApproval: true,
          job: toJobView(job),
          policy: { checks: verdict.checks, reasons: verdict.reasons },
          interpretation: draft.interpretation,
          needs: draft.needs,
          persisted,
          storage: mode,
          note: "Plan stored and waiting for your approval. Nothing has run.",
        },
        { status: 202, headers: NO_STORE },
      );
    }

    const { persisted, mode } = await putJob(job);
    if (action === "plan") {
      return NextResponse.json(
        {
          ok: true,
          dispatched: false,
          job: toJobView(job),
          policy: { checks: verdict.checks },
          interpretation: draft.interpretation,
          needs: draft.needs,
          persisted,
          storage: mode,
        },
        { status: 201, headers: NO_STORE },
      );
    }

    const dispatched = await dispatchJob(job);
    return NextResponse.json(
      { ...dispatched, interpretation: draft.interpretation, needs: draft.needs, storage: mode, persisted },
      { status: dispatched.ok ? 202 : 503, headers: NO_STORE },
    );
  }

  // ───────────────────────────────────────────────────────────────── approve
  if (action === "approve") {
    const jobId = String(body.jobId ?? "").trim();
    if (!jobId) return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400, headers: NO_STORE });

    const { job } = await getJob(jobId);
    if (!job) return NextResponse.json({ ok: false, error: "job not found" }, { status: 404, headers: NO_STORE });
    if (job.status !== "AWAITING_APPROVAL") {
      return NextResponse.json({ ok: false, error: `job is ${job.status}; only AWAITING_APPROVAL jobs can be approved` }, { status: 409, headers: NO_STORE });
    }

    // Re-evaluate: environment flags may have changed since the plan was stored.
    const verdict = evaluatePolicy({ kind: job.kind, startUrl: job.startUrl, steps: job.steps, platform: job.platform });
    if (!verdict.allowed) {
      await patchJob(jobId, (draft) => {
        draft.status = "BLOCKED_BY_POLICY";
        draft.policyChecks = verdict.checks;
        draft.error = verdict.reasons.join(" ");
      });
      return NextResponse.json(
        { ok: false, blocked: true, policy: { checks: verdict.checks, reasons: verdict.reasons, codes: verdict.codes } },
        { status: 403, headers: NO_STORE },
      );
    }

    await patchJob(jobId, (draft) => {
      draft.approvedAt = new Date().toISOString();
      draft.approvedBy = auth.profile.employeeId;
      draft.status = canTransition(draft.status, "DISPATCHED") ? "DISPATCHED" : draft.status;
      draft.policyChecks = verdict.checks;
    });

    const { job: approved } = await getJob(jobId);
    if (!approved) return NextResponse.json({ ok: false, error: "job vanished during approval" }, { status: 500, headers: NO_STORE });

    const dispatched = await dispatchJob(approved);
    return NextResponse.json(dispatched, { status: dispatched.ok ? 202 : 503, headers: NO_STORE });
  }

  // ────────────────────────────────────────────────────────────────── cancel
  if (action === "cancel") {
    const jobId = String(body.jobId ?? "").trim();
    if (!jobId) return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400, headers: NO_STORE });
    const result = await patchJob(jobId, (draft) => {
      if (canTransition(draft.status, "CANCELLED")) {
        draft.status = "CANCELLED";
        draft.error = "Cancelled by Owner.";
      }
    });
    if (!result.job) return NextResponse.json({ ok: false, error: "job not found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ ok: true, job: toJobView(result.job) }, { headers: NO_STORE });
  }

  return NextResponse.json(
    {
      ok: false,
      error: `unknown action: ${action || "(empty)"}`,
      availableActions: ["plan", "run", "approve", "cancel"],
      note: isProduction ? undefined : "Development runtime: plans execute without a worker only if one is configured.",
    },
    { status: 400, headers: NO_STORE },
  );
}

/** Shared dispatch path: issue a lease, store its hash, call the worker. */
async function dispatchJob(job: AgentJob) {
  const { lease, leaseHash, leaseExpiresAt } = issueLease();

  await patchJob(job.id, (draft) => {
    draft.workerId = undefined;
    draft.leaseExpiresAt = leaseExpiresAt;
    // The hash is what gets persisted; the raw lease only ever travels to the worker.
    draft.policyChecks = [
      ...draft.policyChecks,
      { id: "LEASE_ISSUED", passed: true, detail: `single-use lease valid until ${leaseExpiresAt}` },
    ];
    draft.attempts += 1;
    (draft as AgentJob & { leaseHash?: string }).leaseHash = leaseHash;
  });

  const { job: leased } = await getJob(job.id);
  if (!leased) return { ok: false as const, job: null, error: "job vanished before dispatch" };

  const outcome = await dispatchToWorker(leased, lease, leaseExpiresAt);

  if (!outcome.ok) {
    await patchJob(job.id, (draft) => {
      draft.status = "QUEUED";
      draft.error = outcome.error;
      draft.workerId = undefined;
    });
    const { job: current } = await getJob(job.id);
    return {
      ok: false as const,
      job: current ? toJobView(current) : null,
      error: outcome.error,
      workerConfigured: outcome.configured,
      missing: "missing" in outcome ? outcome.missing : undefined,
    };
  }

  const updated = await patchJob(job.id, (draft) => {
    draft.status = "DISPATCHED";
    draft.workerId = outcome.workerId;
    draft.error = undefined;
    draft.leaseExpiresAt = outcome.leaseExpiresAt;
  });

  return {
    ok: true as const,
    dispatched: true,
    job: updated.job ? toJobView(updated.job) : null,
    workerId: outcome.workerId,
    leaseExpiresAt: outcome.leaseExpiresAt,
    note: "Worker accepted the plan. The browser is running; this endpoint returns immediately.",
  };
}

/** Exported for the console page's capability probe. */
export const AGENT_OWNER = OWNER_EMAIL;
export type { AgentJobKind };
