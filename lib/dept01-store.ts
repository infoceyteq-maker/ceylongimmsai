/**
 * GIMMS P1-01 — Dept 01 LOCAL state store.
 *
 * Reuses the EXISTING working helpers `newId` / `auditEntry` (lib/store.ts) and
 * `hash` (lib/jobs.ts). No duplicate ID/audit/hash implementation.
 *
 * Storage: data/gimms-dept01.json (git-ignored) + in-memory fallback.
 * NEVER touches live public.hub_state, never calls an external service.
 * Financial records are RECORDS/REQUESTS only — no money ever moves here.
 * "All financial transactions must require appropriate authorization":
 * every finance record carries an approval object, and payment execution is
 * refused entirely (see lib/dept01-skills.ts `finance.payment.request`).
 */

import fs from "node:fs";
import path from "node:path";
import { newId, auditEntry } from "@/lib/store";
import { hash } from "@/lib/jobs";
import type { ArtifactMeta } from "@/lib/office";

const ROOT = process.cwd();
const FILE = path.join(/*turbopackIgnore: true*/ ROOT, "data", "gimms-dept01.json");

export type ApprovalRecord = {
  id: string;
  subjectId: string;
  subject: string;
  scope: string;
  status: "PENDING_OWNER_AUTHORIZATION" | "APPROVED_RECORD_ONLY" | "REJECTED";
  requestedBy: string;
  decidedBy: string;
  decision: string;
  artifactVersion: string;
  moneyMovement: false;
  createdAt: string;
  decidedAt: string;
  auditTrail: { at: string; action: string; detail: string }[];
};

export type Dept01Record = {
  id: string;
  collection: string;
  module: string;
  skillId: string;
  status: string;
  data: Record<string, unknown>;
  approvalStatus: string;
  moneyMovement: false;
  externalCalls: 0;
  createdAt: string;
  sha256: string;
  auditTrail: { at: string; action: string; detail: string }[];
};

export type WorkflowRecord = {
  id: string;
  chain: string;
  steps: { name: string; jobId: string; department: string; status: string; basis: string }[];
  ownerApproval: "PENDING" | "APPROVED_RECORD_ONLY";
  approvalId: string;
  createdAt: string;
  sha256: string;
};

export type CommandRecord = {
  id: string;
  command: string;
  parsedSteps: string[];
  executedSteps: { step: string; ok: boolean; evidence: Record<string, unknown> }[];
  commandHash: string;
  createdAt: string;
};

export type Dept01State = {
  version: 1;
  records: Record<string, Dept01Record[]>;
  artifacts: ArtifactMeta[];
  approvals: ApprovalRecord[];
  workflows: WorkflowRecord[];
  commands: CommandRecord[];
  counters: { employee: number };
  audit: { at: string; action: string; detail: string }[];
};

function typedAudit(action: string, detail: string): Dept01Record["auditTrail"][number] {
  return auditEntry(action, detail) as Dept01Record["auditTrail"][number];
}

function blank(): Dept01State {
  return {
    version: 1,
    records: {},
    artifacts: [],
    approvals: [],
    workflows: [],
    commands: [],
    // EMP-0001 is reserved for the proposed Founder/Owner/Super Admin account.
    counters: { employee: 1 },
    audit: [typedAudit("dept01.init", "local P1-01 store created; EMP-0001 reserved")],
  };
}

let memory: Dept01State | null = null;

export function readState(): Dept01State {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as Dept01State;
    if (parsed && parsed.version === 1 && parsed.records) return parsed;
  } catch {
    // missing file or read-only host
  }
  if (!memory) memory = blank();
  return memory;
}

