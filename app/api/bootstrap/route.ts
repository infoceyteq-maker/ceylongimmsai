import { NextResponse } from "next/server";
import { readState } from "@/lib/store";
import { connectedCount } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { state, storage } = await readState();
  return NextResponse.json(
    {
      ok: true,
      provider: "demo",
      storage,
      brand: "AI GIMMS",
      tagline: "Empowering Digital Evolution",
      owner: process.env.OWNER_EMAIL || "info.ceyteq@gmail.com",
      publishing: "MANUAL",
      counts: {
        tasks: state.tasks.length,
        agents: state.agents.length,
        clients: state.clients.length,
      },
      connected: connectedCount(state),
      state,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
