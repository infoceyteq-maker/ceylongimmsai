import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import {
  AI_TEAM,
  AI_MODEL_REGISTRY,
  FUTURE_MODEL_FAMILIES,
  AI_AGENT_ROLES,
  REQUIRED_DEVELOPMENT_SKILLS,
  EXISTING_REUSABLE_SKILLS,
  CONNECTION_FRAMEWORK,
  CONNECTION_SLOTS,
  COMMUNICATION_WORKFLOW,
  teamSummary,
  validateRoleSkillReferences,
  connectionReadiness,
} from "@/lib/prod-ai-team";
import { routeAiRequest, routingSummary, ROUTING_RULES } from "@/lib/prod-ai-routing";
import { buildCommunicationPlan, communicationSummary } from "@/lib/prod-ai-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * GIMMS P2-02 — Production AI Development Team, INITIAL SETUP ONLY.
 *
 * READ-ONLY / PLAN-ONLY. No model call, no external API call, no credential,
 * no purchase, no deploy, no state write, no software development project.
 * This endpoint does NOT modify any existing registry, skill, job or page.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: "P2-02-production-ai-team-structure-only",
      scope: [
        "AI Team Structure",
        "AI Model Registry",
        "AI Agent Roles",
        "Required Development Skills",
        "Model Selection & Routing",
        "API / Plugin Connection Framework",
        "Team Communication Workflow",
      ],
      honesty: {
        status: "CONFIGURED LOCALLY — NOT CONNECTED, NOT LIVE, NOT EXECUTABLE",
        aiModelsConnected: 0,
        authenticatedConnectionTests: 0,
        aiSdksInstalled: 0,
        pluginsRegistered: 0,
        mcpServers: 0,
        functionCallingProviders: 0,
        credentialsConfigured: 0,
        credentialsRequested: 0,
        secretValuesShown: 0,
        externalApiCalls: 0,
        modelCalls: 0,
        softwareProjectsStarted: 0,
        productsGenerated: 0,
        deploymentPerformed: false,
        publishing: "MANUAL",
        providerFactsVerified: false,
        note: "Exact model IDs, API availability, SDK, auth method, streaming, tool calling, multimodal support, pricing and quotas are UNVERIFIED. Nothing was invented. ChatGPT / OpenAI GPT and Google AI Studio / Gemini are role/registry entries ONLY — NOT connected.",
      },
      team: AI_TEAM,
      modelRegistry: AI_MODEL_REGISTRY,
      futureModelFamilies: FUTURE_MODEL_FAMILIES,
      agentRoles: AI_AGENT_ROLES,
      requiredDevelopmentSkills: REQUIRED_DEVELOPMENT_SKILLS,
      existingReusableSkills: EXISTING_REUSABLE_SKILLS,
      connectionFramework: CONNECTION_FRAMEWORK,
      connectionSlots: CONNECTION_SLOTS,
      communicationWorkflow: COMMUNICATION_WORKFLOW,
      routingRules: ROUTING_RULES,
      summary: teamSummary(),
      routingSummary: routingSummary(),
      communicationSummary: communicationSummary(),
      roleReferenceValidation: validateRoleSkillReferences(),
      readiness: connectionReadiness(),
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

  if (action === "connect") {
    return NextResponse.json(
      {
        ok: false,
        error: "REFUSED: connecting an AI model requires separate Owner approval, a server-side credential, an implemented adapter and an authenticated test.",
        connected: false,
        credentialsRequested: 0,
        note: "Nothing was connected. No credential was requested or read. `connected:true` is permitted only after an authenticated test with raw evidence.",
      },
      { status: 403, headers: NO_STORE },
    );
  }

  if (action === "route") {
    const result = routeAiRequest(body as Record<string, unknown>);
    return NextResponse.json({ ...result, ...authTag(auth) }, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }

  if (action === "communication-plan") {
    const result = buildCommunicationPlan(body as Record<string, unknown>);
    return NextResponse.json({ ...result, ...authTag(auth) }, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }

  if (action === "readiness") {
    return NextResponse.json(connectionReadiness(String(body.modelId ?? "").trim() || undefined), { headers: NO_STORE });
  }

  return NextResponse.json(
    {
      ok: false,
      error: `unknown action: ${action || "(empty)"}`,
      availableActions: ["route (plan only)", "communication-plan (plan only)", "readiness (read only)", "connect (refused by design)"],
    },
    { status: 400, headers: NO_STORE },
  );
}
