/**
 * GIMMS AUTO-PILOT v3 — TOOL REGISTRY + EFFECT CLASSES.
 *
 * Every capability the agent can reach is declared here, once, with:
 *   - the channel it runs on (cloud browser / vendor API / voice broker),
 *   - the EFFECT it has on the outside world,
 *   - whether the code path exists yet (`implemented`),
 *   - which env vars must be present for it to work (`configured`).
 *
 * THE EFFECT CLASS IS THE SECURITY BOUNDARY
 * -----------------------------------------
 *   READ            safe to run unattended. Observes, never changes state.
 *   DRAFT           creates something that waits for a human. Drafts are the default
 *                   shape of every outward-facing action in this product.
 *   WRITE_EXTERNAL  has a real outside effect (sends mail, posts, moves money).
 *                   `autoExecutionVerdict()` REFUSES this class unconditionally.
 *
 * WRITE_EXTERNAL is not "disabled by config" — it is refused in code, and there is no
 * environment variable that flips it to allowed. An Owner decision can add a *reviewed*
 * path later (PHASE2-AGENT-ARCHITECTURE.md §7), but it must arrive as a new, explicit
 * code path with its own approval and audit trail — not as a flag on this one.
 *
 * PRESENCE-ONLY CONFIG READS. No value is ever returned, logged or compared to a literal.
 */

import { hasVar } from "@/lib/env";
import type { AgentJobKind } from "@/lib/agent/types";

export type ToolId =
  | "browser.navigate"
  | "browser.extract"
  | "browser.screenshot"
  | "browser.draft_social"
  | "browser.login"
  | "gmail.read"
  | "gmail.draft"
  | "gmail.send"
  | "meta.ads.read"
  | "meta.ads.write"
  | "social.autopost"
  | "seo.audit"
  | "voice.session";

export type ToolEffect = "READ" | "DRAFT" | "WRITE_EXTERNAL";
export type ToolChannel = "browser" | "api" | "voice";
export type ToolState = "READY" | "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "BLOCKED_BY_POLICY";

export type ToolDef = {
  id: ToolId;
  label: string;
  channel: ToolChannel;
  effect: ToolEffect;
  /** Human decision required before this can be used at all. */
  requiresApproval: boolean;
  /** False = no code path exists in this repo yet. Reported honestly, never faked. */
  implemented: boolean;
  /** Presence-checked only. Names are safe to show; values never are. */
  env: readonly string[];
  /** For browser tools: the AgentJobKind the worker already understands. */
  jobKind?: AgentJobKind;
  /** Why this exists, or why it refuses. Shown verbatim in the console. */
  notes: string;
};

const WORKER_ENV = ["AGENT_WORKER_URL", "AGENT_WORKER_SECRET"] as const;

export const TOOLS: readonly ToolDef[] = [
  {
    id: "browser.navigate",
    label: "Open a page in the cloud browser",
    channel: "browser",
    effect: "READ",
    requiresApproval: false,
    implemented: true,
    env: WORKER_ENV,
    jobKind: "navigate",
    notes: "Playwright in the external worker. Host allowlist + hard-block list enforced by lib/agent/policy.ts.",
  },
  {
    id: "browser.extract",
    label: "Read structured facts from a page",
    channel: "browser",
    effect: "READ",
    requiresApproval: false,
    implemented: true,
    env: WORKER_ENV,
    jobKind: "research.extract",
    notes: "Returns captured values as data. The worker has a closed step interpreter, no eval, no shell.",
  },
  {
    id: "browser.screenshot",
    label: "Capture a visual",
    channel: "browser",
    effect: "READ",
    requiresApproval: false,
    implemented: true,
    env: WORKER_ENV,
    jobKind: "screenshot",
    notes: "Evidence for the Owner console. Inline base64 today; Supabase Storage + signed URLs is open item #5.",
  },
  {
    id: "browser.draft_social",
    label: "Compose a social post in the page (not submitted)",
    channel: "browser",
    effect: "DRAFT",
    requiresApproval: false,
    implemented: true,
    env: WORKER_ENV,
    jobKind: "social.draft",
    notes: "Types the post and STOPS before submit. This is the shipped default.",
  },
  {
    id: "browser.login",
    label: "Sign into a platform using stored credentials",
    channel: "browser",
    effect: "WRITE_EXTERNAL",
    requiresApproval: true,
    implemented: false,
    env: WORKER_ENV,
    notes:
      "REFUSED BY DESIGN. The hub never stores platform passwords, never types them, and never handles OTP/2FA. Use the platform's official API/OAuth token instead — see docs/AUTOPILOT-ARCHITECTURE-V3.md §3.",
  },
  {
    id: "gmail.read",
    label: "Read and summarise the inbox",
    channel: "api",
    effect: "READ",
    requiresApproval: false,
    implemented: true,
    env: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    notes: "Gmail API metadata read. Scope gmail.readonly. No message bodies are stored.",
  },
  {
    id: "gmail.draft",
    label: "Create a Gmail draft reply",
    channel: "api",
    effect: "DRAFT",
    requiresApproval: false,
    implemented: true,
    env: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    notes: "gmail.users.drafts.create. Appears in your Gmail Drafts folder; YOU press send.",
  },
  {
    id: "gmail.send",
    label: "Send email autonomously",
    channel: "api",
    effect: "WRITE_EXTERNAL",
    requiresApproval: true,
    implemented: false,
    env: [],
    notes:
      "REFUSED BY DESIGN. No send code path exists anywhere in this repo, so no bug, prompt injection or model error can mail a client. Drafts are the deliverable.",
  },
  {
    id: "meta.ads.read",
    label: "Read Meta ad campaign performance",
    channel: "api",
    effect: "READ",
    requiresApproval: false,
    implemented: false,
    env: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    notes: "Planned via the Marketing API (Graph). Not implemented yet — no token exists, so the console reports NOT_CONFIGURED.",
  },
  {
    id: "meta.ads.write",
    label: "Change budgets, pause or publish ad campaigns",
    channel: "api",
    effect: "WRITE_EXTERNAL",
    requiresApproval: true,
    implemented: false,
    env: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    notes:
      "REFUSED FOR UNATTENDED USE. Money-moving. Even once implemented it must be a per-change Owner approval with a spend cap — never a loop the agent drives itself.",
  },
  {
    id: "social.autopost",
    label: "Post / comment / connect automatically",
    channel: "browser",
    effect: "WRITE_EXTERNAL",
    requiresApproval: true,
    implemented: false,
    env: WORKER_ENV,
    notes:
      "REFUSED BY DESIGN (PHASE2-AGENT-ARCHITECTURE.md §0 and §7). Browser-driven engagement also breaches most platform terms. Publishing stays manual.",
  },
  {
    id: "seo.audit",
    label: "On-page SEO audit of a URL",
    channel: "browser",
    effect: "READ",
    requiresApproval: false,
    implemented: false,
    env: WORKER_ENV,
    notes: "Will reuse browser.extract with a fixed field set (title, meta description, h1 count, canonical, robots). Not implemented yet.",
  },
  {
    id: "voice.session",
    label: "Real-time voice session (speech in / speech out)",
    channel: "voice",
    effect: "READ",
    requiresApproval: false,
    implemented: true,
    env: ["AUTOPILOT_VOICE_SESSION_URL", "AUTOPILOT_VOICE_API_KEY"],
    notes: "Server brokers a short-lived session token; the browser talks to the vendor directly over WebRTC. The voice session can only submit a transcript to /api/agent/execute — it holds no tools.",
  },
];

