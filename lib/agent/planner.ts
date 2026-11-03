/**
 * GIMMS AUTO-PILOT — PLANNER.
 *
 * Turns an Owner command like
 *   "read the pricing table on gimms.lk and screenshot it"
 *   "draft a LinkedIn post about our new AI hub"
 * into a concrete, policy-checkable step plan.
 *
 * DESIGN CHOICE — deterministic, not LLM-driven:
 *   This planner is a rule engine with no model call. That is deliberate. An LLM
 *   planner in front of a real browser is an unbounded instruction channel: a
 *   prompt injection on a scraped page could emit steps the Owner never asked for.
 *   Here, the set of reachable plans is finite and auditable, and every generated
 *   step is re-checked by lib/agent/policy.ts before dispatch.
 *
 *   When you want natural-language breadth later, add an LLM *intent classifier*
 *   that must return one of the AgentJobKind values in a closed enum — never free
 *   step lists. See PHASE2-AGENT-ARCHITECTURE.md §6.
 */

import { ALLOWED_HOSTS } from "@/lib/agent/policy";
import type { AgentJobKind, AgentStep } from "@/lib/agent/types";

export type PlanDraft = {
  ok: boolean;
  kind: AgentJobKind;
  platform: string;
  startUrl: string;
  steps: AgentStep[];
  interpretation: string;
  needs: string[];
  error?: string;
};

const PLATFORM_HOSTS: { platform: string; hosts: string[]; home: string }[] = [
  { platform: "linkedin", hosts: ["linkedin.com"], home: "https://www.linkedin.com/feed/" },
  { platform: "x", hosts: ["x.com", "twitter.com"], home: "https://x.com/home" },
  { platform: "facebook", hosts: ["facebook.com"], home: "https://www.facebook.com/" },
  { platform: "instagram", hosts: ["instagram.com"], home: "https://www.instagram.com/" },
  { platform: "youtube", hosts: ["youtube.com"], home: "https://www.youtube.com/" },
];

function detectPlatform(text: string): { platform: string; home?: string } {
  const lower = text.toLowerCase();
  for (const entry of PLATFORM_HOSTS) {
    if (entry.hosts.some((host) => lower.includes(host.split(".")[0]))) {
      return { platform: entry.platform, home: entry.home };
    }
  }
  return { platform: "web" };
}

