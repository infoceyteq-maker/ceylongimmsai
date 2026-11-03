/**
 * GIMMS P2-02 — MODEL SELECTION & ROUTING (DETERMINISTIC PLAN ONLY).
 *
 * Reuses the EXISTING `routeDepartment` (lib/departments.ts) for department/task
 * routing and the EXISTING `hash` (lib/jobs.ts) for evidence. No model is called,
 * no API request is sent, no credential is read, no state is written.
 *
 * This is configuration logic, not an AI model: it produces a SELECTION PLAN.
 * Because 0 AI models are connected, every result is `executable:false` and
 * falls back to the GIMMS Development Agent → human Owner.
 */

import { routeDepartment } from "@/lib/departments";
import { hash } from "@/lib/jobs";
import { AI_MODEL_REGISTRY, AI_TEAM, CONNECTION_SLOTS } from "@/lib/prod-ai-team";

export type AiTaskType =
  | "code_generation"
  | "code_review"
  | "architecture"
  | "debugging"
  | "testing"
  | "documentation"
  | "technical_research"
  | "multimodal"
  | "general";

export type RoutingRule = {
  taskType: AiTaskType;
  keywords: string[];
  preferredModelId: string | null;
  fallbackModelId: string | null;
  reason: string;
};

export const ROUTING_RULES: RoutingRule[] = [
  {
    taskType: "code_generation",
    keywords: ["code", "implement", "function", "component", "scaffold", "build feature", "write code"],
    preferredModelId: "model-chatgpt-openai-gpt",
    fallbackModelId: "model-google-ai-studio-gemini",
    reason: "Coding & Development AI is the Owner's assigned role for ChatGPT / OpenAI GPT",
  },
  {
    taskType: "code_review",
    keywords: ["review", "refactor", "lint", "code quality", "pull request"],
    preferredModelId: "model-chatgpt-openai-gpt",
    fallbackModelId: "model-google-ai-studio-gemini",
    reason: "Code review is a development task",
  },
  {
    taskType: "testing",
    keywords: ["test", "unit test", "regression", "coverage", "qa"],
    preferredModelId: "model-chatgpt-openai-gpt",
    fallbackModelId: "model-google-ai-studio-gemini",
    reason: "Test design is a development task",
  },
  {
    taskType: "documentation",
    keywords: ["docs", "readme", "documentation", "handoff", "write guide"],
    preferredModelId: "model-chatgpt-openai-gpt",
    fallbackModelId: "model-google-ai-studio-gemini",
    reason: "Documentation drafting is a development task",
  },
  {
    taskType: "architecture",
    keywords: ["architecture", "system design", "schema", "database", "api contract", "tech stack"],
    preferredModelId: "model-google-ai-studio-gemini",
    fallbackModelId: "model-chatgpt-openai-gpt",
    reason: "Coding & Technical AI is the Owner's assigned role for Google AI Studio / Gemini",
  },
  {
    taskType: "debugging",
    keywords: ["bug", "debug", "error", "stack trace", "failing", "incident"],
    preferredModelId: "model-google-ai-studio-gemini",
    fallbackModelId: "model-chatgpt-openai-gpt",
    reason: "Technical analysis is assigned to Gemini",
  },
  {
    taskType: "technical_research",
    keywords: ["research", "evaluate", "benchmark", "compare", "feasibility"],
    preferredModelId: "model-google-ai-studio-gemini",
    fallbackModelId: "model-chatgpt-openai-gpt",
    reason: "Technical research is assigned to Gemini",
  },
  {
    taskType: "multimodal",
    keywords: ["image", "screenshot", "diagram", "vision", "video frame"],
    preferredModelId: "model-google-ai-studio-gemini",
    fallbackModelId: "model-chatgpt-openai-gpt",
    reason: "Multimodal is a CANDIDATE routing hint only — capability is UNVERIFIED and must not be claimed",
  },
];

export type RouteInput = {
  text?: unknown;
  taskType?: unknown;
  preferredModelId?: unknown;
  allowExternal?: unknown;
};

export type RoutePlan = {
  ok: boolean;
  planOnly: true;
  executable: false;
  modelCallAttempted: false;
  externalCalls: 0;
  request: { text: string; requestedTaskType: string; preferredModelId: string; allowExternal: boolean };
  departmentRouting: { id: string; basis: string; matchedKeywords: string[]; role: string };
  taskType: AiTaskType;
  selectedModelId: string | null;
  selectedModelLabel: string;
  fallbackModelId: string | null;
  basis: string;
  matchedKeywords: string[];
  matchedRule: string | null;
  overrideApplied: boolean;
  overrideError: string | null;
  connectedModels: number;
  registeredConnections: number;
  capabilityFactsVerified: false;
  blocked: string[];
  requiresOwnerApproval: true;
  safeFallback: { coordinator: string; humanOwner: string; note: string };
  costTracking: "NOT_IMPLEMENTED — requires real usage telemetry";
  rateLimitTracking: "NOT_IMPLEMENTED — requires real usage telemetry";
  clientIsolation: "RLS required before any LIVE model use — NOT IMPLEMENTED";
  sha256: string;
  note: string;
  error?: string;
};