export function getTool(id: ToolId): ToolDef {
  const tool = TOOLS.find((entry) => entry.id === id);
  if (!tool) throw new Error(`unknown tool: ${id}`);
  return tool;
}

export function missingEnv(tool: ToolDef): string[] {
  return tool.env.filter((name) => !hasVar(name));
}

export function toolState(tool: ToolDef): ToolState {
  if (tool.effect === "WRITE_EXTERNAL") return "BLOCKED_BY_POLICY";
  if (!tool.implemented) return "NOT_IMPLEMENTED";
  if (missingEnv(tool).length > 0) return "NOT_CONFIGURED";
  return "READY";
}

/**
 * The single gate every automated path must consult before using a tool.
 * WRITE_EXTERNAL is refused here, unconditionally, with no env escape hatch.
 */
export function autoExecutionVerdict(tool: ToolDef): { allowed: boolean; code?: "BLOCKED_BY_POLICY"; reason: string } {
  if (tool.effect === "WRITE_EXTERNAL") {
    return {
      allowed: false,
      code: "BLOCKED_BY_POLICY",
      reason: `${tool.id} has an outside effect. Unattended execution is refused in code; it needs a per-action Owner approval with its own audit trail.`,
    };
  }
  if (!tool.implemented) {
    return { allowed: false, reason: `${tool.id} has no implementation in this repo yet. Nothing was run.` };
  }
  return { allowed: true, reason: `${tool.id} is ${tool.effect} and safe to run unattended.` };
}

/** Outbound policy is reported for transparency. It cannot unlock WRITE_EXTERNAL. */
export function outboundPolicy() {
  const platforms = (process.env.AGENT_ALLOW_OUTBOUND ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const attested = process.env.AGENT_OPERATOR_ATTESTED === "1";
  return {
    platforms,
    operatorAttested: attested,
    effective: platforms.length > 0 && attested,
    note: "These flags gate reviewed, per-action approvals in /api/admin/agent. They do NOT enable unattended outbound.",
  };
}

export function capabilityMatrix() {
  const rows = TOOLS.map((tool) => ({
    id: tool.id,
    label: tool.label,
    channel: tool.channel,
    effect: tool.effect,
    requiresApproval: tool.requiresApproval,
    implemented: tool.implemented,
    state: toolState(tool),
    missing: missingEnv(tool),
    notes: tool.notes,
  }));

  const count = (state: ToolState) => rows.filter((row) => row.state === state).length;

  return {
    tools: rows,
    summary: {
      total: rows.length,
      ready: count("READY"),
      notConfigured: count("NOT_CONFIGURED"),
      notImplemented: count("NOT_IMPLEMENTED"),
      blockedByPolicy: count("BLOCKED_BY_POLICY"),
      readOnly: rows.filter((row) => row.effect === "READ").length,
      drafts: rows.filter((row) => row.effect === "DRAFT").length,
      outboundRefused: rows.filter((row) => row.effect === "WRITE_EXTERNAL").length,
    },
    outbound: outboundPolicy(),
    rules: {
      unattendedOutbound: "refused in code (no env flag unlocks it)",
      draftsRequireHumanSend: true,
      platformPasswords: "never stored, never typed, never accepted in chat",
      aiModelsConnected: 0,
    },
  };
}

export const TOOL_SUMMARY = {
  total: TOOLS.length,
  plannerEmitsToolIdsOnly: true,
} as const;
