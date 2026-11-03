/**
 * GIMMS AUTO-PILOT v3 — INTENT LAYER (a CLOSED vocabulary).
 *
 * THE ONE RULE IN THIS FILE
 * -------------------------
 * Classification returns exactly ONE value from `INTENTS`. It never returns a step
 * list, a tool list, a URL, or free text that a downstream component would "interpret".
 * The LLM, when enabled, is an *enum picker* — not a planner. Everything it can do is
 * choose one of the ten strings below; anything else is discarded and the deterministic
 * classifier wins.
 *
 * WHY THIS MATTERS
 * ----------------
 * The failure mode of an "autonomous agent" is not a wrong plan, it is an *unreviewable*
 * plan. If a model can emit arbitrary steps, no one can say in advance what the agent is
 * able to do. With a closed enum, the entire surface is auditable: ten intents, each
 * mapped to a fixed set of tools in `lib/autopilot/tools.ts`.
 *
 * DETERMINISTIC BY DEFAULT
 * ------------------------
 * Keyword scoring runs first and always produces a result. The LLM is opt-in:
 *   AUTOPILOT_LLM_CLASSIFIER=1  +  OPENAI_API_KEY  (+ optional AUTOPILOT_LLM_MODEL)
 * With either missing, behaviour is 100% local, deterministic and free. This is the
 * shipped default and it matches the hub's current reality: 0 AI models connected.
 *
 * NO DEPENDENCY. Plain `fetch` (Node 18+/22 built-in), 6s timeout, no retries.
 * Server-only.
 */

import { hasVar, optionalVar } from "@/lib/env";

export const INTENTS = [
  "EMAIL_TRIAGE", // read the mailbox, summarise what needs attention
  "EMAIL_DRAFT_REPLY", // compose a reply as a DRAFT — never send
  "EMAIL_SEND", // ALWAYS REFUSED — recognised only so the refusal is explicit, not a shrug
  "SOCIAL_DRAFT", // compose a social post/comment as text — never submit
  "SOCIAL_PUBLISH", // ALWAYS REFUSED — unattended posting/commenting
  "BROWSER_RESEARCH", // open a page in the cloud browser and extract facts
  "SEO_AUDIT", // inspect a page's on-page signals
  "ADS_REVIEW", // READ ad account performance; never change spend
  "ADS_CHANGE", // ALWAYS REFUSED for unattended use — money-moving
  "STATUS_REPORT", // report on jobs/agents/queue
  "UNKNOWN", // honest "I did not understand" — never guessed
] as const;

export type IntentId = (typeof INTENTS)[number];

export type IntentMatch = {
  intent: IntentId;
  method: "deterministic" | "llm";
  confidence: number;
  signals: string[];
  llmAttempted: boolean;
  note: string;
};

export const COMMIT_INTENTS = ["EMAIL_SEND", "SOCIAL_PUBLISH", "ADS_CHANGE"] as const;
export type CommitIntent = (typeof COMMIT_INTENTS)[number];

export function isCommitIntent(value: unknown): value is CommitIntent {
  return typeof value === "string" && (COMMIT_INTENTS as readonly string[]).includes(value);
}

export function isIntentId(value: unknown): value is IntentId {
  return typeof value === "string" && (INTENTS as readonly string[]).includes(value);
}

type Rule = { intent: Exclude<IntentId, "UNKNOWN">; patterns: readonly RegExp[] };

/**
 * Ordered rules. Each match adds one signal; the intent with the most signals wins.
 * Ties resolve to the earlier rule, which is why the most specific intents come first.
 */
