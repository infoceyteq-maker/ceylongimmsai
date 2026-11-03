/**
 * GIMMS P2-02 — REAL LOCAL verification of the Production AI Team SETUP.
 *
 * Tests configuration, deterministic routing, communication workflow and the
 * fail-closed guards. NO model call, NO external API, NO credential, NO deploy,
 * NO software development project. Writes prod-ai-team-verification.txt.
 *
 * Usage (dev server must be running): node scripts/verify-prod-ai-team.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const OUT = path.join(process.cwd(), "prod-ai-team-verification.txt");
const lines = [];
let PASS = 0;
let FAIL = 0;

function log(text = "") {
  lines.push(text);
  console.log(text);
}
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (ok) PASS += 1;
  else FAIL += 1;
  log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
}

async function req(target, options = {}) {
  const response = await fetch(BASE + target, options);
  const raw = await response.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, json, raw };
}
const get = (target) => req(target, { cache: "no-store" });
const post = (target, body) =>
  req(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  log(`PROD_AI_TEAM_BASE=${BASE}`);
  log(`PROD_AI_TEAM_STAMP=${STAMP}`);
  log("SCOPE=INITIAL SETUP ONLY — AI Team Structure, Model Registry, Agent Roles, Required Dev Skills, Routing, Connection Framework, Communication Workflow");
  log(`PRECHECK_TSC_EXIT=${process.env.TSC_EXIT ?? "NOT_RUN"}`);
  log(`PRECHECK_BUILD_EXIT=${process.env.BUILD_EXIT ?? "NOT_RUN"}`);
  log("");

  // ------------------------------------------------------------ configuration
  log("--- 1. AI Team Structure / Model Registry / Roles / Skills ---");
  const config = await get("/api/production/ai-team");
  const c = config.json;
  log(`status_http=${config.status} phase=${c.phase}`);
  log(`summary=${JSON.stringify(c.summary)}`);
  check("config endpoint returns HTTP 200", config.status === 200 && c.ok === true);
  check("team belongs to Production department 02", c.team?.department === "02" && c.team?.departmentName === "Production");
  check("GIMMS Development Agent is Team Coordinator", c.team?.coordinatorRoleId === "role-gimms-development-agent");
  check("team is configured but NO model connected", c.team?.status === "CONFIGURED_LOCAL_NO_MODEL" && c.team?.modelConnected === 0);
  check("no software project started / no product generated", c.team?.softwareProjectsStarted === 0 && c.team?.productsGenerated === 0);

  const models = c.modelRegistry || [];
  log(`models=${models.map((m) => `${m.id}:${m.status}:connected=${m.connected}`).join(" | ")}`);
  check("3 initially included model entries", models.length === 3, `count=${models.length}`);
  check("ChatGPT / OpenAI GPT registered as Coding & Development AI", models.some((m) => m.label === "ChatGPT / OpenAI GPT" && m.assignedRole === "Coding & Development AI"));
  check("Google AI Studio / Gemini registered as Coding & Technical AI", models.some((m) => m.label === "Google AI Studio / Gemini" && m.assignedRole === "Coding & Technical AI"));
  check("Additional AI Models extensible slot present", models.some((m) => m.kind === "EXTENSIBLE_SLOT"));
  check("0 models connected / 0 authenticated tests / 0 SDKs installed", models.every((m) => m.connected === false && m.authenticatedTest === "NOT_PERFORMED" && m.sdkInstalled === false));
  check("2 named models require API access", models.filter((m) => m.status === "REQUIRES_API_ACCESS").length === 2);
  check("no exact model IDs invented", models.every((m) => Array.isArray(m.exactModelIds) && m.exactModelIds.length === 0));
  check("provider facts explicitly UNVERIFIED", models.every((m) => m.apiAvailability === "UNVERIFIED" && m.pricing === "UNVERIFIED" && m.quotas === "UNVERIFIED" && m.factsVerified === false));
  check("credential NAMES only, none configured", models.every((m) => m.credentialConfigured === false && typeof m.credentialName === "string" && !/(sk-|eyJ|=[A-Za-z0-9]{16,})/.test(m.credentialName)));
  check("8 Master Doc §5 future families kept as NOT REGISTERED candidates", (c.futureModelFamilies || []).length === 8 && c.futureModelFamilies.every((f) => f.status === "CANDIDATE_NOT_REGISTERED" && f.connected === false));

  const roles = c.agentRoles || [];
  log(`roles=${roles.map((r) => `${r.id}:${r.status}`).join(" | ")}`);
  check("4 AI agent roles configured", roles.length === 4);
  check("every role has functions/inputs/outputs/skills/permissions/approvals", roles.every((r) => r.functions.length && r.inputs.length && r.outputs.length && r.skills.length && r.permissions.length && r.approvalRequirements.length));
  check("every role is modelConnected:false", roles.every((r) => r.modelConnected === false));
  check("coordinator is a native deterministic role contract", roles.some((r) => r.type === "NATIVE_DETERMINISTIC_COORDINATOR" && r.status === "CONFIGURED_LOCAL_DETERMINISTIC"));
  check("2 external model roles require API access", roles.filter((r) => r.status === "REQUIRES_API_ACCESS").length === 2);
  check("every role skill reference resolves", c.roleReferenceValidation?.valid === true, JSON.stringify(c.roleReferenceValidation?.missing));

  const skills = c.requiredDevelopmentSkills || [];
  log(`required_dev_skills=${skills.length} implemented=${c.summary?.developmentSkillsImplemented}`);
  check("required development skills specification >= 25 entries", skills.length >= 25, `count=${skills.length}`);
  check("ALL development skills are SPEC ONLY, executable:false", skills.every((s) => s.implementationStatus === "SPEC_ONLY_NOT_IMPLEMENTED" && s.executable === false));
  check("each skill has inputs/outputs/executable steps + architecture + approval gates", skills.every((s) => s.inputs.length && s.outputs.length && s.executableSteps.length && s.recommendedArchitecture && s.approvalRequirements.length));
  check("existing verified local skills reused, not duplicated", (c.existingReusableSkills || []).length >= 14 && c.existingReusableSkills.every((s) => s.verified === true));
  check("code.scaffold reuse is honestly marked DRAFT-only", (c.existingReusableSkills || []).find((s) => s.id === "code.scaffold")?.note?.includes("not a code generator"));
  log("");

  // --------------------------------------------- connection framework + workflow
  log("--- 2. API / Plugin Connection Framework + Team Communication Workflow ---");
  const framework = c.connectionFramework || {};
  log(`framework=${framework.status} plugins=${framework.plugin?.registered} mcp=${framework.mcp?.servers} configuredCredentials=${framework.credentialPolicy?.configuredCount}`);
  check("framework is NOT_CONNECTED with 0 plugins/MCP/SDK", framework.status === "FRAMEWORK_ONLY_NOT_CONNECTED" && framework.plugin?.registered === 0 && framework.mcp?.servers === 0);
  check("connected:true requires an authenticated test", framework.authenticatedTestContract?.requiredBeforeConnectedTrue === true && framework.authenticatedTestContract?.status === "NOT_PERFORMED");
  check("credential policy: server-side only, names only, 0 configured/requested", framework.credentialPolicy?.serverSideOnly === true && framework.credentialPolicy?.namesOnlyInChat === true && framework.credentialPolicy?.configuredCount === 0 && framework.credentialPolicy?.requestedCount === 0);
  const slots = c.connectionSlots || [];
  check("3 connection slots, all NOT_REGISTERED with 0 gates passed", slots.length === 3 && slots.every((s) => s.status === "NOT_REGISTERED" && s.connected === false && s.readinessGates.every((g) => g.pass === false)));
  const workflow = c.communicationWorkflow || {};
  log(`workflow_stages=${workflow.stages?.length} delivery=${workflow.delivery} externalChannels=${workflow.externalChannelsConnected}`);
  check("9 communication stages including QA, human handoff and OWNER APPROVAL", workflow.stages?.length === 9 && ["QUALITY_CHECK", "HUMAN_HANDOFF", "OWNER_APPROVAL"].every((s) => workflow.stages.some((stage) => stage.stage === s)));
  check("workflow is LOCAL_ONLY_NOT_SENT with 0 external channels/messages", workflow.delivery === "LOCAL_ONLY_NOT_SENT" && workflow.externalChannelsConnected === 0 && workflow.externalMessagesSent === 0);
  check("routing rules configured for 8 task types", (c.routingRules || []).length === 8);
  log("");

  // ------------------------------------------------------ deterministic routing
  log("--- 3. Model Selection & Routing (PLAN ONLY, no model call) ---");
  const cases = [
    { name: "coding", body: { action: "route", text: "Implement a TypeScript function and write unit tests" }, expectType: "code_generation", expectModel: "model-chatgpt-openai-gpt" },
    { name: "architecture", body: { action: "route", text: "Design the database schema and API contract architecture" }, expectType: "architecture", expectModel: "model-google-ai-studio-gemini" },
    { name: "debugging", body: { action: "route", text: "Debug this failing stack trace error" }, expectType: "debugging", expectModel: "model-google-ai-studio-gemini" },
    { name: "docs", body: { action: "route", taskType: "documentation", text: "Write the README documentation" }, expectType: "documentation", expectModel: "model-chatgpt-openai-gpt" },
    { name: "technical research", body: { action: "route", text: "Research and benchmark feasibility of two technical options" }, expectType: "technical_research", expectModel: "model-google-ai-studio-gemini" },
  ];
  const routeResults = [];
  for (const testCase of cases) {
    const result = await post("/api/production/ai-team", testCase.body);
    const r = result.json;
    routeResults.push(r);
    log(`route ${testCase.name}: http=${result.status} type=${r.taskType} model=${r.selectedModelId} basis=${r.basis} dept=${r.departmentRouting?.id}/${r.departmentRouting?.basis} sha=${String(r.sha256 || "").slice(0, 16)}`);
    check(`route ${testCase.name} selects ${testCase.expectType} → ${testCase.expectModel}`, result.status === 200 && r.ok === true && r.taskType === testCase.expectType && r.selectedModelId === testCase.expectModel);
  }
  const override = await post("/api/production/ai-team", { action: "route", text: "Implement a function", preferredModelId: "model-google-ai-studio-gemini", allowExternal: true });
  log(`override: model=${override.json.selectedModelId} applied=${override.json.overrideApplied} allowExternal=${override.json.request?.allowExternal}`);
  check("Owner model override is honoured in the PLAN", override.json.overrideApplied === true && override.json.selectedModelId === "model-google-ai-studio-gemini" && override.json.basis === "owner-model-override");
  const badOverride = await post("/api/production/ai-team", { action: "route", text: "Implement a function", preferredModelId: "model-does-not-exist" });
  check("unknown model override is rejected without failing the plan", badOverride.json.overrideApplied === false && String(badOverride.json.overrideError || "").includes("unknown model id") && badOverride.json.executable === false);
  const noMatch = await post("/api/production/ai-team", { action: "route", text: "please confirm the meeting time" });
  log(`no_match: type=${noMatch.json.taskType} model=${noMatch.json.selectedModelId} basis=${noMatch.json.basis}`);
  check("unmatched request falls back to coordinator, no model invented", noMatch.json.selectedModelId === null && noMatch.json.basis === "fallback-no-match" && noMatch.json.selectedModelLabel.includes("safe fallback"));
  const empty = await post("/api/production/ai-team", { action: "route", text: "" });
  check("empty request is rejected", empty.status === 400 && empty.json.ok === false);

  check("EVERY routing result is planOnly / non-executable / 0 model calls / 0 external calls", [...routeResults, override.json, badOverride.json, noMatch.json].every((r) => r.planOnly === true && r.executable === false && r.modelCallAttempted === false && r.externalCalls === 0));
  check("EVERY routing result is BLOCKED (no AI model connected)", [...routeResults, override.json, badOverride.json, noMatch.json].every((r) => r.blocked.some((b) => String(b).includes("No AI model is connected")) && r.connectedModels === 0 && r.requiresOwnerApproval === true));
  check("EVERY routing result has a safe human fallback + SHA-256 evidence", [...routeResults, override.json, badOverride.json, noMatch.json].every((r) => r.safeFallback?.humanOwner === "Owner / Founder / Super Admin" && /^[a-f0-9]{64}$/.test(String(r.sha256))));
  check("allowExternal=true is ignored while 0 models are connected", override.json.executable === false && override.json.blocked.some((b) => String(b).includes("allowExternal=true")));
  check("routing reuses existing department router (evidence present)", routeResults.every((r) => r.departmentRouting?.id && r.departmentRouting?.basis));
  log("");

  // --------------------------------------------------------- communication plan
  log("--- 4. Team Communication Workflow (LOCAL DRAFT envelopes) ---");
  const planRes = await post("/api/production/ai-team", { action: "communication-plan", text: "Implement a TypeScript function and unit tests" });
  const plan = planRes.json;
  log(`plan http=${planRes.status} id=${plan.workflowId} envelopes=${plan.envelopeCount} sha=${String(plan.sha256 || "").slice(0, 16)}`);
  log(`stages=${(plan.envelopes || []).map((e) => `${e.sequence}:${e.stage}:${e.kind}`).join(" | ")}`);
  check("communication plan returns HTTP 200 with 9 envelopes", planRes.status === 200 && plan.ok === true && plan.envelopeCount === 9);
  check("all envelopes are DRAFT / LOCAL_ONLY_NOT_SENT / non-executable", (plan.envelopes || []).every((e) => e.status === "DRAFT" && e.delivery === "LOCAL_ONLY_NOT_SENT" && e.executable === false));
  check("all envelopes have deterministic SHA-256 evidence", (plan.envelopes || []).every((e) => /^[a-f0-9]{64}$/.test(e.evidenceHash) && e.envelopeId.startsWith("env_")));
  check("0 external messages / 0 model calls / 0 jobs / 0 projects", plan.externalMessagesSent === 0 && plan.modelCallsMade === 0 && plan.jobsCreated === 0 && plan.softwareProjectsStarted === 0);
  check("ASSIGNMENT_REQUEST is BLOCKED_NO_API and DEVELOPMENT_WORK NOT_STARTED", (plan.envelopes || []).some((e) => e.kind === "BLOCKED_NO_API") && (plan.envelopes || []).some((e) => e.kind === "NOT_STARTED"));
  check("OWNER_APPROVAL remains PENDING", (plan.envelopes || []).some((e) => e.stage === "OWNER_APPROVAL" && e.kind === "PENDING_DECISION"));
  check("plan includes routing evidence + readiness gates", /^[a-f0-9]{64}$/.test(String(plan.routing?.sha256)) && plan.readiness?.allGatesPassing === false && plan.readiness?.registeredConnections === 0);
  check("plan is non-executable with a human handoff", plan.executable === false && plan.planOnly === true && String(plan.safeFallback).includes("Owner"));

  const readiness = await post("/api/production/ai-team", { action: "readiness" });
  log(`readiness slots=${readiness.json.slots?.length} passing=${readiness.json.allGatesPassing} registered=${readiness.json.registeredConnections}`);
  check("readiness reports 3 slots, 0 gates passed, 0 registered connections", readiness.json.slots?.length === 3 && readiness.json.allGatesPassing === false && readiness.json.registeredConnections === 0);
  const connect = await post("/api/production/ai-team", { action: "connect", modelId: "model-chatgpt-openai-gpt" });
  log(`connect action -> HTTP ${connect.status} connected=${connect.json.connected}`);
  check("connect action is REFUSED with HTTP 403", connect.status === 403 && connect.json.ok === false && connect.json.connected === false && connect.json.credentialsRequested === 0);
  const unknown = await post("/api/production/ai-team", { action: "generate-product" });
  check("unknown action is rejected (no accidental product generation)", unknown.status === 400 && unknown.json.ok === false);
  log("");

  // ------------------------------------------------------------- honesty guards
  log("--- 5. Honesty / no-change regression ---");
  const connectState = await get("/api/connect");
  log(`connect connected=${connectState.json.connected} channels=${(connectState.json.channels || []).length}`);
  check("existing /api/connect still connected:0 (5 channels)", connectState.json.connected === 0 && (connectState.json.channels || []).length === 5);
  const bootstrap = await get("/api/bootstrap");
  log(`bootstrap provider=${bootstrap.json.provider} publishing=${bootstrap.json.publishing} connected=${bootstrap.json.connected}`);
  check("no AI provider / MANUAL publishing / 0 connected", bootstrap.json.provider === "demo" && bootstrap.json.publishing === "MANUAL" && bootstrap.json.connected === 0);
  const skillsApi = await get("/api/skills");
  log(`skills_total=${skillsApi.json.summary?.total} requiresExternal=${skillsApi.json.summary?.requiresExternal}`);
  check("existing skills gateway UNCHANGED at 114 skills / 0 external", skillsApi.json.summary?.total === 114 && skillsApi.json.summary?.requiresExternal === 0);
  const depts = await get("/api/departments");
  const d02 = (depts.json.departments || []).find((d) => d.id === "02");
  const d01 = (depts.json.departments || []).find((d) => d.id === "01");
  log(`registry=${JSON.stringify(depts.json.summary)} dept02_divisions=${d02?.divisions} dept02_skills=${d02?.safeSkills?.length} dept01_skills=${d01?.safeSkills?.length}`);
  check("department registry UNCHANGED (10/7/3, 69 divisions, 156 roles)", depts.json.summary?.total === 10 && depts.json.summary?.active === 7 && depts.json.summary?.deferred === 3 && depts.json.summary?.divisions === 69 && depts.json.summary?.roles === 156);
  check("Dept 02 registry UNCHANGED (9 divisions, 6 skills, 0 needs connected)", d02?.divisions === 9 && d02?.safeSkills?.length === 6 && d02?.externalNeedsConnected === 0);
  check("Dept 01 UNCHANGED (83 local skills)", d01?.safeSkills?.length === 83);
  const dept01 = await get("/api/dept01");
  check("Dept 01 honesty state UNCHANGED", dept01.json.honesty?.connectedServices === 0 && dept01.json.honesty?.deploymentPerformed === false);

  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  check("no new npm dependency / no AI SDK installed", Object.keys(pkg.dependencies).length === 3 && Object.keys(pkg.devDependencies).length === 4 && !Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((name) => /openai|anthropic|gemini|genai|langchain|mcp|vercel\/ai/i.test(name)));
  check("no .env.local present", !fs.existsSync(path.join(process.cwd(), ".env.local")));
  let gitStatus = "";
  try {
    gitStatus = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  } catch {
    gitStatus = "";
  }
  const modifiedTracked = gitStatus.split("\n").filter((line) => /^ ?M |^M  /.test(line));
  log(`modified_tracked_files=${modifiedTracked.length} ${modifiedTracked.join(",")}`);
  check("NO existing tracked module was modified (new files only)", modifiedTracked.length === 0, modifiedTracked.join(",") || "none");
  log("");

  // ------------------------------------------------------- Phase 0 regression
  log("--- 6. Phase 0 regression (unchanged skills gateway) ---");
  let p0 = "";
  try {
    p0 = execFileSync("bash", ["scripts/verify-phase0.sh"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 240000 });
  } catch (error) {
    p0 = String(error.stdout || "") + String(error.stderr || "");
  }
  for (const line of p0.trim().split("\n").filter((line) => /^(PHASE0_|skill_executed_ok|skill_failed|active_p0_count|deferred_count|job_present_after_reload)/.test(line.trim()) || line.includes('"summary":{"total":10') || line.includes('"connected":0'))) {
    log(`P0 ${line.trim()}`);
  }
  check("Phase 0 harness: 0 skill failures", /skill_failed=0(\D|$)/.test(p0), (p0.match(/skill_failed=\d+/) || ["?"])[0]);
  check("Phase 0 harness: registry still 10/7/3", /active_p0_count 7/.test(p0) && /deferred_count 3/.test(p0));
  check("Phase 0 harness: connected stays 0", /"connected":0/.test(p0));
  log("");

  log(`PROD_AI_TEAM_TESTS_PASS=${PASS}`);
  log(`PROD_AI_TEAM_TESTS_FAIL=${FAIL}`);
  log(`PROD_AI_TEAM_VERIFICATION_DONE=${STAMP}`);
  log("HONESTY=CONFIG + LOCAL TESTS ONLY. 0 models connected, 0 API calls, 0 credentials, 0 plugins/MCP, 0 projects started, no deploy, no 100% completion claim.");

  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = FAIL === 0 ? 0 : 1;
}

main().catch((error) => {
  log(`FATAL ${error instanceof Error ? error.stack || error.message : String(error)}`);
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = 1;
});
