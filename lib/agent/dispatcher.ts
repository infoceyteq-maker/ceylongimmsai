/**
 * GIMMS AUTO-PILOT — DISPATCHER.
 *
 * Sends an approved plan to the external browser worker and issues a single-use,
 * short-lived lease for the callback. This module is the ONLY code path that talks
 * to the worker, so the trust boundary has exactly one door.
 *
 * ENVIRONMENT
 *   AGENT_WORKER_URL     e.g. https://gimms-agent.fly.dev   (no trailing slash)
 *   AGENT_WORKER_SECRET  shared HMAC/bearer secret, server-side only
 *   GIMMS_PUBLIC_URL     the public base URL of this app (for the callback URL)
 *
 * FAIL-SAFE BEHAVIOUR
 *   If the worker is not configured the job is NOT dispatched and is NOT marked
 *   running. It returns `configured: false` with the exact missing variable name, so
 *   the console can tell the Owner the truth instead of pretending to work.
 */

import crypto from "node:crypto";
import { hasVar, optionalVar } from "@/lib/env";
import { WORKER_LIMITS } from "@/lib/agent/policy";
import type { AgentJob, WorkerDispatchPayload } from "@/lib/agent/types";

export type DispatchOutcome =
  | { ok: true; workerId: string; lease: string; leaseExpiresAt: string; httpStatus: number }
  | { ok: false; configured: boolean; error: string; missing?: string };

function publicBaseUrl(): string {
  return optionalVar("GIMMS_PUBLIC_URL", "https://ai-gimms-hub.vercel.app").replace(/\/$/, "");
}

/**
 * A lease is a per-job, unguessable token. It is NOT the worker master secret, so a
 * leaked job record cannot be replayed to fire callbacks for other jobs. The callback
 * handler compares its SHA-256 against the value stored on the job.
 */
export function issueLease(): { lease: string; leaseHash: string; leaseExpiresAt: string } {
  const lease = crypto.randomBytes(32).toString("hex");
  return {
    lease,
    leaseHash: crypto.createHash("sha256").update(lease).digest("hex"),
    leaseExpiresAt: new Date(Date.now() + WORKER_LIMITS.leaseMs).toISOString(),
  };
}

export function leaseMatches(lease: string | null | undefined, leaseHash: string | undefined): boolean {
  if (!lease || !leaseHash) return false;
  const digest = crypto.createHash("sha256").update(lease).digest("hex");
  const left = Buffer.from(digest, "hex");
  const right = Buffer.from(leaseHash, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function workerConfigured(): boolean {
  return hasVar("AGENT_WORKER_URL") && hasVar("AGENT_WORKER_SECRET");
}

export async function dispatchToWorker(
  job: AgentJob,
  lease: string,
  leaseExpiresAt: string,
): Promise<DispatchOutcome> {
  if (!hasVar("AGENT_WORKER_URL")) {
    return {
      ok: false,
      configured: false,
      missing: "AGENT_WORKER_URL",
      error: "No browser worker is configured. Set AGENT_WORKER_URL to the worker's public URL (see PHASE2-AGENT-ARCHITECTURE.md §3).",
    };
  }
  if (!hasVar("AGENT_WORKER_SECRET")) {
    return {
      ok: false,
      configured: false,
      missing: "AGENT_WORKER_SECRET",
      error: "AGENT_WORKER_SECRET is not set. The dispatcher will not call the worker without a shared secret.",
    };
  }

  const workerUrl = optionalVar("AGENT_WORKER_URL", "").replace(/\/$/, "");
  const secret = process.env.AGENT_WORKER_SECRET || "";

  const payload: WorkerDispatchPayload = {
    jobId: job.id,
    kind: job.kind,
    startUrl: job.startUrl,
    steps: job.steps,
    limits: {
      maxDurationMs: WORKER_LIMITS.maxDurationMs,
      maxSteps: WORKER_LIMITS.maxSteps,
      maxScreenshots: WORKER_LIMITS.maxScreenshots,
    },
    callback: {
      url: `${publicBaseUrl()}/api/agent/callback`,
      token: lease,
    },
    lease,
    leaseExpiresAt,
  };

  try {
    const response = await fetch(`${workerUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    let parsed: { workerId?: string; accepted?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      /* worker returned non-JSON */
    }

    if (!response.ok || parsed.accepted === false) {
      return {
        ok: false,
        configured: true,
        error: parsed.error || `worker returned HTTP ${response.status}: ${text.slice(0, 300)}`,
      };
    }

    return {
      ok: true,
      workerId: parsed.workerId || `${job.id}-worker`,
      lease,
      leaseExpiresAt,
      httpStatus: response.status,
    };
  } catch (cause) {
    return {
      ok: false,
      configured: true,
      error: `Worker unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}
