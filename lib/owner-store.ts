/**
 * GIMMS — DURABLE OWNER RECORD STORE (open item #1, "the blocker").
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * `lib/owner-auth.ts` historically kept the Owner record in `data/gimms-owner.json`.
 * That works locally. On Vercel the project filesystem is read-only and `/tmp` is
 * per-instance, so the write silently failed and the Owner gate forgot who the Owner was
 * on the very next request (measured: register → 201 `persisted:false` → next request 401).
 *
 * This module adds a Supabase-backed row behind the SAME seam. Nothing about identity
 * changes: `owner-auth.ts` still owns the scrypt hash, the salts, the SHA-256 session
 * token hashes, the 8h TTL and the cookie. This file only moves bytes.
 *
 * DRIVER SELECTION — no new dependencies, no fail-open
 * ---------------------------------------------------
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY present  →  "supabase"
 *   otherwise                                        →  "file" (unchanged local behaviour)
 *
 * On the "supabase" driver a failed READ returns an empty record, i.e. "not registered",
 * which makes the gate answer 401. It deliberately does NOT fall back to the JSON file:
 * silently switching identity stores when the network hiccups would be worse than a 401.
 *
 * STORED PAYLOAD: the same JSON `OwnerFile` shape the file store used — scrypt hash and
 * salt, plus SHA-256 session hashes. No plaintext password, no session token, ever.
 *
 * TABLE (create it with the SQL in docs/LIVE-TEST-CHECKLIST.md §2a):
 *   gimms_owner_state(id text primary key, db jsonb not null, updated_at timestamptz)
 * RLS enabled with no policies, so only the service-role key can touch it.
 *
 * Server-only. Node runtime.
 */

import { hasVar, optionalVar } from "@/lib/env";

export type OwnerStoreDriver = "supabase" | "file";

const ROW_ID = "owner";
const DEFAULT_TABLE = "gimms_owner_state";
const TIMEOUT_MS = 5000;

/** Table name comes from an env var, so constrain it to a safe identifier. */
function ownerStateTable(): string {
  const raw = optionalVar("OWNER_STATE_TABLE", DEFAULT_TABLE).trim();
  return /^[a-zA-Z0-9_]{1,64}$/.test(raw) ? raw : DEFAULT_TABLE;
}

export function ownerStoreDriver(): OwnerStoreDriver {
  return hasVar("SUPABASE_URL") && hasVar("SUPABASE_SERVICE_ROLE_KEY") ? "supabase" : "file";
}

function baseUrl(): string {
  return (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...extra };
}

export type OwnerRecordRead = { record: unknown | null; driver: OwnerStoreDriver; error?: string };
export type OwnerRecordWrite = { persisted: boolean; driver: OwnerStoreDriver; error?: string };

/**
 * Read the single Owner row. Returns `record: null` when the row does not exist yet —
 * which is the correct state for a fresh deployment (nobody has registered).
 */
export async function readOwnerRecord(): Promise<OwnerRecordRead> {
  if (ownerStoreDriver() !== "supabase") return { record: null, driver: "file" };

  try {
    const url = `${baseUrl()}/rest/v1/${ownerStateTable()}?id=eq.${ROW_ID}&select=db`;
    const response = await fetch(url, {
      headers: authHeaders({ Accept: "application/json" }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { record: null, driver: "supabase", error: `owner record read failed: HTTP ${response.status}` };
    }
    const rows = (await response.json()) as Array<{ db?: unknown }>;
    const db = Array.isArray(rows) ? rows[0]?.db : undefined;
    return { record: db ?? null, driver: "supabase" };
  } catch (cause) {
    return { record: null, driver: "supabase", error: `owner record read failed: ${cause instanceof Error ? cause.name : "network error"}` };
  }
}

/** Upsert the single Owner row. Returns whether the write actually landed. */
export async function writeOwnerRecord(record: unknown): Promise<OwnerRecordWrite> {
  if (ownerStoreDriver() !== "supabase") {
    return { persisted: false, driver: "file", error: "file driver selected" };
  }

  try {
    const url = `${baseUrl()}/rest/v1/${ownerStateTable()}?on_conflict=id`;
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: ROW_ID, db: record }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { persisted: false, driver: "supabase", error: `owner record write failed: HTTP ${response.status}` };
    }
    return { persisted: true, driver: "supabase" };
  } catch (cause) {
    return { persisted: false, driver: "supabase", error: `owner record write failed: ${cause instanceof Error ? cause.name : "network error"}` };
  }
}

export const OWNER_STORE_INFO = {
  table: DEFAULT_TABLE,
  rowId: ROW_ID,
  drivers: ["supabase", "file"] as const,
  note: "Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise the local JSON file.",
} as const;
