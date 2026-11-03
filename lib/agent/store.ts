/**
 * GIMMS AUTO-PILOT — JOB STORE.
 *
 * Storage order (same philosophy as lib/store.ts):
 *   1. Supabase table `gimms_agent_jobs`  — durable, survives serverless cold starts
 *   2. Local JSON file `data/gimms-agent-jobs.json` — dev / Codespaces
 *   3. In-memory — last resort, clearly reported as non-durable
 *
 * WHY THE ORDER MATTERS: a browser job is long-running (minutes) and is dispatched
 * from one Vercel instance while its callback lands on a *different* one. If the job
 * record lived in process memory, or in a file on an ephemeral serverless disk, the
 * callback would find nothing and every run would look like a lost job. So on Vercel
 * this store REFUSES to claim durability and says so in the API response.
 *
 * The SQL to create the tables is in supabase/agent-schema.sql and is applied once
 * from the Supabase SQL editor (no local CLI needed). Until it is applied the store
 * falls back to file/memory and the console shows `durable: false`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { supabaseConfig, isVercel } from "@/lib/env";
import type { AgentEvidence, AgentJob, AgentJobStatus, AgentRunResult } from "@/lib/agent/types";

const TABLE = () => process.env.AGENT_JOBS_TABLE || "gimms_agent_jobs";
const FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "gimms-agent-jobs.json");
const MAX_JOBS = 400;

export type StorageMode = "supabase" | "file" | "memory";

let memoryJobs: AgentJob[] = [];

function restUrl(query = ""): string {
  const { url } = supabaseConfig();
  return `${url}/rest/v1/${TABLE()}${query}`;
}

function restHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const { serviceRoleKey } = supabaseConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function supabaseConfigured(): boolean {
  const { url, serviceRoleKey } = supabaseConfig();
  return Boolean(url && serviceRoleKey);
}

/** The wire shape stored in Postgres. `job` is jsonb. */
type Row = { id: string; updated_at: string; status: string; job: AgentJob };

function readFile(): AgentJob[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as unknown;
    if (Array.isArray(parsed)) return parsed as AgentJob[];
  } catch {
    /* first run */
  }
  return [];
}

function writeFile(jobs: AgentJob[]): boolean {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const temporary = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(jobs.slice(0, MAX_JOBS), null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, FILE);
    return true;
  } catch {
    return false;
  }
}