export function writeState(state: Dept01State): boolean {
  memory = state;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function addRecord(input: {
  collection: string;
  module: string;
  skillId: string;
  status?: string;
  data: Record<string, unknown>;
  approvalStatus?: string;
}): { ok: boolean; record: Dept01Record; persisted: boolean } {
  const state = readState();
  const record: Dept01Record = {
    id: newId(input.collection.replace(/[^a-z0-9]/gi, "").slice(0, 12) || "rec"),
    collection: input.collection,
    module: input.module,
    skillId: input.skillId,
    status: input.status ?? "DRAFT",
    data: input.data,
    approvalStatus: input.approvalStatus ?? "NOT_REQUIRED",
    moneyMovement: false,
    externalCalls: 0,
    createdAt: new Date().toISOString(),
    sha256: "",
    auditTrail: [typedAudit("dept01.record", `${input.collection}:${input.skillId}`)],
  };
  record.sha256 = hash(record);
  state.records[input.collection] = [record, ...(state.records[input.collection] ?? [])];
  state.audit = [typedAudit("dept01.record.added", `${input.collection}:${record.id}`), ...state.audit].slice(0, 300);
  const persisted = writeState(state);
  return { ok: true, record, persisted };
}

export function listRecords(collection: string): Dept01Record[] {
  return readState().records[collection] ?? [];
}

export function allRecords(): Dept01Record[] {
  const state = readState();
  return Object.values(state.records).flat();
}

export function nextEmployeeId(): string {
  const state = readState();
  state.counters.employee += 1;
  writeState(state);
  return `EMP-${String(state.counters.employee).padStart(4, "0")}`;
}

export function peekEmployeeId(): string {
  return `EMP-${String(readState().counters.employee + 1).padStart(4, "0")}`;
}

export function recordArtifact(meta: ArtifactMeta): ArtifactMeta {
  const state = readState();
  state.artifacts = [meta, ...state.artifacts.filter((a) => a.name !== meta.name)].slice(0, 200);
  state.audit = [typedAudit("dept01.artifact", `${meta.name} ${meta.bytes}B ${meta.sha256.slice(0, 12)}`), ...state.audit].slice(0, 300);
  writeState(state);
  return meta;
}

export function listArtifacts(): ArtifactMeta[] {
  return readState().artifacts;
}

export function findArtifact(name: string): ArtifactMeta | undefined {
  return readState().artifacts.find((a) => a.name === name);
}

export function requestApproval(input: {
  subjectId: string;
  subject: string;
  scope: string;
  requestedBy: string;
  artifactVersion?: string;
}): { approval: ApprovalRecord; persisted: boolean } {
  const state = readState();
  const approval: ApprovalRecord = {
    id: newId("approval"),
    subjectId: input.subjectId,
    subject: input.subject,
    scope: input.scope,
    status: "PENDING_OWNER_AUTHORIZATION",
    requestedBy: input.requestedBy,
    decidedBy: "",
    decision: "",
    artifactVersion: input.artifactVersion ?? hash({ subjectId: input.subjectId, scope: input.scope }),
    moneyMovement: false,
    createdAt: new Date().toISOString(),
    decidedAt: "",
    auditTrail: [typedAudit("dept01.approval.requested", input.subject)],
  };
  state.approvals = [approval, ...state.approvals];
  state.audit = [typedAudit("dept01.approval.requested", approval.id), ...state.audit].slice(0, 300);
  return { approval, persisted: writeState(state) };
}

/** Explicit, versioned, record-only approval. Never moves money, never auto-approves. */
export function decideApproval(input: {
  approvalId: string;
  approver: string;
  decision: "APPROVED_RECORD_ONLY" | "REJECTED";
  artifactVersion: string;
}): { ok: boolean; error?: string; approval?: ApprovalRecord } {
  if (!input.approver.trim()) return { ok: false, error: "approver is required" };
  if (!input.artifactVersion.trim()) return { ok: false, error: "artifactVersion is required" };
  const state = readState();
  const index = state.approvals.findIndex((a) => a.id === input.approvalId);
  if (index < 0) return { ok: false, error: `approval not found: ${input.approvalId}` };
  const current = state.approvals[index];
  if (current.status !== "PENDING_OWNER_AUTHORIZATION") {
    return { ok: false, error: `approval ${current.id} is already ${current.status}` };
  }
  if (current.artifactVersion !== input.artifactVersion) {
    return { ok: false, error: "artifactVersion mismatch — approval covers an exact version only" };
  }
  const updated: ApprovalRecord = {
    ...current,
    status: input.decision,
    decidedBy: input.approver,
    decision: input.decision,
    decidedAt: new Date().toISOString(),
    auditTrail: [typedAudit("dept01.approval.decided", `${input.decision} by ${input.approver}`), ...current.auditTrail],
  };
  state.approvals[index] = updated;
  state.audit = [typedAudit("dept01.approval.decided", updated.id), ...state.audit].slice(0, 300);
  writeState(state);
  return { ok: true, approval: updated };
}

export function listApprovals(): ApprovalRecord[] {
  return readState().approvals;
}

export function recordWorkflow(workflow: WorkflowRecord): boolean {
  const state = readState();
  state.workflows = [workflow, ...state.workflows].slice(0, 50);
  state.audit = [typedAudit("dept01.workflow", `${workflow.id} ownerApproval=${workflow.ownerApproval}`), ...state.audit].slice(0, 300);
  return writeState(state);
}

export function listWorkflows(): WorkflowRecord[] {
  return readState().workflows;
}

export function recordCommand(command: CommandRecord): boolean {
  const state = readState();
  state.commands = [command, ...state.commands].slice(0, 50);
  state.audit = [typedAudit("dept01.command", command.commandHash.slice(0, 16)), ...state.audit].slice(0, 300);
  return writeState(state);
}

export function listCommands(): CommandRecord[] {
  return readState().commands;
}

export function summary() {
  const state = readState();
  const byCollection: Record<string, number> = {};
  for (const [key, value] of Object.entries(state.records)) byCollection[key] = value.length;
  const approvalsByStatus: Record<string, number> = {};
  for (const approval of state.approvals) {
    approvalsByStatus[approval.status] = (approvalsByStatus[approval.status] ?? 0) + 1;
  }
  return {
    version: state.version,
    records: allRecords().length,
    byCollection,
    artifacts: state.artifacts.length,
    artifactBytes: state.artifacts.reduce((sum, a) => sum + a.bytes, 0),
    approvals: state.approvals.length,
    approvalsByStatus,
    workflows: state.workflows.length,
    commands: state.commands.length,
    auditEntries: state.audit.length,
    nextEmployeeId: peekEmployeeId(),
    ownerEmployeeIdReserved: "EMP-0001",
    sha256: hash({ byCollection, artifacts: state.artifacts.map((a) => a.sha256) }),
    storage: "data/gimms-dept01.json (local file, in-memory fallback)",
    moneyMovement: false,
    externalCalls: 0,
    connectedServices: 0,
  };
}
