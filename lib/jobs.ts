/**
 * GIMMS Phase 0 — Universal Job/Task model, routing and status machine.
 *
 * Implements the field list and statuses of Master Doc section 3. Reuses the EXISTING
 * working helpers `newId` and `auditEntry` from lib/store.ts (no duplicate ID/audit code).
 *
 * Storage is a LOCAL file (data/gimms-jobs.json) with an in-memory fallback for read-only
 * hosts. It deliberately does NOT touch the live `public.hub_state` row and makes NO
 * external network call. This keeps Phase 0 free of production side effects.
 *
 * Server-only. Never imported by a client component.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { newId, auditEntry } from "@/lib/store";
import { getDepartment, routeDepartment, type RoutingResult } from "@/lib/departments";

export const JOB_STATUSES = [
  "NEW",
  "REVIEW",
  "ASSIGN",
  "IN_PROGRESS",
  "QUALITY_CHECK",
  "APPROVAL",
  "DELIVERY",
  "COMPLETE",
  "BLOCKED",
  "FAILED",
  "ON_HOLD",
  "CANCELLED",
  "REOPENED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  NEW: ["REVIEW", "ASSIGN", "BLOCKED", "CANCELLED"],
  REVIEW: ["ASSIGN", "BLOCKED", "ON_HOLD", "CANCELLED"],
  ASSIGN: ["IN_PROGRESS", "BLOCKED", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["QUALITY_CHECK", "BLOCKED", "FAILED", "ON_HOLD"],
  QUALITY_CHECK: ["APPROVAL", "IN_PROGRESS", "FAILED"],
  APPROVAL: ["DELIVERY", "REVIEW", "ON_HOLD"],
  DELIVERY: ["COMPLETE", "FAILED"],
  COMPLETE: ["REOPENED"],
  BLOCKED: ["REVIEW", "CANCELLED"],
  FAILED: ["REVIEW", "CANCELLED"],
  ON_HOLD: ["REVIEW", "CANCELLED"],
  CANCELLED: [],
  REOPENED: ["REVIEW", "ASSIGN"],
};

export type Assignee = { type: "human" | "ai" | "unassigned"; id: string };

/** Master Doc section 3: every job record carries these fields. */
export type Job = {
  jobId: string;
  title: string;
  department: string;
  departmentName: string;
  division: string;
  jobRole: string;
  assignee: Assignee;
  clientId: string;
  projectId: string;
  description: string;
  inputFiles: string[];
  expectedDeliverable: string;
  requiredSkills: string[];
  tools: string[];
  apiConnections: string[];
  permissionScope: string;
  priority: "P0" | "P1" | "P2" | "P3";
  deadline: string;
  budget: string;
  status: JobStatus;
  approvals: { at: string; by: string; decision: string }[];
  qaCriteria: string[];
  completionEvidence: { at: string; skillId: string; sha256: string }[];
  auditTrail: { at: string; action: string; detail: string }[];
  routing: RoutingResult;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobInput = {
  title?: unknown;
  departmentId?: unknown;
  description?: unknown;
  clientId?: unknown;
  projectId?: unknown;
  expectedDeliverable?: unknown;
  requiredSkills?: unknown;
  priority?: unknown;
  deadline?: unknown;
  budget?: unknown;
  permissionScope?: unknown;
};

const FILE = path.join(process.cwd(), "data", "gimms-jobs.json");
let memoryJobs: Job[] | null = null;

/** Reuses the existing lib/store.ts audit helper, narrowed to this module's typed shape. */
function typedAudit(action: string, detail: string): Job["auditTrail"][number] {
  return auditEntry(action, detail) as Job["auditTrail"][number];
}

export function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJobs(): Job[] {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as Job[];
  } catch {
    // missing file or read-only host: fall back to warm memory
  }
  if (!memoryJobs) memoryJobs = [];
  return memoryJobs;
}

