/**
 * GIMMS — OWNER CHAT persistent store (real conversation, events, reviews).
 *
 * Reuses `newId` / `auditEntry` (lib/store.ts) and `hash` (lib/jobs.ts).
 * Storage: data/gimms-chat.json (git-ignored). FILE-ONLY — deleting the file
 * genuinely clears the test conversation so the Owner starts fresh.
 *
 * No AI model call, no external message, no email, no webhook, no production DB.
 * Every message/event carries a SHA-256 evidence hash.
 */

import fs from "node:fs";
import path from "node:path";
import { newId } from "@/lib/store";
import { hash } from "@/lib/jobs";

const FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "gimms-chat.json");

export type ChatMessage = {
  id: string;
  role: "owner" | "gimms" | "system";
  text: string;
  at: string;
  jobId?: string;
  error?: string;
  aiModelUsed: false;
  sha256: string;
};

export type ChatEvent = {
  id: string;
  at: string;
  sequence: number;
  kind: string;
  stage: string;
  level: "info" | "progress" | "blocked" | "error" | "result";
  message: string;
  jobId?: string;
  data?: Record<string, unknown>;
  sha256: string;
};

export type ChatReview = {
  id: string;
  at: string;
  jobId: string;
  decision: "APPROVED_LOCAL_RECORD_ONLY" | "REJECTED";
  decidedBy: string;
  resultVersion: string;
  note: string;
  moneyMovement: false;
  externalCalls: 0;
  sha256: string;
};

export type ChatCommandRecord = {
  id: string;
  at: string;
  text: string;
  jobId: string;
  ownerId: string;
  routingBasis: string;
  selectedModelId: string | null;
  aiDeveloperAssigned: false;
  aiModelUsed: false;
  executor: string;
  stages: string[];
  checksPassed: number;
  checksFailed: number;
  resultSha256: string;
  sha256: string;
};

type ChatState = {
  version: 1;
  messages: ChatMessage[];
  events: ChatEvent[];
  reviews: ChatReview[];
  commands: ChatCommandRecord[];
};

function empty(): ChatState {
  return { version: 1, messages: [], events: [], reviews: [], commands: [] };
}

function read(): ChatState {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as ChatState;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.messages) && Array.isArray(parsed.events)) {
      return {
        version: 1,
        messages: parsed.messages,
        events: parsed.events,
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      };
    }
  } catch {
    /* missing or unreadable */
  }
  return empty();
}

function write(state: ChatState): boolean {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function appendMessage(input: {
  role: ChatMessage["role"];
  text: string;
  jobId?: string;
  error?: string;
}): ChatMessage {
  const state = read();
  const at = new Date().toISOString();
  const message: ChatMessage = {
    id: newId("msg"),
    role: input.role,
    text: input.text,
    at,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.error ? { error: input.error } : {}),
    aiModelUsed: false,
    sha256: "",
  };
  message.sha256 = hash({ id: message.id, role: message.role, text: message.text, at, jobId: message.jobId ?? null });
  state.messages.push(message);
  write(state);
  return message;
}

export function appendEvent(input: {
  kind: string;
  stage: string;
  level: ChatEvent["level"];
  message: string;
  jobId?: string;
  data?: Record<string, unknown>;
}): ChatEvent {
  const state = read();
  const at = new Date().toISOString();
  const sequence = state.events.length + 1;
  const event: ChatEvent = {
    id: newId("evt"),
    at,
    sequence,
    kind: input.kind,
    stage: input.stage,
    level: input.level,
    message: input.message,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.data ? { data: input.data } : {}),
    sha256: "",
  };
  event.sha256 = hash({ id: event.id, sequence, kind: event.kind, stage: event.stage, message: event.message, at });
  state.events.push(event);
  write(state);
  return event;
}

export function appendReview(input: { jobId: string; decision: ChatReview["decision"]; decidedBy: string; resultVersion: string; note?: string }): ChatReview {
  const state = read();
  const at = new Date().toISOString();
  const review: ChatReview = {
    id: newId("review"),
    at,
    jobId: input.jobId,
    decision: input.decision,
    decidedBy: input.decidedBy,
    resultVersion: input.resultVersion,
    note: input.note ?? "Owner review of LOCAL deterministic result only — not an AI model output, not a production change.",
    moneyMovement: false,
    externalCalls: 0,
    sha256: "",
  };
  review.sha256 = hash({ id: review.id, jobId: review.jobId, decision: review.decision, at });
  state.reviews.push(review);
  write(state);
  return review;
}

export function recordCommand(record: Omit<ChatCommandRecord, "id" | "at" | "sha256">): ChatCommandRecord {
  const state = read();
  const at = new Date().toISOString();
  const entry: ChatCommandRecord = { ...record, id: newId("cmd"), at, sha256: "" };
  entry.sha256 = hash({ id: entry.id, text: entry.text, jobId: entry.jobId, at, resultSha256: entry.resultSha256 });
  state.commands.push(entry);
  write(state);
  return entry;
}

export function chatSnapshot(eventLimit = 80) {
  const state = read();
  return {
    ok: true,
    counts: {
      messages: state.messages.length,
      events: state.events.length,
      reviews: state.reviews.length,
      commands: state.commands.length,
    },
    messages: state.messages,
    events: state.events.slice(-eventLimit),
    reviews: state.reviews,
    commands: state.commands,
    lastEventSequence: state.events.length,
    sha256: hash(state),
    storage: "data/gimms-chat.json (local file; no external service)",
  };
}

export function eventsSince(sequence: number): ChatEvent[] {
  return read().events.slice(Math.max(0, sequence));
}
