import { NextResponse } from "next/server";
import { skillsToolsRegistry } from "@/lib/skills-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Centralized Skills & Tools Registry — read-only, no external call. */
export async function GET() {
  return NextResponse.json(skillsToolsRegistry(), { headers: NO_STORE });
}
