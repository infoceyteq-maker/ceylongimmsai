/**
 * GIMMS AUTO-PILOT — POLICY ENGINE.
 *
 * This module is the honest core of Phase 2, and it exists because the published
 * terms of the platforms in scope do not permit what "send comments on social media
 * automatically" implies. Those terms are not a formality: LinkedIn, X, Facebook,
 * Instagram and TikTok all prohibit automated interaction that mimics a human,
 * and they enforce it by banning the *account* — the Owner's own account.
 *
 * SO WHAT DOES THIS BUILD DO? Exactly two things, and refuses the third:
 *
 *   ALLOWED  · navigate, read, screenshot, and EXTRACT public page data
 *            · COMPOSE a post/comment/form fill in the browser and STOP
 *              (everything typed, nothing submitted — the Owner presses the last key)
 *            · record the evidence trail with hashes
 *
 *   REFUSED  · unattended outbound actions: submitting comments, sending requests,
 *              mass engagement, logging into platforms via automation with a
 *              password stored by this system
 *
 * The refusal is a hard, tested code path (`BLOCKED_BY_POLICY`), not a comment.
 * A job can only be dispatched for an outbound write when the Owner has BOTH
 * approved it in the console AND explicitly enabled that platform in
 * `AGENT_ALLOW_OUTBOUND`, AND set `AGENT_OPERATOR_ATTESTED=1` confirming they have
 * permission to act on that account. The default is off. See the report for why.
 */

import type { AgentJob, AgentJobKind, AgentStep, PolicyCheck } from "@/lib/agent/types";

/** Hosts the worker may open. Anything else is refused before a browser starts. */
export const ALLOWED_HOSTS = [
  "linkedin.com",
  "www.linkedin.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "youtube.com",
  "www.youtube.com",
  "gimms.lk",
  "www.gimms.lk",
  "infoceyteq.com",
  "www.infoceyteq.com",
  "docs.google.com",
  "drive.google.com",
  "sheets.google.com",
] as const;

/** Kinds that produce an effect outside this system. */
const OUTBOUND_KINDS: AgentJobKind[] = ["social.engage", "form.submit"];

/** Hosts never permitted, even by an environment override. */
const HARD_BLOCKED_HOSTS = [
  "vercel.com",
  "api.vercel.com",
  "github.com",
  "api.github.com",
  "supabase.com",
  "supabase.co",
  "accounts.google.com",
  "login.microsoftonline.com",
  "bank",
  "paypal.com",
  "stripe.com",
  "binance.com",
];

const MAX_STEPS = 60;
const MAX_TIMEOUT_MS = 5 * 60 * 1000;

export type PolicyVerdict = {
  allowed: boolean;
  requiresApproval: boolean;
  checks: PolicyCheck[];
  reasons: string[];
  /** Machine-readable refusal codes so the console can explain itself. */
  codes: string[];
};

function hostAllowed(rawUrl: string): { ok: boolean; host: string; reason?: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, host: "", reason: "startUrl is not a valid absolute URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, host: url.hostname, reason: "only https:// is allowed; http and file:// are refused" };
  }
  const host = url.hostname.toLowerCase();

  for (const blocked of HARD_BLOCKED_HOSTS) {
    if (host === blocked || host.endsWith(`.${blocked}`) || host.includes(blocked)) {
      return { ok: false, host, reason: `${host} is hard-blocked: automation must never touch identity, source-control, payment or cloud-console systems` };
    }
  }

  const listed = ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  if (!listed) {
    return { ok: false, host, reason: `${host} is not on the ALLOWED_HOSTS list in lib/agent/policy.ts` };
  }
  return { ok: true, host };
}