export function routeAiRequest(input: RouteInput = {}): RoutePlan {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const lower = text.toLowerCase();
  const requestedTaskType = typeof input.taskType === "string" ? input.taskType.trim() : "";
  const preferredModelId = typeof input.preferredModelId === "string" ? input.preferredModelId.trim() : "";
  const allowExternal = input.allowExternal === true;
  const connectedModels = AI_MODEL_REGISTRY.filter((model) => Boolean(model.connected)).length;
  const registeredConnections = CONNECTION_SLOTS.filter((slot) => Boolean(slot.connected)).length;

  // Reuse the existing verified department router — no duplicate routing logic.
  const department = routeDepartment(text);

  // Explicit task type wins; otherwise deterministic keyword scoring.
  let rule: RoutingRule | null = null;
  let matchedKeywords: string[] = [];
  let basis = "";
  if (requestedTaskType) {
    rule = ROUTING_RULES.find((item) => item.taskType === requestedTaskType) ?? null;
    basis = rule ? "explicit-task-type" : "unknown-task-type";
  } else {
    let bestScore = 0;
    for (const candidate of ROUTING_RULES) {
      const hits = candidate.keywords.filter((keyword) => lower.includes(keyword));
      if (hits.length > bestScore) {
        bestScore = hits.length;
        rule = candidate;
        matchedKeywords = hits;
      }
    }
    basis = rule ? `keyword:${rule.taskType}` : "fallback-no-match";
  }
  if (rule && matchedKeywords.length === 0 && basis.startsWith("keyword")) {
    matchedKeywords = rule.keywords.filter((keyword) => lower.includes(keyword));
  }

  let selectedModelId: string | null = rule?.preferredModelId ?? null;
  let fallbackModelId: string | null = rule?.fallbackModelId ?? null;
  let overrideApplied = false;
  let overrideError: string | null = null;
  if (preferredModelId) {
    const known = AI_MODEL_REGISTRY.some((model) => model.id === preferredModelId);
    if (known) {
      selectedModelId = preferredModelId;
      overrideApplied = true;
      basis = "owner-model-override";
    } else {
      overrideError = `unknown model id: ${preferredModelId}`;
      basis = `${basis}+invalid-override`;
    }
  }

  const selected = AI_MODEL_REGISTRY.find((model) => model.id === selectedModelId);
  const base: RoutePlan = {
    ok: Boolean(text),
    planOnly: true,
    executable: false,
    modelCallAttempted: false,
    externalCalls: 0,
    request: { text, requestedTaskType, preferredModelId, allowExternal },
    departmentRouting: {
      id: department.id,
      basis: department.basis,
      matchedKeywords: department.matchedKeywords,
      role: department.role,
    },
    taskType: rule?.taskType ?? "general",
    selectedModelId,
    selectedModelLabel: selected?.label ?? "NONE — safe fallback to GIMMS Development Agent",
    fallbackModelId,
    basis,
    matchedKeywords,
    matchedRule: rule?.reason ?? null,
    overrideApplied,
    overrideError,
    connectedModels,
    registeredConnections,
    capabilityFactsVerified: false,
    blocked: [
      "No AI model is connected — 0 authenticated connections",
      "No provider credential is configured (server-side env required)",
      "No SDK / HTTP adapter implemented",
      "No authenticated connection test performed",
      "Exact model IDs, pricing, quotas and capabilities are UNVERIFIED",
      "Owner approval required before any external API access",
      allowExternal ? "allowExternal=true was supplied but is ignored — no model can be called" : "external calls disabled",
    ],
    requiresOwnerApproval: true,
    safeFallback: {
      coordinator: AI_TEAM.coordinatorRoleId,
      humanOwner: "Owner / Founder / Super Admin",
      note: "When no model is connected, the coordinator records a local plan and hands off to a human Owner. No work is fabricated.",
    },
    costTracking: "NOT_IMPLEMENTED — requires real usage telemetry",
    rateLimitTracking: "NOT_IMPLEMENTED — requires real usage telemetry",
    clientIsolation: "RLS required before any LIVE model use — NOT IMPLEMENTED",
    sha256: "",
    note: "Deterministic model-selection PLAN only. No request was sent to OpenAI, Google AI Studio, Gemini or any other provider.",
    ...(text ? {} : { error: "text is required" }),
  };
  base.sha256 = hash({ request: base.request, taskType: base.taskType, selectedModelId, basis, connectedModels });
  return base;
}

export function routingSummary() {
  return {
    rules: ROUTING_RULES.length,
    taskTypes: ROUTING_RULES.map((rule) => rule.taskType),
    connectedModels: AI_MODEL_REGISTRY.filter((model) => Boolean(model.connected)).length,
    executableRequests: 0,
    modelCallsMade: 0,
    externalCalls: 0,
    note: "Routing configured; execution BLOCKED until Owner approval + credentials + authenticated test.",
  };
}
