import fs from "node:fs";
import path from "node:path";
import { seedState } from "@/lib/seed";
import {
  normalizeHubState,
  type HubItem,
  type HubState,
  type StorageDriver,
} from "@/lib/types";

/**
 * Server-only store. Three drivers, in order:
 *   postgres (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY present and reachable)
 *   file    (data/store.json — writable filesystem)
 *   memory  (read-only host; never throws, never 500s)
 *
 * Credentials stay server-side. Nothing here is imported by a client component.
 */

const TABLE = process.env.HUB_STATE_TABLE || "hub_state";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let memoryState: HubState | null = null;

function pgHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  };
}

async function pgRead(): Promise<HubState> {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.hub&select=db`;
  const response = await fetch(url, {
    method: "GET",
    headers: pgHeaders({ Accept: "application/json" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`postgres read failed: ${response.status}`);
  const rows = (await response.json()) as Array<{ db?: unknown }>;
  if (!Array.isArray(rows) || !rows[0] || !rows[0].db) {
    throw new Error("postgres read returned no hub row");
  }
  return normalizeHubState(rows[0].db);
}

async function pgWrite(state: HubState): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`;
  const response = await fetch(url, {
    method: "POST",
    headers: pgHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({ id: "hub", db: state }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`postgres write failed: ${response.status}`);
}

function fileRead(): HubState {
  const file = path.join(process.cwd(), "data", "store.json");
  return normalizeHubState(JSON.parse(fs.readFileSync(file, "utf8")));
}

function fileWrite(state: HubState): void {
  const file = path.join(process.cwd(), "data", "store.json");
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

export async function readState(): Promise<{
  state: HubState;
  storage: StorageDriver;
}> {
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      const state = await pgRead();
      return { state, storage: "postgres" };
    } catch (error) {
      console.warn("[store] postgres read unavailable:", (error as Error).message);
    }
  }

  try {
    return { state: fileRead(), storage: "file" };
  } catch {
    // read-only filesystem or missing file
  }

  if (!memoryState) memoryState = normalizeHubState(seedState);
  return { state: memoryState, storage: "memory" };
}

export async function writeState(
  mutate: (state: HubState) => void,
): Promise<{ state: HubState; storage: StorageDriver; persisted: boolean }> {
  const { state, storage } = await readState();
  mutate(state);

  try {
    if (storage === "postgres") {
      await pgWrite(state);
      return { state, storage, persisted: true };
    }
    if (storage === "file") {
      fileWrite(state);
      return { state, storage, persisted: true };
    }
  } catch (error) {
    console.warn("[store] write failed:", (error as Error).message);
  }

  // Read-only host: keep the change in warm memory, never surface a 500.
  memoryState = state;
  return { state, storage, persisted: false };
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function auditEntry(action: string, detail: string): HubItem {
  return { at: new Date().toISOString(), action, detail };
}
