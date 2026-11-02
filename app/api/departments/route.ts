import { NextResponse } from "next/server";
import { DEPARTMENTS, P0_IDS, DEFERRED_IDS, registrySummary } from "@/lib/departments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Phase 0 — read-only department registry.
 * Ten departments are defined; only the seven Phase-1 priorities are active.
 * This endpoint does NOT claim any department is functional or any API connected.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: "P0-credential-free",
      summary: registrySummary(),
      priorityOrder: P0_IDS,
      deferredIds: DEFERRED_IDS,
      departments: DEPARTMENTS.map((department) => ({
        id: department.id,
        name: department.name,
        mission: department.mission,
        priority: department.priority,
        status: department.status,
        divisions: department.divisions.length,
        roles: department.divisions.reduce((n, division) => n + division.roles.length, 0),
        owns: department.owns,
        mustNot: department.mustNot,
        safeSkills: department.safeSkills,
        externalNeeds: department.externalNeeds,
        externalNeedsConnected: 0,
      })),
    },
    { headers: NO_STORE },
  );
}
