import { NextResponse } from "next/server";
import { readState } from "@/lib/store";
import { connectedCount } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Read-only. No channel is ever marked connected without a real credential. */
export async function GET() {
  const { state, storage } = await readState();
  return NextResponse.json(
    {
      ok: true,
      storage,
      channels: state.channels,
      connected: connectedCount(state),
      note: "No API keys configured. Connections stay at 0 until a real credential exists.",
      googleFlowVeo: "No public API — not connected.",
    },
    { headers: NO_STORE },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "A real API key must exist before a channel can be marked connected. Nothing was connected.",
    },
    { status: 403, headers: NO_STORE },
  );
}
