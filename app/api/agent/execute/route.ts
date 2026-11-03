/**
 * GIMMS AUTO-PILOT v3 — THE SINGLE EXECUTION ENDPOINT.
 *
 *   GET  /api/agent/execute        capability matrix (what exists, what is configured)
 *   POST /api/agent/execute        { command } → classify → plan → queue → 202 + jobId
 *
 * WHAT THIS ROUTE IS
 * ------------------
 * The front door of the agent. One command in, one of four honest outcomes out:
 *
 *   202  QUEUED / AWAITING_APPROVAL  a real job exists with a real id
 *   403  BLOCKED_BY_POLICY           refused in code, before anything ran
 *   501  NOT_CONFIGURED              no credentials or no implementation — with the
 *                                    exact env var names and the UI step to fix it
 *   400  UNKNOWN intent              the hub does not guess
 *
 * WHAT THIS ROUTE IS NOT
 * ----------------------
 * It never performs the work itself. Browsing, email and voice all take longer than a
 * serverless function is allowed to live, so this handler does the *fast* part only:
 * authenticate, classify, gate, persist, return. The slow part runs in the external
 * worker (agent-worker/) which calls back to /api/agent/callback. See §4 of
 * docs/AUTOPILOT-ARCHITECTURE-V3.md for why that is the only design that survives
 * Vercel's timeout.
 *
 * SECURITY: requireOwnerWrite() → CSRF guard → Owner session (401 in production) →
 * rate limit. Same three layers as every other mutating route in the hub.
 */

import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import { requireOwner } from "@/lib/owner-auth";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { classifyIntent, INTENTS, INTENT_SUMMARY, type IntentId } from "@/lib/autopilot/intent";
import { capabilityMatrix, getTool, missingEnv, toolState, autoExecutionVerdict, type ToolId } from "@/lib/autopilot/tools";
import { gmailConfigured, GMAIL_POLICY } from "@/lib/autopilot/gmail";
import { planFromCommand } from "@/lib/agent/planner";
import { evaluatePolicy, WORKER_LIMITS } from "@/lib/agent/policy";
import { workerConfigured } from "@/lib/agent/dispatcher";
import { putJob, newJobId, listJobs } from "@/lib/agent/store";
import { toJobView, type AgentJob } from "@/lib/agent/types";
import { hasVar } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

/**
 * Intent → fixed tool set. This table IS the blast radius of the agent: an intent can
 * only ever reach the tools listed here, and no model output can extend it.
 */
const INTENT_TOOLS: Record<IntentId, ToolId[]> = {
  EMAIL_TRIAGE: ["gmail.read"],
  EMAIL_DRAFT_REPLY: ["gmail.read", "gmail.draft"],
  SOCIAL_DRAFT: ["browser.draft_social"],
  BROWSER_RESEARCH: ["browser.extract"],
  SEO_AUDIT: ["seo.audit"],
  ADS_REVIEW: ["meta.ads.read"],
  STATUS_REPORT: [],
  // Commit intents exist ONLY to be refused with a clear explanation + an alternative.
  // Recognising a request is not the same as agreeing to it.
  EMAIL_SEND: ["gmail.send"],
  SOCIAL_PUBLISH: ["social.autopost"],
  ADS_CHANGE: ["meta.ads.write"],
  UNKNOWN: [],
};

/** Intents whose work is an API call, not a browser session. */
const API_INTENTS: readonly IntentId[] = ["EMAIL_TRIAGE", "EMAIL_DRAFT_REPLY", "ADS_REVIEW"];

