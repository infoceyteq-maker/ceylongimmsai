import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import { readState, writeState, newId, auditEntry } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const { state, storage } = await readState();
  return NextResponse.json(
    { ok: true, storage, tasks: state.tasks },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const auth = requireOwnerWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
  }

  const { state, storage, persisted } = await writeState((draft) => {
    const now = new Date().toISOString();
    draft.tasks.unshift({
      id: newId("tk"),
      title,
      description: String(body.description ?? "").trim(),
      status: "Draft",
      department: String(body.department ?? "Unassigned"),
      clientId: String(body.clientId ?? ""),
      due: String(body.due ?? ""),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: process.env.OWNER_EMAIL || "info.ceyteq@gmail.com",
    });
    draft.audit.unshift(auditEntry("task.created", title));
  });

  return NextResponse.json(
    { ok: true, ...authTag(auth), storage, persisted, task: state.tasks[0], count: state.tasks.length },
    { status: 201, headers: NO_STORE },
  );
}
