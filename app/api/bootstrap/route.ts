import { NextResponse } from "next/server";
import { readState } from "@/lib/store";
import { connectedCount, type HubState } from "@/lib/types";
import { verifySession, sessionFromRequest } from "@/lib/owner-auth";
import { OWNER_EMAIL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bootstrap payload for the hub UI.
 *
 * HARDENING (this patchset): the live `hub_state` row used to be returned in full to
 * any anonymous visitor, including `clients` and `audit`. That is the Owner's
 * business data on a public URL. Anonymous callers now receive only the sections the
 * public dashboard renders; `clients` and `audit` are OMITTED and listed in
 * `redacted` so the UI can say so instead of silently showing an empty list.
 *
 * The seed/shape is still normalised by lib/types.ts, so a malformed jsonb row can
 * never break the response.
 */

const PUBLIC_KEYS = [
  "tasks",
  "agents",
  "channels",
  "publishes",
  "outputs",
  "research",
  "audience",
  "calls",
  "conversations",
] as const;

function publicState(state: HubState): { state: Partial<HubState>; redacted: string[] } {
  const view: Partial<HubState> = {};
  for (const key of PUBLIC_KEYS) view[key] = state[key];
  return { state: view, redacted: ["clients", "audit"] };
}

export async function GET(request: Request) {
  const { state, storage } = await readState();
  const isOwner = Boolean(verifySession(sessionFromRequest(request)));
  const { state: view, redacted } = isOwner ? { state, redacted: [] as string[] } : publicState(state);

  return NextResponse.json(
    {
      ok: true,
      provider: "demo",
      storage,
      brand: "AI GIMMS",
      tagline: "Empowering Digital Evolution",
      owner: OWNER_EMAIL(),
      publishing: "MANUAL",
      counts: {
        tasks: state.tasks.length,
        agents: state.agents.length,
        clients: state.clients.length,
      },
      connected: connectedCount(state),
      authenticated: isOwner,
      redacted,
      state: view,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
