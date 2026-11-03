import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import { SKILLS, runSkill, skillsSummary } from "@/lib/skills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Phase 0 — Safe Internal Skills catalogue + execution.
 * Every skill is deterministic local code with real evidence. None is an AI model call,
 * none is a connected external integration. External skills are refused explicitly.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: "P0-credential-free",
      note: "Deterministic local routines only. No LLM, image, video, voice, telephony, ads or payment call.",
      summary: skillsSummary(),
      skills: SKILLS,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const auth = await requireOwnerWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const skillId = String(body.skillId ?? "").trim();
  if (!skillId) {
    return NextResponse.json(
      { ok: false, error: "skillId is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = runSkill(skillId, (body.payload ?? {}) as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json({ ...result, ...authTag(auth) }, { headers: NO_STORE });
}
