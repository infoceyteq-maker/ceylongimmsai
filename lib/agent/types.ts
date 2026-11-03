/**
 * GIMMS AUTO-PILOT — JOB + STEP CONTRACT.
 *
 * This file is the ONLY shared vocabulary between three separate trust domains:
 *
 *   1. Vercel  (this Next.js app)  — authenticates the Owner, plans and stores jobs.
 *   2. Worker  (external container) — owns the real browser, executes steps.
 *   3. Owner   (admin console)      — approves anything that has an outside effect.
 *
 * The worker never receives a cookie, a credential, or the Owner's password. It
 * receives a plan + a per-job short-lived token, and it reports results back as data.
 *
 * The step DSL is deliberately small and closed: the worker has an interpreter with a
 * fixed set of operations and NO `eval`, NO arbitrary JS, NO shell. A plan is data.
 */

/** Operations the worker's interpreter understands. Anything else is rejected. */
export type StepOp =
  | "goto" // navigate
  | "humanClick" // pointer path + hover + click, with human timing
  | "humanType" // per-character typing with variable delay and occasional correction
  | "humanScroll" // eased wheel/scroll with micro-pauses
  | "humanHover"
  | "selectOption"
  | "press"
  | "wait"
  | "waitFor"
  | "extract"
  | "screenshot"
  | "assertVisible"
  | "assertText"
  | "humanPause"; // an idle beat so the session does not look metronomic

export type AgentStep = {
  op: StepOp;
  /** Human-readable description shown in the Owner console and the run log. */
  description: string;
  url?: string;
  selector?: string;
  /** Fallback selector list, tried in order. Keeps plans resilient to markup drift. */
  selectors?: string[];
  text?: string;
  value?: string;
  key?: string;
  amount?: number;
  direction?: "up" | "down";
  ms?: number;
  timeoutMs?: number;
  /** For `extract`: the attribute/field to capture. Defaults to innerText. */
  attribute?: string;
  /** For `extract` / `screenshot`: the key the result is stored under. */
  name?: string;
  /** For assertText: substring that must be present. */
  expected?: string;
};

export type AgentJobKind =
  | "navigate" // open a page, capture a screenshot, report title/url
  | "research.extract" // read structured data from a page
  | "social.draft" // compose a post/comment WITHOUT submitting (default, safe)
  | "social.engage" // submit an interaction — requires approval + platform opt-in
  | "form.submit" // fill and submit a form — requires approval
  | "screenshot"; // visual capture only

export type AgentJobStatus =
  | "QUEUED"
  | "AWAITING_APPROVAL"
  | "DISPATCHED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED_BY_POLICY";

/** Why a job needs a human decision before it can touch the outside world. */
export type ApprovalReason = "OUTBOUND_WRITE" | "PLATFORM_TOS_REQUIRES_OPT_IN" | "FIRST_RUN_OF_PLATFORM";

export type AgentEvidence = {
  at: string;
  level: "info" | "progress" | "warn" | "error" | "result";
  message: string;
  data?: Record<string, unknown>;
};

export type AgentJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  kind: AgentJobKind;
  status: AgentJobStatus;
  /** The Owner's own words, kept verbatim for audit. */
  command: string;
  platform: string;
  startUrl: string;
  steps: AgentStep[];
  requiresApproval: boolean;
  approvalReasons: ApprovalReason[];
  approvedAt?: string;
  approvedBy?: string;
  policyChecks: PolicyCheck[];
  attempts: number;
  maxAttempts: number;
  /** Populated by the worker callback. */
  result?: AgentRunResult;
  error?: string;
  workerId?: string;
  leaseExpiresAt?: string;
};

export type AgentRunResult = {
  ok: boolean;
  finishedAt: string;
  durationMs: number;
  finalUrl: string;
  title: string;
  extracted: Record<string, unknown>;
  screenshots: { name: string; url?: string; bytes?: number }[];
  log: AgentEvidence[];
  error?: string;
};

export type PolicyCheck = {
  id: string;
  passed: boolean;
  detail: string;
};

/** Public view of a job — never includes the dispatch token. */
export type AgentJobView = Omit<AgentJob, "steps"> & { stepCount: number; steps: AgentStep[] };

export function toJobView(job: AgentJob): AgentJobView {
  return { ...job, stepCount: job.steps.length };
}

/** The payload POSTed to the worker. Contains no Owner credential. */
export type WorkerDispatchPayload = {
  jobId: string;
  kind: AgentJobKind;
  startUrl: string;
  steps: AgentStep[];
  limits: {
    maxDurationMs: number;
    maxSteps: number;
    maxScreenshots: number;
  };
  callback: {
    url: string;
    token: string;
  };
  /** Per-job, single-use, expires with the lease. Never the worker's master secret. */
  lease: string;
  leaseExpiresAt: string;
};
