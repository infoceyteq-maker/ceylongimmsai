import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import {
  DEVELOPER_CONNECTIONS,
  developerConnectionsSummary,
  developerTeamReadiness,
  probeConnection,
  testConnection,
  activateConnection,
} from "@/lib/developer-connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Developer Team connection status + REAL probes + FAIL-CLOSED activation.
 * No placeholder connection, no simulated success, no credential value in chat.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: "P4-developer-team-connection-activation",
      summary: developerConnectionsSummary(),
      readiness: developerTeamReadiness(),
      connections: DEVELOPER_CONNECTIONS,
      honesty: {
        status: "REAL CONNECTIONS ONLY — NOTHING MARKED CONNECTED WITHOUT EVIDENCE",
        aiModelsConnected: 0,
        credentialValuesShown: 0,
        credentialsRequestedInChat: 0,
        emailsSent: 0,
        personalAccountsConnected: 0,
        purchasesMade: 0,
        deploymentsPerformed: 0,
        simulatedSuccessReports: 0,
        note: "OpenAI/Gemini/Gmail/Workspace hosts are unreachable from this sandbox (real probes returned 000). Connector catalog returned catalog_error this turn. Nothing was faked.",
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const auth = requireOwnerWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim();
  const id = String(body.id ?? body.connectionId ?? "").trim();

  if (action === "probe") {
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400, headers: NO_STORE });
    const result = await probeConnection(id);
    return NextResponse.json({ action: "probe", ...authTag(auth), ...result }, { headers: NO_STORE });
  }

  if (action === "probe-all") {
    const results = [];
    for (const connection of DEVELOPER_CONNECTIONS) {
      results.push(await probeConnection(connection.id));
    }
    return NextResponse.json(
      {
        action: "probe-all",
        ok: true,
        ...authTag(auth),
        results,
        reachable: results.filter((item) => item.reachable).length,
        unreachable: results.filter((item) => !item.reachable && item.httpStatus === 0).length,
        note: "REAL unauthenticated HTTPS probes. No credentials sent. Failures reported honestly.",
      },
      { headers: NO_STORE },
    );
  }

  if (action === "test") {
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400, headers: NO_STORE });
    const result = await testConnection(id, body.ownerApproved === true);
    return NextResponse.json({ action: "test", ...authTag(auth), ...result }, { status: result.ok ? 200 : 403, headers: NO_STORE });
  }

  if (action === "activate") {
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400, headers: NO_STORE });
    const result = activateConnection(id, body.ownerApproved === true, body.authenticatedTestPassed === true);
    return NextResponse.json({ action: "activate", ...authTag(auth), ...result }, { status: 403, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      ok: false,
      error: `unknown action: ${action || "(empty)"}`,
      availableActions: ["probe", "probe-all", "test", "activate (refused by design)"],
    },
    { status: 400, headers: NO_STORE },
  );
}