const RULES: readonly Rule[] = [
  // ── commit intents first: a request with an outside effect must never be
  //    downgraded into a harmless-looking draft by a later, narrower rule. ──
  {
    intent: "EMAIL_SEND",
    patterns: [/\b(send|fire\s*off|dispatch|mail\s*out|deliver)\b.{0,30}\b(email|e-mail|mail|repl(y|ies)|message)\b/i, /\bemail\b.{0,20}\b(send|out)\b/i, /\bauto[-\s]?(reply|respond|send)\b/i],
  },
  {
    intent: "SOCIAL_PUBLISH",
    patterns: [/\b(post|publish|comment|tweet|share|connect|follow|dm)\b.{0,40}\b(automatically|auto|unattended|on my behalf|for me)\b/i, /\bauto[-\s]?(post|comment|publish|connect)\b/i, /\bunattended\b.{0,30}\b(post|comment|publish)\b/i],
  },
  {
    intent: "ADS_CHANGE",
    patterns: [
      /\b(increase|decrease|raise|lower|set|change|edit|pause|resume|enable|disable|boost|scale)\b.{0,40}\b(budget|spend|bid|cpc|campaign|ad\s*set)\b/i,
      /\b(budget|spend)\b.{0,30}\b(increase|decrease|raise|lower|set|change|pause)\b/i,
    ],
  },
  {
    intent: "EMAIL_DRAFT_REPLY",
    patterns: [/\b(draft|compose|write|prepare)\b.{0,40}\b(repl(y|ies)|email|e-mail|mail)\b/i, /\breply\b.{0,30}\bemail\b/i, /\bemail\b.{0,30}\breply\b/i],
  },
  {
    intent: "EMAIL_TRIAGE",
    patterns: [/\b(check|read|scan|triage|review|summar\w*)\b.{0,30}\b(inbox|emails?|e-mails?|mail|gmail)\b/i, /\binbox\b/i, /\bunread\b/i],
  },
  {
    intent: "ADS_REVIEW",
    patterns: [/\b(facebook|meta|instagram)\b.{0,30}\bads?\b/i, /\bads?\b.{0,30}\b(campaign|spend|budget|roas|cpc|cpm|performance|report)\b/i, /\bcampaign\b/i],
  },
  {
    intent: "SEO_AUDIT",
    patterns: [/\bseo\b/i, /\bmeta\s*description\b/i, /\bh1\b/i, /\bpage\s*speed\b/i, /\bkeywords?\b.{0,20}\b(audit|check|review|rank)/i],
  },
  {
    intent: "BROWSER_RESEARCH",
    patterns: [/\b(read|open|visit|browse|scrape|extract|research|look\s*up|check)\b.{0,40}https?:\/\//i, /\bhttps?:\/\/\S+/i, /\bscreenshot\b/i, /\bscrape\b/i],
  },
  {
    intent: "SOCIAL_DRAFT",
    patterns: [/\b(draft|compose|write|prepare)\b.{0,40}\b(post|comment|caption|tweet|update)\b/i, /\b(linkedin|facebook|instagram|x|twitter)\b.{0,30}\b(post|comment|caption)\b/i],
  },
  {
    intent: "STATUS_REPORT",
    patterns: [/\b(status|report|summary|summar\w*|how\s*many|queue|jobs?|agents?)\b/i, /\bwhat('| i)?s\s+(running|queued|pending)\b/i],
  },
];

export function classifyDeterministic(command: string): IntentMatch {
  const text = command.trim();
  const scored = RULES.map((rule) => ({
    intent: rule.intent,
    signals: rule.patterns.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern)),
  }))
    .map((entry) => ({ ...entry, score: entry.signals.length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // SAFETY PRECEDENCE: if a commit intent matched at all, it wins — even when a read
  // intent scored more signals. "increase the facebook ad campaign budget" matches both
  // ADS_CHANGE and ADS_REVIEW; silently downgrading it to a "review" would misrepresent
  // what the Owner asked for. Recognise the commit, then refuse it explicitly.
  const best = scored.find((entry) => COMMIT_INTENTS.includes(entry.intent as CommitIntent)) ?? scored[0];
  if (!best) {
    return {
      intent: "UNKNOWN",
      method: "deterministic",
      confidence: 0,
      signals: [],
      llmAttempted: false,
      note: "No known intent matched. The hub refuses to guess rather than inventing a plan.",
    };
  }

  return {
    intent: best.intent,
    method: "deterministic",
    confidence: Math.min(1, 0.55 + 0.15 * best.score),
    signals: best.signals,
    llmAttempted: false,
    note: `Matched ${best.score} signal(s) locally. No model was called.`,
  };
}

/** Presence-only. Never returns or logs a value. */
export function llmClassifierEnabled(): boolean {
  return process.env.AUTOPILOT_LLM_CLASSIFIER === "1" && hasVar("OPENAI_API_KEY");
}

export function llmClassifierModel(): string {
  return optionalVar("AUTOPILOT_LLM_MODEL", "gpt-4o-mini");
}

const SYSTEM_PROMPT = [
  "You are an intent classifier for a business operations agent.",
  "Return ONLY JSON of the form {\"intent\":\"<ONE_ID>\"}.",
  `Allowed IDs: ${INTENTS.join(", ")}.`,
  "Do not return steps, tools, URLs, explanations or prose.",
  "If nothing fits, return UNKNOWN. Never invent an ID.",
].join(" ");

function stripJsonFence(raw: string): string {
  return raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
}

/**
 * Optional LLM pass. Any deviation — timeout, non-2xx, prose instead of JSON, an ID
 * outside the enum — falls back to the deterministic result. It cannot widen the enum,
 * and it cannot produce a plan.
 */
export async function classifyIntent(command: string): Promise<IntentMatch> {
  const deterministic = classifyDeterministic(command);
  if (!llmClassifierEnabled()) return deterministic;

  try {
    const response = await fetch(`${optionalVar("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: llmClassifierModel(),
        temperature: 0,
        max_tokens: 20,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: command.slice(0, 2000) },
        ],
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ...deterministic, llmAttempted: true, note: `LLM classifier returned HTTP ${response.status}; used the local result.` };
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripJsonFence(content)) as { intent?: unknown };

    if (!isIntentId(parsed.intent)) {
      return { ...deterministic, llmAttempted: true, note: "LLM returned an ID outside the closed enum; rejected, used the local result." };
    }

    if (parsed.intent === deterministic.intent) {
      return { ...deterministic, method: "llm", llmAttempted: true, confidence: Math.min(1, deterministic.confidence + 0.2), note: "LLM agreed with the local classifier." };
    }

    return {
      intent: parsed.intent,
      method: "llm",
      confidence: deterministic.confidence > 0 ? 0.7 : 0.6,
      signals: deterministic.signals,
      llmAttempted: true,
      note: `LLM chose ${parsed.intent} (local guess: ${deterministic.intent}). Enum still closed — the plan comes from the tool registry, not the model.`,
    };
  } catch (cause) {
    return {
      ...deterministic,
      llmAttempted: true,
      note: `LLM classifier unavailable (${cause instanceof Error ? cause.name : "error"}); used the local result.`,
    };
  }
}

export const INTENT_SUMMARY = {
  closedVocabulary: true,
  total: INTENTS.length,
  plannerUsesModel: false,
  commitIntentsAlwaysRefused: COMMIT_INTENTS,
  llmRole: "enum selection only — never emits steps",
  defaultMode: "deterministic",
} as const;
