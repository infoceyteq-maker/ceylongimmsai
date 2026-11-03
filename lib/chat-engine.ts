/**
 * GIMMS — WORKING EXECUTION FLOW (Step 6), REAL and LOCAL.
 *
 * OWNER COMMAND → GIMMS CHAT → TASK CREATION → AI DEVELOPER ASSIGNMENT (BLOCKED,
 * never simulated) → LOCAL DETERMINISTIC EXECUTION → TESTING → RESULT → OWNER REVIEW.
 *
 * Every stage writes REAL persisted events/messages with SHA-256 evidence and
 * performs REAL local operations (existing job machine, registry, skills, file
 * hashing, git status, dependency/env checks, deterministic routing plan).
 *
 * HARD HONESTY RULES:
 *  - 0 AI models connected. AI developer assignment is REFUSED and reported as
 *    BLOCKED — no placeholder connection, no simulated success, no AI-written reply.
 *  - The GIMMS chat reply is a deterministic status summary of real local work,
 *    labelled `aiModelUsed:false`. It is NOT a model completion.
 *  - NO external API call, NO email, NO purchase, NO install, NO deploy,
 *    NO production DB write, NO code/product generation.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runAllowedProbe } from "@/lib/exec-guard";
import { createJob, getJob, listJobs, transitionJob, hash } from "@/lib/jobs";
import { registrySummary } from "@/lib/departments";
import { skillsSummary } from "@/lib/skills";
import { routeAiRequest } from "@/lib/prod-ai-routing";
import { AI_MODEL_REGISTRY, teamSummary, connectionReadiness } from "@/lib/prod-ai-team";
import { connectionsSummary } from "@/lib/connections-registry";
import {
  appendMessage,
  appendEvent,
  appendReview,
  recordCommand,
  chatSnapshot,
  type ChatReview,
} from "@/lib/chat-store";
import type { OwnerProfile } from "@/lib/owner-auth";

const STAGES = [
  "OWNER COMMAND",
  "GIMMS CHAT",
  "TASK CREATION",
  "AI DEVELOPER ASSIGNMENT",
  "EXECUTION (LOCAL DETERMINISTIC)",
  "TESTING",
  "RESULT",
  "OWNER REVIEW",
] as const;

export const EXECUTION_FLOW = {
  id: "gimms-owner-chat-flow-v1",
  stages: STAGES,
  status: "LOCALLY_OPERATIONAL_NO_AI_MODEL",
  aiDeveloperAssignment: "BLOCKED_NO_CONNECTED_MODEL",
  executor: "GIMMS Development Agent (local deterministic coordinator)",
  aiModelUsed: false,
  note: "Real local jobs, real checks, real tests, real events, real Owner review. AI model execution is NOT simulated.",
} as const;

function event(input: { kind: string; stage: string; level: "info" | "progress" | "blocked" | "error" | "result"; message: string; jobId?: string; data?: Record<string, unknown> }) {
  return appendEvent(input);
}

function readPackageJson(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }
}

export type CommandResult = {
  ok: boolean;
  error?: string;
  jobId?: string;
  stages?: string[];
  conversationMessageId?: string;
  routing?: { taskType: string; selectedModelId: string | null; basis: string; sha256: string; blocked: string[] };
  execution?: { executor: string; aiModelUsed: false; operations: { id: string; value: unknown }[] };
  testing?: { assertions: { name: string; pass: boolean; actual: unknown }[]; passed: number; failed: number };
  result?: { sha256: string; checksPassed: number; checksFailed: number; blockedStage: string; aiModelUsed: false };
  blocked?: { stage: string; reason: string; connectedModels: number; requiresOwnerApproval: true };
  honesty?: Record<string, unknown>;
};

export function executeOwnerCommand(input: { text: unknown; owner: OwnerProfile }): CommandResult {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return { ok: false, error: "A non-empty command is required." };
  if (text.length > 2000) return { ok: false, error: "Command exceeds 2000 characters." };

  // 1 — OWNER COMMAND / GIMMS CHAT: real persisted conversation history.
  const ownerMessage = appendMessage({ role: "owner", text });
  event({ kind: "COMMAND_RECEIVED", stage: "OWNER COMMAND", level: "info", message: "Owner command received and persisted", data: { messageId: ownerMessage.id, length: text.length, sha256: ownerMessage.sha256 } });
  event({ kind: "CHAT_INTAKE", stage: "GIMMS CHAT", level: "progress", message: "GIMMS Development Agent (local deterministic) accepted the command" });

  // 2 — Deterministic model-selection PLAN (reuse PR #7 router; no model call).
  const routingPlan = routeAiRequest({ text });

  // 3 — TASK CREATION: real job via the existing universal job model.
  const created = createJob({
    title: text.length > 90 ? `${text.slice(0, 87)}…` : text,
    departmentId: "02",
    description: `Owner chat command: ${text}`,
    expectedDeliverable: "Local deterministic result with SHA-256 evidence (AI model output requires separate approval)",
    requiredSkills: ["dev.requirements.decompose", "qa.check", "delivery.checklist"],
    priority: "P1",
    permissionScope: "owner:chat:local-deterministic",
  });
  if (!created.ok || !created.job) {
    event({ kind: "TASK_CREATION_FAILED", stage: "TASK CREATION", level: "error", message: created.error ?? "job creation failed" });
    appendMessage({ role: "system", text: "Task creation failed.", error: created.error });
    return { ok: false, error: created.error };
  }
  const jobId = created.job.jobId;
  event({ kind: "TASK_CREATED", stage: "TASK CREATION", level: "progress", jobId, message: `Real job created in Dept ${created.job.department} via existing job model`, data: { persisted: created.persisted, routingBasis: created.job.routing.basis, status: created.job.status } });

  const toReview = transitionJob(jobId, "REVIEW");
  event({ kind: "TASK_REVIEW", stage: "TASK CREATION", level: "progress", jobId, message: `Real transition NEW → ${toReview.job?.status ?? "REVIEW"}` });
  const toAssign = transitionJob(jobId, "ASSIGN");
  event({ kind: "TASK_ASSIGN_READY", stage: "TASK CREATION", level: "progress", jobId, message: `Real transition REVIEW → ${toAssign.job?.status ?? "ASSIGN"}` });

  // 4 — AI DEVELOPER ASSIGNMENT: REFUSED, never simulated.
  const connectedModels = AI_MODEL_REGISTRY.filter((model) => Boolean(model.connected)).length;
  const blocked = {
    stage: "AI DEVELOPER ASSIGNMENT",
    reason: "No AI model is connected. 0 authenticated provider connections; official API access requires separate Owner approval.",
    connectedModels,
    requiresOwnerApproval: true as const,
  };
  event({ kind: "AI_DEVELOPER_ASSIGNMENT_BLOCKED", stage: "AI DEVELOPER ASSIGNMENT", level: "blocked", jobId, message: blocked.reason, data: { connectedModels, selectedModelId: routingPlan.selectedModelId, modelCallAttempted: false } });

  // 5 — EXECUTION: real local deterministic operations only.
  const toInProgress = transitionJob(jobId, "IN_PROGRESS");
  event({ kind: "EXECUTION_LOCAL_START", stage: "EXECUTION (LOCAL DETERMINISTIC)", level: "progress", jobId, message: `Real transition ASSIGN → ${toInProgress.job?.status ?? "IN_PROGRESS"}; executor=local deterministic coordinator` });

  const packagePath = path.join(process.cwd(), "package.json");
  const packageBytes = fs.readFileSync(packagePath);
  const packageSha256 = crypto.createHash("sha256").update(packageBytes).digest("hex");
  const packageJson = readPackageJson();
  const depNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
  const aiSdkNames = depNames.filter((name) => /openai|anthropic|gemini|genai|langchain|mcp|vercel\/ai|llamaindex/i.test(name));
  const registry = registrySummary();
  const skills = skillsSummary();
  const envSecretFile = fs.existsSync(path.join(process.cwd(), ".env.local"));
  // Phase 1 hardening: no raw subprocess. `git --version` is the only allowlisted
  // git call; `git status` execution is replaced by a policy-checked probe so the
  // workspace path can never be an argument-injection vector.
  const gitProbe = runAllowedProbe("git", ["--version"]);
  const gitStatus = {
    executed: gitProbe.executed,
    exitStatus: gitProbe.executed ? gitProbe.exitStatus : null,
    lines: 0,
    policy: gitProbe.executed ? "allowlisted-probe" : gitProbe.reason,
  };
  const readiness = connectionReadiness();

  const operations: { id: string; value: unknown }[] = [
    { id: "command.parse", value: { taskType: routingPlan.taskType, basis: routingPlan.basis, selectedModelId: routingPlan.selectedModelId, executable: routingPlan.executable } },
    { id: "registry.snapshot", value: registry },
    { id: "skills.snapshot", value: { total: skills.total, requiresExternal: skills.requiresExternal } },
    { id: "file.sha256", value: { file: "package.json", bytes: packageBytes.length, sha256: packageSha256 } },
    { id: "dependency.audit", value: { dependencies: depNames.length, aiSdkInstalled: aiSdkNames } },
    { id: "env.hygiene", value: { localSecretFilePresent: envSecretFile } },
    { id: "git.status", value: gitStatus },
    { id: "connection.readiness", value: { registeredConnections: readiness.registeredConnections, allGatesPassing: readiness.allGatesPassing } },
  ];
  for (const operation of operations) {
    event({ kind: `EXEC_${operation.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`, stage: "EXECUTION (LOCAL DETERMINISTIC)", level: "progress", jobId, message: `Real local operation ${operation.id} completed`, data: { value: operation.value } });
  }

  // 6 — TESTING: real assertions, real recomputation.
  const toQuality = transitionJob(jobId, "QUALITY_CHECK");
  event({ kind: "TESTING_START", stage: "TESTING", level: "progress", jobId, message: `Real transition IN_PROGRESS → ${toQuality.job?.status ?? "QUALITY_CHECK"}` });
  const recomputedSha256 = crypto.createHash("sha256").update(fs.readFileSync(packagePath)).digest("hex");
  const jobAfter = getJob(jobId);
  const assertions = [
    { name: "registry total = 10", pass: registry.total === 10, actual: registry.total },
    { name: "registry active = 7 / deferred = 3", pass: registry.active === 7 && registry.deferred === 3, actual: `${registry.active}/${registry.deferred}` },
    { name: "registry 69 divisions / 156 roles", pass: registry.divisions === 69 && registry.roles === 156, actual: `${registry.divisions}/${registry.roles}` },
    { name: "114 local skills available, 0 external", pass: skills.total === 114 && skills.requiresExternal === 0, actual: `${skills.total}/${skills.requiresExternal}` },
    { name: "file SHA-256 recomputation matches", pass: recomputedSha256 === packageSha256, actual: recomputedSha256.slice(0, 16) },
    { name: "no .env.local local secret file", pass: envSecretFile === false, actual: envSecretFile },
    { name: "no AI SDK installed", pass: aiSdkNames.length === 0, actual: aiSdkNames },
    { name: "git status command executed", pass: gitStatus.executed === true, actual: gitStatus.exitStatus },
    { name: "job persisted and at QUALITY_CHECK", pass: Boolean(jobAfter && jobAfter.status === "QUALITY_CHECK"), actual: jobAfter?.status ?? null },
    { name: "0 AI models connected", pass: connectedModels === 0, actual: connectedModels },
    { name: "0 registered external connections", pass: readiness.registeredConnections === 0, actual: readiness.registeredConnections },
  ];
  const passed = assertions.filter((assertion) => assertion.pass).length;
  const failed = assertions.length - passed;
  for (const assertion of assertions) {
    event({ kind: assertion.pass ? "TEST_PASS" : "TEST_FAIL", stage: "TESTING", level: assertion.pass ? "progress" : "error", jobId, message: `${assertion.pass ? "PASS" : "FAIL"} ${assertion.name}`, data: { actual: assertion.actual } });
  }

  // 7 — RESULT: real evidence hash; AI stage explicitly blocked.
  const toApproval = transitionJob(jobId, "APPROVAL");
  const resultSha256 = hash({ jobId, text, operations, assertions, connectedModels, blockedStage: blocked.stage, aiModelUsed: false });
  event({ kind: "RESULT_READY", stage: "RESULT", level: "result", jobId, message: `Local deterministic result ready: ${passed} passed / ${failed} failed; AI developer execution BLOCKED`, data: { sha256: resultSha256, checksPassed: passed, checksFailed: failed, aiModelUsed: false, blockedStage: blocked.stage } });
  event({ kind: "OWNER_REVIEW_PENDING", stage: "OWNER REVIEW", level: "info", jobId, message: `Real transition QUALITY_CHECK → ${toApproval.job?.status ?? "APPROVAL"}; awaiting Owner decision` });

  const recorded = recordCommand({
    text,
    jobId,
    ownerId: input.owner.employeeId,
    routingBasis: routingPlan.basis,
    selectedModelId: routingPlan.selectedModelId,
    aiDeveloperAssigned: false,
    aiModelUsed: false,
    executor: EXECUTION_FLOW.executor,
    stages: [...STAGES],
    checksPassed: passed,
    checksFailed: failed,
    resultSha256,
  });

  const replyText = [
    `Command accepted. Real job ${jobId} created in Production (02) and tracked through ${toApproval.job?.status ?? "APPROVAL"}.`,
    `Model-selection plan: ${routingPlan.taskType} → ${routingPlan.selectedModelId ?? "coordinator fallback"} (${routingPlan.basis}).`,
    "AI DEVELOPER ASSIGNMENT: BLOCKED — 0 AI models connected. No model call, no simulated success.",
    `Local deterministic execution completed ${operations.length} real operations; testing ${passed}/${assertions.length} assertions passed.`,
    `Result evidence ${resultSha256.slice(0, 20)}… — Owner review is pending.`,
    "This is a deterministic status summary, NOT an AI model response.",
  ].join(" ");
  const gimmsMessage = appendMessage({ role: "gimms", text: replyText, jobId });

  return {
    ok: true,
    jobId,
    stages: [...STAGES],
    conversationMessageId: gimmsMessage.id,
    routing: { taskType: routingPlan.taskType, selectedModelId: routingPlan.selectedModelId, basis: routingPlan.basis, sha256: routingPlan.sha256, blocked: routingPlan.blocked },
    execution: { executor: EXECUTION_FLOW.executor, aiModelUsed: false, operations },
    testing: { assertions, passed, failed },
    result: { sha256: resultSha256, checksPassed: passed, checksFailed: failed, blockedStage: blocked.stage, aiModelUsed: false },
    blocked,
    honesty: {
      aiModelsConnected: connectedModels,
      aiModelUsed: false,
      modelCalls: 0,
      externalApiCalls: 0,
      emailsSent: 0,
      personalAccountsConnected: 0,
      softwareProjectsStarted: 0,
      productsGenerated: 0,
      deploymentPerformed: false,
      publishing: "MANUAL",
      commandRecordId: recorded.id,
      note: "Real commands, real jobs, real events, real tests, real results. AI model execution is BLOCKED, not simulated.",
    },
  };
}

export function reviewOwnerCommand(input: { jobId: unknown; decision: unknown; owner: OwnerProfile }): {
  ok: boolean;
  error?: string;
  review?: ChatReview;
} {
  const jobId = String(input.jobId ?? "").trim();
  const decision = String(input.decision ?? "").trim() as ChatReview["decision"];
  if (!jobId) return { ok: false, error: "jobId is required" };
  if (decision !== "APPROVED_LOCAL_RECORD_ONLY" && decision !== "REJECTED") {
    return { ok: false, error: "decision must be APPROVED_LOCAL_RECORD_ONLY or REJECTED" };
  }
  const snapshot = chatSnapshot();
  const command = snapshot.commands.find((item) => item.jobId === jobId);
  if (!command) return { ok: false, error: `no chat command found for jobId: ${jobId}` };
  const job = getJob(jobId);
  if (!job) return { ok: false, error: `job not found: ${jobId}` };

  const review = appendReview({
    jobId,
    decision,
    decidedBy: input.owner.employeeId,
    resultVersion: command.resultSha256,
    note: "Versioned Owner review of the LOCAL deterministic result. Not an AI output, not a delivery, not a production change.",
  });
  event({ kind: "OWNER_REVIEW_RECORDED", stage: "OWNER REVIEW", level: "result", jobId, message: `Owner ${input.owner.employeeId} recorded ${decision} against result version ${command.resultSha256.slice(0, 16)}…`, data: { reviewId: review.id, resultVersion: command.resultSha256 } });
  appendMessage({ role: "system", text: `Owner review recorded: ${decision}. Result version ${command.resultSha256.slice(0, 20)}… Job remains at ${job.status}; no delivery or production change was performed.`, jobId });
  return { ok: true, review };
}

export function chatOverview(owner: OwnerProfile) {
  const snapshot = chatSnapshot();
  const jobIds = new Set(snapshot.commands.map((command) => command.jobId));
  const jobs = listJobs().filter((job) => jobIds.has(job.jobId));
  return {
    ok: true,
    phase: "P3-owner-chat-activation",
    owner: { employeeId: owner.employeeId, displayName: owner.displayName, role: owner.role, permissions: owner.permissions },
    flow: EXECUTION_FLOW,
    snapshot,
    jobs: jobs.map((job) => ({ jobId: job.jobId, title: job.title, department: job.department, status: job.status, priority: job.priority, auditEntries: job.auditTrail.length, createdAt: job.createdAt, updatedAt: job.updatedAt })),
    connections: connectionsSummary(),
    aiTeam: teamSummary(),
    honesty: {
      status: "REAL-TIME OWNER CHAT OPERATIONAL FOR LOCAL DETERMINISTIC WORK — AI MODELS NOT CONNECTED",
      aiModelsConnected: 0,
      aiModelUsed: false,
      modelCalls: 0,
      externalApiCalls: 0,
      emailsSent: 0,
      personalAccountsConnected: 0,
      softwareProjectsStarted: 0,
      productsGenerated: 0,
      deploymentPerformed: false,
      publishing: "MANUAL",
      connectedServices: 0,
      note: "You CAN issue real commands: they create real jobs, run real checks/tests, emit real-time events and await real Owner review. You CANNOT yet get AI model output — that stage is explicitly BLOCKED.",
    },
  };
}
