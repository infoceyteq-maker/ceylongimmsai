import { NextResponse } from "next/server";
import {
  summary as dept01Summary,
  allRecords,
  listArtifacts,
  listApprovals,
  listWorkflows,
  listCommands,
  decideApproval,
} from "@/lib/dept01-store";
import { DEPT01_AGENTS, OWNER_ACCOUNT_PROPOSAL, agentsSummary } from "@/lib/dept01-agents";
import { DEPT01_SKILL_SPECS, DEPT01_MODULES, DEPT01_SKILL_IDS } from "@/lib/dept01-catalog";
import { runSkill } from "@/lib/skills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * GIMMS P1-01 — Dept 01 LOCAL control API.
 *
 * NOT a new execution engine: `command` and `skill` actions go through the
 * EXISTING single skills gateway (lib/skills.ts / POST /api/skills).
 * Nothing here calls an external service, moves money or changes production.
 */
export async function GET() {
  const integration = runSkill("integration.request.list", {});
  return NextResponse.json(
    {
      ok: true,
      phase: "P1-01-local-credential-free",
      department: "01 — HR, Finance & Administration",
      honesty: {
        status: "LOCAL IMPLEMENTATION — NOT LIVE, NOT 100% COMPLETE",
        connectedServices: 0,
        testedAuthenticatedConnections: 0,
        aiModelsConnected: 0,
        mcpServers: 0,
        plugins: 0,
        moneyMovement: false,
        paymentExecution: "BLOCKED",
        payrollExecution: "BLOCKED",
        deploymentPerformed: false,
        publishing: "MANUAL",
        realOwnerDetailsStored: false,
        secureLoginImplemented: false,
        note: "Native compatible files are generated locally. Microsoft Office, Google Workspace, Outlook, Gmail, Drive, payment, accounting, e-signature and auth providers are NOT CONNECTED.",
      },
      summary: dept01Summary(),
      modules: DEPT01_MODULES,
      skillCount: DEPT01_SKILL_SPECS.length,
      agentSummary: agentsSummary(),
      agents: DEPT01_AGENTS,
      ownerAccountProposal: OWNER_ACCOUNT_PROPOSAL,
      records: allRecords().slice(0, 80),
      artifacts: listArtifacts().slice(0, 80),
      approvals: listApprovals().slice(0, 50),
      workflows: listWorkflows().slice(0, 20),
      commands: listCommands().slice(0, 20),
      integrationRequests: integration.evidence,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim();

  if (action === "payment.execute") {
    return NextResponse.json(
      {
        ok: false,
        error: "REFUSED: payment execution is not implemented and not authorised.",
        moneyMovement: false,
        reason: "All financial transactions require appropriate Owner authorisation, credentials and an authenticated test. No payment gateway is connected.",
      },
      { status: 403, headers: NO_STORE },
    );
  }

  if (action === "approve") {
    const approvalId = String(body.approvalId ?? "").trim();
    const approver = String(body.approver ?? "").trim();
    const decision = String(body.decision ?? "").trim();
    const artifactVersion = String(body.artifactVersion ?? "").trim();
    if (!approvalId || !approver || !artifactVersion || !["APPROVED_RECORD_ONLY", "REJECTED"].includes(decision)) {
      return NextResponse.json(
        { ok: false, error: "approvalId, approver, artifactVersion and a valid decision are required" },
        { status: 400, headers: NO_STORE },
      );
    }
    const result = decideApproval({
      approvalId,
      approver,
      decision: decision as "APPROVED_RECORD_ONLY" | "REJECTED",
      artifactVersion,
    });
    return NextResponse.json(
      { ...result, note: "Record-only decision. No payment, no deploy, no permission change." },
      { status: result.ok ? 200 : 400, headers: NO_STORE },
    );
  }

  if (action === "skill") {
    const skillId = String(body.skillId ?? "").trim();
    if (!skillId) return NextResponse.json({ ok: false, error: "skillId is required" }, { status: 400, headers: NO_STORE });
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const result = runSkill(skillId, payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }

  if (action === "command") {
    const command = String(body.command ?? "").trim();
    if (!command) return NextResponse.json({ ok: false, error: "command is required" }, { status: 400, headers: NO_STORE });
    const payload = { ...((body.payload ?? {}) as Record<string, unknown>), command };
    const result = runSkill("owner.command.execute", payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      ok: false,
      error: `unknown action: ${action || "(empty)"}`,
      availableActions: ["command", "skill", "approve", "payment.execute (refused by design)"],
      skillCount: DEPT01_SKILL_IDS.size,
    },
    { status: 400, headers: NO_STORE },
  );
}