function extractUrl(text: string): string | null {
  const match = /(https?:\/\/[^\s<>"')]+)/i.exec(text);
  return match ? match[1].replace(/[.,;]+$/, "") : null;
}

/** Pull a quoted body out of the command: "draft: ..." or text in quotes. */
function extractBody(text: string): string | null {
  const quoted = /["“](.+?)["”]/.exec(text);
  if (quoted) return quoted[1].trim();
  const afterColon = /(?:draft|compose|write|post)\s*(?:a|an)?\s*(?:post|comment|message)?\s*[:\-]\s*(.+)$/i.exec(text);
  if (afterColon) return afterColon[1].trim();
  return null;
}

const READ_WORDS = /\b(read|extract|scrape|gather|collect|capture|screenshot|research|check|audit|look|find|get)\b/i;
const COMPOSE_WORDS = /\b(draft|compose|write|prepare|type|fill|fill in|prefill)\b/i;
const ENGAGE_WORDS = /\b(send|submit|post|comment|reply|like|follow|connect|message|dm|publish|share)\b/i;

export function planFromCommand(rawCommand: string): PlanDraft {
  const command = rawCommand.trim();
  if (command.length < 4) {
    return { ok: false, kind: "navigate", platform: "web", startUrl: "", steps: [], interpretation: "", needs: [], error: "Command is too short to plan." };
  }
  if (command.length > 2000) {
    return { ok: false, kind: "navigate", platform: "web", startUrl: "", steps: [], interpretation: "", needs: [], error: "Command exceeds 2000 characters." };
  }

  const explicitUrl = extractUrl(command);
  const { platform, home } = detectPlatform(command);
  const body = extractBody(command);
  const needs: string[] = [];

  const wantsEngage = ENGAGE_WORDS.test(command);
  const wantsCompose = COMPOSE_WORDS.test(command);
  const wantsRead = READ_WORDS.test(command);

  // ── Decide the kind. Compose beats engage: if the Owner said "draft ... post",
  //    the safe reading is compose-only unless they said submit/send explicitly.
  let kind: AgentJobKind;
  let interpretation: string;
  if (wantsCompose && !/\b(submit|send it|send now|really post|publish now)\b/i.test(command)) {
    kind = "social.draft";
    interpretation = "Compose the content inside the browser and STOP before submitting. Nothing leaves the browser until you press the final key yourself.";
  } else if (wantsEngage && platform !== "web") {
    kind = "social.engage";
    interpretation = "Submit an interaction on the platform. This is refused by default — see policy §PLATFORM_OPT_IN.";
  } else if (wantsEngage) {
    kind = "form.submit";
    interpretation = "Fill and submit a form on the target page. Requires approval.";
  } else if (wantsRead || explicitUrl) {
    kind = "research.extract";
    interpretation = "Read the page, capture its main content and a screenshot. No writes.";
  } else {
    kind = "navigate";
    interpretation = "Open the page and report its title, URL and a screenshot.";
  }

  // ── Resolve the start URL.
  let startUrl = explicitUrl ?? "";
  if (!startUrl && home) startUrl = home;
  if (!startUrl) {
    return {
      ok: false,
      kind,
      platform,
      startUrl: "",
      steps: [],
      interpretation,
      needs: ["A URL. Say e.g. \"read https://gimms.lk/pricing and screenshot it\"."],
      error: "No target URL could be determined from the command.",
    };
  }

  // Normalise scheme-less domains such as "gimms.lk/pricing".
  if (!/^https?:\/\//i.test(startUrl)) startUrl = `https://${startUrl}`;

  let parsed: URL;
  try {
    parsed = new URL(startUrl);
  } catch {
    return { ok: false, kind, platform, startUrl, steps: [], interpretation, needs: [], error: `"${startUrl}" is not a valid URL.` };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, kind, platform, startUrl, steps: [], interpretation, needs: [], error: "Only https:// URLs are allowed." };
  }
  const host = parsed.hostname.toLowerCase();
  const allowlisted = ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  if (!allowlisted) {
    return {
      ok: false,
      kind,
      platform,
      startUrl,
      steps: [],
      interpretation,
      needs: [`Add ${host} to ALLOWED_HOSTS in lib/agent/policy.ts if it is genuinely yours.`],
      error: `${host} is not on the allowlist.`,
    };
  }

  // ── Build the steps for the chosen kind.
  const steps: AgentStep[] = [];
  steps.push({ op: "goto", url: startUrl, description: `Open ${startUrl}`, timeoutMs: 30_000 });
  steps.push({ op: "waitFor", selector: "body", description: "Wait for the page body to be interactive", timeoutMs: 20_000 });
  steps.push({ op: "humanPause", ms: 900, description: "Brief idle beat after load (avoids a robotic instant-click)" });

  if (kind === "research.extract" || kind === "navigate") {
    steps.push({ op: "humanScroll", direction: "down", amount: 600, description: "Scroll down slowly to trigger lazy content" });
    steps.push({ op: "humanPause", ms: 700, description: "Pause while lazy content settles" });
    steps.push({
      op: "extract",
      name: "page",
      attribute: "innerText",
      selector: "main, article, [role=main]",
      selectors: ["main", "article", "[role=main]", "body"],
      description: "Capture the main content text",
    });
    steps.push({
      op: "extract",
      name: "headings",
      attribute: "innerText",
      selector: "h1, h2",
      description: "Capture the h1/h2 headings for structure",
    });
    steps.push({ op: "extract", name: "links", attribute: "href", selector: "main a[href]", description: "Capture outbound links in the main region" });
    steps.push({ op: "screenshot", name: "page-full", description: "Full-page screenshot as evidence" });
  }

  if (kind === "social.draft" || kind === "social.engage") {
    const content = body ?? command.replace(/^.*?:/, "").trim();
    if (!/^https?:\/\//i.test(startUrl) || startUrl === home) {
      needs.push(
        platform === "linkedin"
          ? "Open the composer yourself in the worker profile first, then paste its URL as the target."
          : "Provide the exact composer URL for this platform.",
      );
    }
    steps.push({
      op: "humanClick",
      selector: "[contenteditable=true], div[role=textbox], textarea",
      selectors: ["div[role=textbox]", "[contenteditable=true]", "textarea"],
      description: "Focus the composer box",
    });
    steps.push({ op: "humanPause", ms: 600, description: "Settle before typing" });
    steps.push({
      op: "humanType",
      text: content,
      description: kind === "social.draft" ? `Type the composed body (${content.length} chars) — do NOT submit` : "Type the body",
    });
    steps.push({ op: "screenshot", name: "composed", description: "Screenshot the composed content as proof it is filled but not sent" });
    if (kind === "social.engage") {
      steps.push({ op: "assertVisible", selector: "[type=submit], button[type=submit]", description: "Confirm the submit control exists" });
      steps.push({ op: "humanPause", ms: 1200, description: "Final beat before submit" });
    }
  }

  if (kind === "form.submit") {
    steps.push({ op: "screenshot", name: "form-before", description: "Screenshot the empty form" });
    if (body) steps.push({ op: "humanType", text: body, description: "Type the supplied body into the first field" });
    steps.push({ op: "screenshot", name: "form-filled", description: "Screenshot the filled form" });
  }

  return { ok: true, kind, platform, startUrl, steps, interpretation, needs };
}
