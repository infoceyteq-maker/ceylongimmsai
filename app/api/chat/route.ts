import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner-auth";
import { executeOwnerCommand, reviewOwnerCommand, chatOverview } from "@/lib/chat-engine";
import { chatSnapshot } from "@/lib/chat-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * REAL Owner Chat API. Every write requires an authenticated Owner session.
 * Commands create REAL jobs, run REAL local checks/tests, emit REAL events and
 * await a REAL Owner review. 0 AI models connected — no simulated success.
 */
export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  return NextResponse.json(chatOverview(auth.profile), { headers: NO_STORE });
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "command").trim();

  if (action === "command") {
    const result = executeOwnerCommand({ text: body.text, owner: auth.profile });
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }

  if (action === "review") {
    const result = reviewOwnerCommand({ jobId: body.jobId, decision: body.decision, owner: auth.profile });
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }

  if (action === "history") {
    return NextResponse.json(chatSnapshot(200), { headers: NO_STORE });
  }

  return NextResponse.json(
    { ok: false, error: `unknown action: ${action}`, availableActions: ["command", "review", "history"] },
    { status: 400, headers: NO_STORE },
  );
}