export async function GET(request: Request) {
  // Read-only, but still Owner-only: the capability matrix describes the attack surface.
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });

  const { jobs, mode, durable } = await listJobs(20);
  const matrix = capabilityMatrix();

  return NextResponse.json(
    {
      ok: true,
      version: "autopilot-v3",
      intents: { ids: INTENTS, ...INTENT_SUMMARY },
      capabilities: matrix,
      integrations: {
        browserWorker: {
          configured: workerConfigured(),
          missing: workerConfigured() ? [] : ["AGENT_WORKER_URL", "AGENT_WORKER_SECRET"].filter((name) => !hasVar(name)),
          note: "Deploy from agent-worker/ (Fly.io). Until then browser jobs queue but cannot run.",
        },
        gmail: { configured: gmailConfigured(), missing: gmailConfigured() ? [] : ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"].filter((name) => !hasVar(name)), policy: GMAIL_POLICY },
        voice: {
          configured: hasVar("AUTOPILOT_VOICE_SESSION_URL") && hasVar("AUTOPILOT_VOICE_API_KEY"),
          missing: ["AUTOPILOT_VOICE_SESSION_URL", "AUTOPILOT_VOICE_API_KEY"].filter((name) => !hasVar(name)),
          note: "Brokered ephemeral token; the browser talks to the vendor over WebRTC.",
        },
        llmClassifier: { enabled: process.env.AUTOPILOT_LLM_CLASSIFIER === "1" && hasVar("OPENAI_API_KEY"), note: "Optional. Enum-only. The planner never uses a model." },
      },
      storage: { mode, durable },
      limits: WORKER_LIMITS,
      recentJobs: jobs.map(toJobView),
      counts: {
        queued: jobs.filter((job) => job.status === "QUEUED").length,
        awaitingApproval: jobs.filter((job) => job.status === "AWAITING_APPROVAL").length,
        running: jobs.filter((job) => job.status === "RUNNING" || job.status === "DISPATCHED").length,
        blocked: jobs.filter((job) => job.status === "BLOCKED_BY_POLICY").length,
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const auth = await requireOwnerWrite(request);
  if (!auth.ok) return NextResponse.json({ ok: false, ...authTag(auth), error: auth.error }, { status: auth.status, headers: NO_STORE });

  const limit = rateLimit(clientKey(request, "agent-execute"), RATE_LIMITS.agentCommand.limit, RATE_LIMITS.agentCommand.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many commands. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const command = String(body.command ?? body.transcript ?? "").trim();
  const source = body.source === "voice" ? "voice" : "text";
  const createdBy = auth.mode === "owner" && auth.profile ? auth.profile.employeeId : "development-anonymous";

  if (command.length < 3) return NextResponse.json({ ok: false, error: "command is required (min 3 characters)" }, { status: 400, headers: NO_STORE });
  if (command.length > 2000) return NextResponse.json({ ok: false, error: "command too long (max 2000 characters)" }, { status: 400, headers: NO_STORE });

  // ── 1. Intent (closed enum; deterministic unless explicitly enabled) ─────────
  const match = await classifyIntent(command);
  const toolIds = INTENT_TOOLS[match.intent];
  const toolReports = toolIds.map((id) => {
    const tool = getTool(id);
    return { id, tool, state: toolState(tool), missing: missingEnv(tool), verdict: autoExecutionVerdict(tool) };
  });

  const base = {
    ...authTag(auth),
    source,
    interpretation: match,
    refusedOutbound: capabilityMatrix().summary.outboundRefused,
  };

  if (match.intent === "UNKNOWN") {
    return NextResponse.json(
      { ...base, ok: false, code: "UNKNOWN_INTENT", error: match.note, availableIntents: INTENTS },
      { status: 400, headers: NO_STORE },
    );
  }

  // ── 2. Refusals first: a WRITE_EXTERNAL tool never reaches a job ─────────────
  const blocked = toolReports.filter((entry) => entry.state === "BLOCKED_BY_POLICY");
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        ...base,
        ok: false,
        code: "BLOCKED_BY_POLICY",
        error: blocked.map((entry) => entry.verdict.reason).join(" "),
        blockedTools: blocked.map((entry) => ({ id: entry.id, notes: entry.tool.notes })),
        note: "Nothing ran. This is a documented product decision, not a missing feature flag.",
        alternative: "Use the draft path: the hub composes, you approve and send.",
      },
      { status: 403, headers: NO_STORE },
    );
  }

  // ── 3. STATUS_REPORT needs no tool: answer from real stored state ────────────
  if (match.intent === "STATUS_REPORT") {
    const { jobs, mode, durable } = await listJobs(40);
    return NextResponse.json(
      {
        ...base,
        ok: true,
        code: "REPORTED",
        report: {
          jobs: {
            total: jobs.length,
            queued: jobs.filter((job) => job.status === "QUEUED").length,
            awaitingApproval: jobs.filter((job) => job.status === "AWAITING_APPROVAL").length,
            running: jobs.filter((job) => job.status === "RUNNING" || job.status === "DISPATCHED").length,
            completed: jobs.filter((job) => job.status === "COMPLETED").length,
            blocked: jobs.filter((job) => job.status === "BLOCKED_BY_POLICY").length,
          },
          storage: { mode, durable },
          aiModelsConnected: 0,
          note: "Counts come from the real job store. No model was called to produce this answer.",
        },
      },
      { headers: NO_STORE },
    );
  }

  // ── 4. API intents: honest NOT_CONFIGURED / NOT_IMPLEMENTED, no fake job ────
  if (API_INTENTS.includes(match.intent)) {
    const notReady = toolReports.filter((entry) => entry.state === "NOT_CONFIGURED" || entry.state === "NOT_IMPLEMENTED");
    if (notReady.length > 0) {
      const missing = Array.from(new Set(notReady.flatMap((entry) => entry.missing)));
      const code = notReady.some((entry) => entry.state === "NOT_IMPLEMENTED") && missing.length === 0 ? "NOT_IMPLEMENTED" : "NOT_CONFIGURED";
      return NextResponse.json(
        {
          ...base,
          ok: false,
          code,
          error: `${match.intent} needs ${notReady.map((entry) => entry.id).join(" + ")}, which is not ready on this deployment.`,
          missingEnv: missing,
          notReady: notReady.map((entry) => ({ id: entry.id, state: entry.state, note: entry.tool.notes })),
          manualSteps: "docs/AUTOPILOT-MANUAL-SETUP.md §2 (Google OAuth). Values go into Vercel → Settings → Environment Variables — never into chat.",
          note: "No job was created and no external call was made.",
        },
        { status: 501, headers: NO_STORE },
      );
    }
  }

  // ── 5. Browser intents: real plan → policy → persist → 202 ──────────────────
  const draft = planFromCommand(command);
  if (!draft.ok) {
    return NextResponse.json(
      {
        ...base,
        ok: false,
        code: "PLAN_UNSUPPORTED",
        error: draft.error,
        needs: draft.needs,
        note: "The intent is a browser task, but the planner could not build a safe closed step plan for it.",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const verdict = evaluatePolicy({ kind: draft.kind, startUrl: draft.startUrl, steps: draft.steps, platform: draft.platform });
  const now = new Date().toISOString();

  const job: AgentJob = {
    id: newJobId(),
    createdAt: now,
    updatedAt: now,
    createdBy,
    kind: draft.kind,
    status: verdict.allowed && !verdict.requiresApproval ? "QUEUED" : "AWAITING_APPROVAL",
    command,
    platform: draft.platform,
    startUrl: draft.startUrl,
    steps: draft.steps,
    requiresApproval: verdict.requiresApproval,
    approvalReasons: verdict.requiresApproval ? ["OUTBOUND_WRITE", ...(draft.kind === "social.engage" ? (["PLATFORM_TOS_REQUIRES_OPT_IN"] as const) : [])] : [],
    policyChecks: verdict.checks,
    attempts: 0,
    maxAttempts: 2,
  };

  if (!verdict.allowed) {
    job.status = "BLOCKED_BY_POLICY";
    job.error = verdict.reasons.join(" ");
    const { persisted, mode } = await putJob(job);
    return NextResponse.json(
      { ...base, ok: false, code: "BLOCKED_BY_POLICY", job: toJobView(job), policy: { checks: verdict.checks, reasons: verdict.reasons, codes: verdict.codes }, persisted, storage: mode },
      { status: 403, headers: NO_STORE },
    );
  }

  const { persisted, mode } = await putJob(job);
  const worker = workerConfigured();

  return NextResponse.json(
    {
      ...base,
      ok: true,
      code: job.status === "AWAITING_APPROVAL" ? "AWAITING_APPROVAL" : "QUEUED",
      jobId: job.id,
      job: toJobView(job),
      plan: { kind: draft.kind, platform: draft.platform, startUrl: draft.startUrl, stepCount: draft.steps.length, interpretation: draft.interpretation, needs: draft.needs },
      policy: { checks: verdict.checks, requiresApproval: verdict.requiresApproval },
      execution: {
        workerConfigured: worker,
        dispatched: false,
        next: job.status === "AWAITING_APPROVAL" ? "Approve in /admin/auto-pilot — nothing has run." : worker ? "Approve or run in /admin/auto-pilot to dispatch to the worker." : "Configure AGENT_WORKER_URL + AGENT_WORKER_SECRET to let this job run.",
        poll: `/api/admin/agent?jobId=${job.id}`,
      },
      persisted,
      storage: mode,
      note: "Queued, not executed. This endpoint returns immediately by design — the browser work happens in the worker (docs/AUTOPILOT-ARCHITECTURE-V3.md §4).",
    },
    { status: 202, headers: NO_STORE },
  );
}
