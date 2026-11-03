/**
 * GIMMS P2-02 — TEAM COMMUNICATION WORKFLOW (LOCAL DRAFT ENVELOPES ONLY).
 *
 * Produces structured, hash-verifiable communication envelopes that follow the
 * existing universal job model fields (Master Doc §3). NOTHING is delivered:
 * no chat service, no Slack, no email, no Gmail, no Google Chat, no Teams,
 * no webhook, no model call, no job created, no state written.
 *
 * Reuses `hash` (lib/jobs.ts) for evidence and `routeAiRequest` (this feature)
 * for the routing stage. No duplicate message bus.
 */

import { hash } from "@/lib/jobs";
import { COMMUNICATION_WORKFLOW, AI_TEAM, connectionReadiness } from "@/lib/prod-ai-team";
import { routeAiRequest, type RouteInput } from "@/lib/prod-ai-routing";

export type CommunicationEnvelope = {
  envelopeId: string;
  sequence: number;
  stage: string;
  from: string;
  to: string;
  kind: string;
  payloadRef: string;
  approvalRequired: boolean;
  evidenceHash: string;
  status: "DRAFT";
  delivery: "LOCAL_ONLY_NOT_SENT";
  executable: false;
};

export type CommunicationPlan = {
  ok: boolean;
  planOnly: true;
  executable: false;
  workflowId: string;
  teamId: string;
  department: string;
  routing: ReturnType<typeof routeAiRequest>;
  envelopes: CommunicationEnvelope[];
  envelopeCount: number;
  approvalRequiredStages: number;
  externalMessagesSent: 0;
  modelCallsMade: 0;
  jobsCreated: 0;
  softwareProjectsStarted: 0;
  readiness: ReturnType<typeof connectionReadiness>;
  blocked: string[];
  safeFallback: string;
  sha256: string;
  note: string;
  error?: string;
};

export function buildCommunicationPlan(input: RouteInput = {}): CommunicationPlan {
  const routing = routeAiRequest(input);
  const workflowId = `comm_${hash({ text: routing.request.text, at: "static-plan" }).slice(0, 16)}`;

  const envelopes: CommunicationEnvelope[] = COMMUNICATION_WORKFLOW.stages.map((stage) => {
    const payloadRef = stage.stage === "MODEL_ROUTING_PLAN"
      ? routing.sha256
      : `plan:${workflowId}:stage:${stage.sequence}`;
    const seed = {
      workflowId,
      sequence: stage.sequence,
      stage: stage.stage,
      from: stage.from,
      to: stage.to,
      kind: stage.kind,
      payloadRef,
      approvedModelId: routing.selectedModelId,
    };
    const evidenceHash = hash(seed);
    return {
      envelopeId: `env_${evidenceHash.slice(0, 20)}`,
      sequence: stage.sequence,
      stage: stage.stage,
      from: stage.from,
      to: stage.to,
      kind: stage.kind,
      payloadRef,
      approvalRequired: stage.approvalRequired,
      evidenceHash,
      status: "DRAFT",
      delivery: "LOCAL_ONLY_NOT_SENT",
      executable: false,
    };
  });

  const plan: CommunicationPlan = {
    ok: routing.ok,
    planOnly: true,
    executable: false,
    workflowId,
    teamId: AI_TEAM.id,
    department: AI_TEAM.department,
    routing,
    envelopes,
    envelopeCount: envelopes.length,
    approvalRequiredStages: envelopes.filter((envelope) => envelope.approvalRequired).length,
    externalMessagesSent: 0,
    modelCallsMade: 0,
    jobsCreated: 0,
    softwareProjectsStarted: 0,
    readiness: connectionReadiness(routing.selectedModelId ?? undefined),
    blocked: [
      ...routing.blocked,
      "No communication channel is connected — envelopes are LOCAL DRAFTS, never sent",
      "ASSIGNMENT_REQUEST stays BLOCKED_NO_API",
      "DEVELOPMENT_WORK is NOT_STARTED — no software development project was opened",
      "OWNER_APPROVAL remains PENDING",
    ],
    safeFallback: "GIMMS Development Agent records the local plan → human Owner handoff",
    sha256: "",
    note: "Team communication workflow is CONFIGURED, not executed. No external message, model call, job or product was created.",
    ...(routing.ok ? {} : { error: routing.error }),
  };
  plan.sha256 = hash({ workflowId, envelopes: envelopes.map((envelope) => envelope.evidenceHash), routing: routing.sha256 });
  return plan;
}

export function communicationSummary() {
  return {
    workflowId: COMMUNICATION_WORKFLOW.id,
    stages: COMMUNICATION_WORKFLOW.stages.length,
    externalChannelsConnected: COMMUNICATION_WORKFLOW.externalChannelsConnected,
    externalMessagesSent: COMMUNICATION_WORKFLOW.externalMessagesSent,
    delivery: COMMUNICATION_WORKFLOW.delivery,
    status: COMMUNICATION_WORKFLOW.status,
    note: "Local structured envelopes only; no chat/email/notification service connected.",
  };
}