function writeJobs(jobs: Job[]): boolean {
  memoryJobs = jobs;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(jobs, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function listJobs(): Job[] {
  return readJobs();
}

export function getJob(jobId: string): Job | undefined {
  return readJobs().find((job) => job.jobId === jobId);
}

export function createJob(input: CreateJobInput): {
  ok: boolean;
  error?: string;
  job?: Job;
  persisted?: boolean;
} {
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, error: "title is required" };

  const explicitId = String(input.departmentId ?? "").trim();
  const routing = routeDepartment(`${title} ${String(input.description ?? "")}`, explicitId);
  const department = getDepartment(routing.id);
  if (!department) return { ok: false, error: "routing produced an unknown department" };

  if (explicitId && explicitId !== routing.id) {
    return { ok: false, error: `unknown departmentId: ${explicitId}` };
  }
  if (department.status !== "active-p0") {
    return {
      ok: false,
      error: `department ${department.id} is deferred; activation requires separate Owner approval`,
    };
  }

  const now = new Date().toISOString();
  const priorityInput = String(input.priority ?? "P2").toUpperCase();
  const priority: Job["priority"] =
    priorityInput === "P0" || priorityInput === "P1" || priorityInput === "P2" || priorityInput === "P3"
      ? priorityInput
      : "P2";

  const job: Job = {
    jobId: newId("job"),
    title,
    department: department.id,
    departmentName: department.name,
    division: department.divisions[0]?.name ?? "",
    jobRole: routing.role,
    assignee: { type: "unassigned", id: "" },
    clientId: String(input.clientId ?? ""),
    projectId: String(input.projectId ?? ""),
    description: String(input.description ?? "").trim(),
    inputFiles: [],
    expectedDeliverable: String(input.expectedDeliverable ?? "").trim(),
    requiredSkills: Array.isArray(input.requiredSkills)
      ? (input.requiredSkills as unknown[]).map(String)
      : [],
    tools: [...department.safeSkills],
    apiConnections: [],
    permissionScope: String(input.permissionScope ?? "internal:read-write:local"),
    priority,
    deadline: String(input.deadline ?? ""),
    budget: String(input.budget ?? ""),
    status: "NEW",
    approvals: [],
    qaCriteria: ["title present", "department routed", "audit trail written", "reload finds record"],
    completionEvidence: [],
    auditTrail: [
      typedAudit("job.created", title),
      typedAudit("job.routed", `${routing.basis} -> ${department.id} ${department.name}`),
    ],
    routing,
    createdAt: now,
    updatedAt: now,
  };

  const jobs = readJobs();
  jobs.unshift(job);
  const persisted = writeJobs(jobs);
  return { ok: true, job, persisted };
}

export function transitionJob(
  jobId: string,
  to: string,
): { ok: boolean; error?: string; job?: Job; persisted?: boolean } {
  const target = to.toUpperCase() as JobStatus;
  if (!JOB_STATUSES.includes(target)) return { ok: false, error: `unknown status: ${to}` };

  const jobs = readJobs();
  const index = jobs.findIndex((job) => job.jobId === jobId);
  if (index < 0) return { ok: false, error: `job not found: ${jobId}` };

  const current = jobs[index].status;
  if (!ALLOWED_TRANSITIONS[current].includes(target)) {
    return { ok: false, error: `transition ${current} -> ${target} is not allowed` };
  }

  const updated: Job = {
    ...jobs[index],
    status: target,
    updatedAt: new Date().toISOString(),
    auditTrail: [typedAudit("job.status", `${current} -> ${target}`), ...jobs[index].auditTrail],
  };
  jobs[index] = updated;
  const persisted = writeJobs(jobs);
  return { ok: true, job: updated, persisted };
}

export function jobsSummary() {
  const jobs = readJobs();
  const byStatus: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};
  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
    byDepartment[job.department] = (byDepartment[job.department] ?? 0) + 1;
  }
  return {
    total: jobs.length,
    byStatus,
    byDepartment,
    auditEntries: jobs.reduce((sum, job) => sum + job.auditTrail.length, 0),
    sha256: hash(jobs),
    storage: "data/gimms-jobs.json (local file, in-memory fallback)",
  };
}