export function newJobId(): string {
  return `ag_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
}

export async function storageMode(): Promise<StorageMode> {
  if (supabaseConfigured()) {
    try {
      const response = await fetch(restUrl("?select=id&limit=1"), {
        headers: restHeaders({ Accept: "application/json" }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) return "supabase";
      // 404/400 usually means the table has not been created yet.
      if (response.status === 404 || response.status === 400) return isVercel ? "memory" : "file";
    } catch {
      /* fall through */
    }
  }
  return isVercel ? "memory" : "file";
}

export async function listJobs(limit = 60): Promise<{ jobs: AgentJob[]; mode: StorageMode; durable: boolean }> {
  const mode = await storageMode();

  if (mode === "supabase") {
    try {
      const response = await fetch(restUrl("?select=job,updated_at&order=updated_at.desc&limit=" + limit), {
        headers: restHeaders({ Accept: "application/json" }),
        cache: "no-store",
      });
      if (response.ok) {
        const rows = (await response.json()) as Row[];
        return { jobs: rows.map((row) => row.job), mode, durable: true };
      }
    } catch {
      /* fall through */
    }
  }

  if (mode === "file") {
    return { jobs: readFile().slice(0, limit), mode, durable: true };
  }

  return { jobs: memoryJobs.slice(0, limit), mode, durable: false };
}

export async function getJob(jobId: string): Promise<{ job: AgentJob | null; mode: StorageMode }> {
  const mode = await storageMode();

  if (mode === "supabase") {
    try {
      const response = await fetch(restUrl(`?select=job&id=eq.${encodeURIComponent(jobId)}&limit=1`), {
        headers: restHeaders({ Accept: "application/json" }),
        cache: "no-store",
      });
      if (response.ok) {
        const rows = (await response.json()) as Row[];
        return { job: rows[0]?.job ?? null, mode };
      }
    } catch {
      /* fall through */
    }
  }

  if (mode === "file") return { job: readFile().find((job) => job.id === jobId) ?? null, mode };
  return { job: memoryJobs.find((job) => job.id === jobId) ?? null, mode };
}

export async function putJob(job: AgentJob): Promise<{ persisted: boolean; mode: StorageMode }> {
  const mode = await storageMode();
  const stamped: AgentJob = { ...job, updatedAt: new Date().toISOString() };

  if (mode === "supabase") {
    try {
      const response = await fetch(restUrl("?on_conflict=id"), {
        method: "POST",
        headers: restHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify([{ id: stamped.id, updated_at: stamped.updatedAt, status: stamped.status, job: stamped }]),
        cache: "no-store",
      });
      if (response.ok) return { persisted: true, mode };
    } catch {
      /* fall through */
    }
  }

  if (mode === "file") {
    const jobs = readFile().filter((entry) => entry.id !== stamped.id);
    jobs.unshift(stamped);
    return { persisted: writeFile(jobs), mode };
  }

  memoryJobs = [stamped, ...memoryJobs.filter((entry) => entry.id !== stamped.id)].slice(0, MAX_JOBS);
  return { persisted: false, mode };
}

export async function patchJob(
  jobId: string,
  mutate: (job: AgentJob) => void,
): Promise<{ ok: boolean; job: AgentJob | null; mode: StorageMode }> {
  const { job, mode } = await getJob(jobId);
  if (!job) return { ok: false, job: null, mode };
  mutate(job);
  job.updatedAt = new Date().toISOString();
  const { persisted } = await putJob(job);
  return { ok: persisted || mode === "memory", job, mode };
}

/** Append a single evidence line without rewriting the whole log twice. */
export function evidence(level: AgentEvidence["level"], message: string, data?: Record<string, unknown>): AgentEvidence {
  return { at: new Date().toISOString(), level, message, ...(data ? { data } : {}) };
}

export const ALLOWED_TRANSITIONS: Record<AgentJobStatus, AgentJobStatus[]> = {
  QUEUED: ["AWAITING_APPROVAL", "DISPATCHED", "BLOCKED_BY_POLICY", "CANCELLED"],
  AWAITING_APPROVAL: ["DISPATCHED", "CANCELLED", "BLOCKED_BY_POLICY"],
  DISPATCHED: ["RUNNING", "FAILED", "COMPLETED", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["DISPATCHED"], // one retry is allowed, bounded by maxAttempts
  CANCELLED: [],
  BLOCKED_BY_POLICY: [],
};

export function canTransition(from: AgentJobStatus, to: AgentJobStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Trim a worker result so a malicious/buggy callback cannot balloon the row. */
export function sanitiseResult(raw: unknown): AgentRunResult {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<AgentRunResult>;
  return {
    ok: source.ok === true,
    finishedAt: typeof source.finishedAt === "string" ? source.finishedAt : new Date().toISOString(),
    durationMs: typeof source.durationMs === "number" ? Math.min(Math.max(source.durationMs, 0), 60 * 60 * 1000) : 0,
    finalUrl: typeof source.finalUrl === "string" ? source.finalUrl.slice(0, 2000) : "",
    title: typeof source.title === "string" ? source.title.slice(0, 300) : "",
    extracted: trimRecord(source.extracted),
    screenshots: Array.isArray(source.screenshots)
      ? source.screenshots.slice(0, 12).map((shot) => ({
          name: typeof shot?.name === "string" ? shot.name.slice(0, 120) : "screenshot",
          url: typeof shot?.url === "string" ? shot.url.slice(0, 2000) : undefined,
          bytes: typeof shot?.bytes === "number" ? shot.bytes : undefined,
        }))
      : [],
    log: Array.isArray(source.log)
      ? source.log.slice(-200).map((line) => ({
          at: typeof line?.at === "string" ? line.at : new Date().toISOString(),
          level: ["info", "progress", "warn", "error", "result"].includes(line?.level as string)
            ? (line.level as AgentEvidence["level"])
            : "info",
          message: typeof line?.message === "string" ? line.message.slice(0, 2000) : "",
          data: trimRecord(line?.data),
        }))
      : [],
    error: typeof source.error === "string" ? source.error.slice(0, 2000) : undefined,
  };
}

function trimRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 40) break;
    const safeKey = key.slice(0, 80);
    if (typeof value === "string") out[safeKey] = value.slice(0, 4000);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[safeKey] = value;
    else if (Array.isArray(value)) out[safeKey] = value.slice(0, 40).map((item) => (typeof item === "string" ? item.slice(0, 500) : typeof item === "number" ? item : null));
    count += 1;
  }
  return out;
}