/** Reject any step carrying a selector/URL that smells like a credential prompt. */
const SECRET_PATTERNS = [
  /type\s*=\s*["']?password/i,
  /input\[name=["']?pass/i,
  /two-factor/i,
  /one-time-code/i,
  /\botp\b/i,
  /recovery.?code/i,
];

export function evaluatePolicy(job: Pick<AgentJob, "kind" | "startUrl" | "steps" | "platform">): PolicyVerdict {
  const checks: PolicyCheck[] = [];
  const reasons: string[] = [];
  const codes: string[] = [];
  const add = (id: string, passed: boolean, detail: string) => {
    checks.push({ id, passed, detail });
    if (!passed) codes.push(id);
  };

  // 1 ── destination allowlist
  const destination = hostAllowed(job.startUrl);
  add("HOST_ALLOWLIST", destination.ok, destination.reason ?? `${destination.host} is allowlisted`);
  if (!destination.ok) reasons.push(destination.reason ?? "destination refused");

  // 2 ── closed step set + size limit
  const ops = new Set<string>([
    "goto",
    "humanClick",
    "humanType",
    "humanScroll",
    "humanHover",
    "selectOption",
    "press",
    "wait",
    "waitFor",
    "extract",
    "screenshot",
    "assertVisible",
    "assertText",
    "humanPause",
  ]);
  const unknownOps = job.steps.filter((step: AgentStep) => !ops.has(step.op)).map((step) => step.op);
  add("STEP_OPS_CLOSED", unknownOps.length === 0, unknownOps.length === 0 ? "all ops are in the closed interpreter set" : `unknown ops: ${[...new Set(unknownOps)].join(", ")}`);
  if (unknownOps.length > 0) reasons.push(`plan contains unsupported operations: ${[...new Set(unknownOps)].join(", ")}`);

  add("STEP_BUDGET", job.steps.length > 0 && job.steps.length <= MAX_STEPS, `${job.steps.length} steps (max ${MAX_STEPS})`);
  if (job.steps.length === 0) reasons.push("plan has no steps");
  if (job.steps.length > MAX_STEPS) reasons.push(`plan exceeds the ${MAX_STEPS}-step budget`);

  // 3 ── every navigable URL inside the plan must also be allowlisted
  const planUrls = job.steps.filter((step) => step.op === "goto" && step.url).map((step) => step.url as string);
  const badPlanUrls = planUrls.filter((url) => !hostAllowed(url).ok);
  add("STEP_URLS_ALLOWLISTED", badPlanUrls.length === 0, badPlanUrls.length === 0 ? `${planUrls.length} in-plan navigations allowlisted` : `refused: ${badPlanUrls.join(", ")}`);
  if (badPlanUrls.length > 0) reasons.push("a step tries to navigate outside the allowlist");

  // 4 ── per-step timeout ceiling
  const overTimeout = job.steps.filter((step) => (step.timeoutMs ?? 0) > MAX_TIMEOUT_MS);
  add("STEP_TIMEOUTS_BOUNDED", overTimeout.length === 0, overTimeout.length === 0 ? `no step exceeds ${MAX_TIMEOUT_MS}ms` : `${overTimeout.length} steps exceed the timeout ceiling`);

  // 5 ── never automate a credential field
  const secrety = job.steps.filter((step) => {
    const haystack = `${step.selector ?? ""} ${(step.selectors ?? []).join(" ")} ${step.description}`;
    return SECRET_PATTERNS.some((pattern) => pattern.test(haystack));
  });
  add(
    "NO_CREDENTIAL_AUTOMATION",
    secrety.length === 0,
    secrety.length === 0 ? "no step targets a password/2FA field" : `${secrety.length} step(s) target a credential field`,
  );
  if (secrety.length > 0) {
    reasons.push("a step targets a password/2FA field — the agent never types credentials; sign in manually in the worker profile");
  }

  // 6 ── outbound effect classification
  const outbound = OUTBOUND_KINDS.includes(job.kind);
  const mutationInPlan = job.steps.some((step) => step.op === "humanClick" || step.op === "press");
  const requiresApproval = outbound || mutationInPlan;
  add(
    "OUTBOUND_CLASSIFICATION",
    true,
    requiresApproval
      ? "plan can produce an outside effect → Owner approval required"
      : "read-only / compose-only plan → no outside effect",
  );

  // 7 ── platform opt-in override
  if (outbound) {
    const allowList = (process.env.AGENT_ALLOW_OUTBOUND || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const platform = job.platform.toLowerCase();
    const optedIn = allowList.includes(platform) || allowList.includes("*");
    const attested = process.env.AGENT_OPERATOR_ATTESTED === "1";

    add(
      "PLATFORM_OPT_IN",
      optedIn,
      optedIn
        ? `${platform} is listed in AGENT_ALLOW_OUTBOUND`
        : `${platform} is NOT listed in AGENT_ALLOW_OUTBOUND — unattended outbound actions are refused by default`,
    );
    if (!optedIn) {
      reasons.push(
        `Unattended outbound actions on ${platform} are disabled. ${platform} permits automated posting only through its official API with an approved app; scripted engagement breaches its terms and risks the account.`,
      );
    }

    add(
      "OPERATOR_ATTESTATION",
      attested,
      attested
        ? "AGENT_OPERATOR_ATTESTED=1 — Owner states they have permission to act on this account"
        : "AGENT_OPERATOR_ATTESTED is not 1 — the Owner has not confirmed authority over the account",
    );
    if (!attested) reasons.push("Owner has not attested authority over the target account (set AGENT_OPERATOR_ATTESTED=1 after reading PHASE2-AGENT-ARCHITECTURE.md)");
  }

  const allowed = checks.every((check) => check.passed) && !(outbound && codes.includes("PLATFORM_OPT_IN"));
  return { allowed, requiresApproval, checks, reasons, codes };
}

/** Hard limits handed to the worker so a runaway browser cannot burn the budget. */
export const WORKER_LIMITS = {
  maxDurationMs: 4 * 60 * 1000,
  maxSteps: MAX_STEPS,
  maxScreenshots: 12,
  /** A lease is short: the worker must reuse it within this window. */
  leaseMs: 10 * 60 * 1000,
} as const;

export const POLICY_SUMMARY = {
  allowed: [
    "Navigate allowlisted HTTPS pages",
    "Read, screenshot and extract public page data",
    "Compose a post/comment/email body in the browser and stop before submit",
    "Fill an internal form up to the final submit and stop",
  ],
  refused: [
    "Submitting comments, reactions or connection requests on social platforms",
    "Mass/bulk engagement of any kind",
    "Typing passwords or 2FA codes on any site",
    "Any navigation to payment, identity-provider, source-control or cloud-console hosts",
  ],
  why: "Automated social interaction breaches the terms of every platform in scope and puts the Owner's own account at risk of permanent ban. The compliant path is the platform API with an approved app.",
} as const;
