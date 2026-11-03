/**
 * GIMMS — REAL END-TO-END verification of the Owner Chat activation.
 *
 * OWNER COMMAND → GIMMS CHAT → TASK CREATION → AI DEVELOPER ASSIGNMENT (BLOCKED)
 * → LOCAL EXECUTION → TESTING → RESULT → OWNER REVIEW.
 *
 * ALL operations are real local ones. NO model call, NO external API, NO email,
 * NO purchase, NO install, NO deploy. A random local TEST password is generated
 * at runtime, NEVER printed, and the test Owner/chat state is cleaned up at the
 * end so the real Owner can register themselves in the live preview.
 *
 * Writes: owner-chat-verification.txt
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const OUT = path.join(process.cwd(), "owner-chat-verification.txt");
const OWNER_FILE = path.join(process.cwd(), "data", "gimms-owner.json");
const CHAT_FILE = path.join(process.cwd(), "data", "gimms-chat.json");
const TEST_PASSWORD = crypto.randomBytes(24).toString("hex"); // NEVER logged or persisted in plaintext
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(target, { method = "GET", body, cookie } = {}) {
  // A real browser always sends Origin on a mutating request, and the Phase 1
  // CSRF guard requires it. The harness must behave like the browser it stands in for.
  const headers = {
    Origin: BASE,
    ...(method !== "GET" ? { "Sec-Fetch-Site": "same-origin" } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
  };
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(BASE + target, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
      break;
    } catch (cause) {
      if (attempt === 3) throw cause;
      await sleep(250);
    }
  }
  const raw = await response.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    /* non-JSON */
  }
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  return { status: response.status, json, raw, setCookies, headers: response.headers };
}
function cookieFrom(setCookies) {
  for (const raw of setCookies || []) {
    const pair = String(raw).split(";")[0];
    if (pair.startsWith("gimms_owner_session=") || pair.startsWith("__Host-gimms_owner_session=")) return pair;
  }
  return "";
}

async function captureSse(cookie, trigger, durationMs = 4500) {
  const controller = new AbortController();
  let raw = "";
  let httpStatus = 0;
  const readerTask = (async () => {
    const response = await fetch(`${BASE}/api/chat/stream?since=0`, { headers: { Cookie: cookie }, signal: controller.signal });
    httpStatus = response.status;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
  })().catch(() => {});
  await sleep(750); // stream goes LIVE before the command is issued
  const triggerResult = await trigger();
  await sleep(Math.max(0, durationMs - 750));
  controller.abort();
  await Promise.race([readerTask, sleep(600)]);
  return { raw, httpStatus, triggerResult };
}

async function main() {
  log(`OWNER_CHAT_BASE=${BASE}`);
  log(`OWNER_CHAT_STAMP=${STAMP}`);
  log("SCOPE=Activation of EXISTING Production AI Development Team through one real-time Owner Chat");
  log(`PRECHECK_TSC_EXIT=${process.env.TSC_EXIT ?? "NOT_RUN"}`);
  log(`PRECHECK_BUILD_EXIT=${process.env.BUILD_EXIT ?? "NOT_RUN"}`);
  log("TEST_PASSWORD=generated locally at runtime; NEVER printed, NEVER stored in plaintext");
  log("");

  // Start from a clean LOCAL test state (never touches production data).
  for (const file of [OWNER_FILE, CHAT_FILE]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------ STEP 1 Owner registration
  log("--- 1. Owner Registration (Founder / Super Admin) ---");
  const initial = await call("/api/owner");
  log(`owner_initial registered=${initial.json.registered} loginState=${initial.json.loginState} authenticated=${initial.json.authenticated}`);
  check("starts UNREGISTERED and unauthenticated", initial.json.registered === false && initial.json.authenticated === false);

  const register = await call("/api/owner", { method: "POST", body: { action: "register", password: TEST_PASSWORD, displayName: "Local Verification Owner" } });
  let cookie = cookieFrom(register.setCookies);
  log(`register http=${register.status} employeeId=${register.json.profile?.employeeId} role=${register.json.profile?.role} cookie=${cookie ? "set" : "MISSING"}`);
  check("Owner registration returns 201 with a real employee profile", register.status === 201 && register.json.ok === true && register.json.profile?.employeeId === "EMP-0001");
  check("profile is Founder / Owner / Super Admin with permissions", register.json.profile?.role === "Founder / Owner / Super Admin" && register.json.profile?.permissions?.length >= 8);
  check("NO real Owner details invented", register.json.profile?.email === null && register.json.profile?.realDetailsStored === false && register.json.profile?.profileComplete === false);
  check("password never stored in plaintext / scrypt + httpOnly session", register.json.security?.passwordStoredInPlaintext === false && register.json.security?.algorithm?.includes("scrypt") && /HttpOnly/i.test(String(register.setCookies.join(" "))));
  check("session cookie issued for subsequent requests", cookie.startsWith("gimms_owner_session=") && cookie.length > 30);
  const dupRegister = await call("/api/owner", { method: "POST", body: { action: "register", password: TEST_PASSWORD } });
  check("second registration is refused (one Owner account)", dupRegister.status === 409 && dupRegister.json.ok === false);

  const statusAuthed = await call("/api/owner", { cookie });
  check("authenticated Owner status resolves", statusAuthed.json.registered === true && statusAuthed.json.authenticated === true);

  const logout = await call("/api/owner", { method: "POST", body: { action: "logout" }, cookie });
  check("logout removes the session", logout.status === 200 && logout.json.ok === true);
  const badLogin = await call("/api/owner", { method: "POST", body: { action: "login", password: "definitely-wrong-password-123" } });
  check("wrong password is refused with 401", badLogin.status === 401 && badLogin.json.ok === false);
  const login = await call("/api/owner", { method: "POST", body: { action: "login", password: TEST_PASSWORD } });
  cookie = cookieFrom(login.setCookies) || cookie;
  log(`login http=${login.status} cookie=${cookie ? "set" : "MISSING"}`);
  check("real login succeeds with the Owner's own password", login.status === 200 && login.json.ok === true && cookie.startsWith("gimms_owner_session="));

  const unauthChat = await call("/api/chat");
  check("chat is protected: unauthenticated GET → 401", unauthChat.status === 401 && unauthChat.json.ok === false);
  const unauthCommand = await call("/api/chat", { method: "POST", body: { action: "command", text: "unauthorized" } });
  check("chat is protected: unauthenticated command → 401", unauthCommand.status === 401 && unauthCommand.json.ok === false);
  const unauthStream = await call("/api/chat/stream?since=0");
  check("SSE stream is protected: unauthenticated → 401", unauthStream.status === 401);
  log("");

  // ------------------------------------ STEPS 2 & 6 real-time command + execution flow
  log("--- 2/6. Real-time Owner Chat → command → job → execution → tests → result ---");
  const overview0 = await call("/api/chat", { cookie });
  log(`flow=${JSON.stringify(overview0.json.flow?.stages)} status=${overview0.json.flow?.status}`);
  check("chat overview returns 8-stage execution flow", overview0.status === 200 && overview0.json.flow?.stages?.length === 8);
  check("flow marks AI developer assignment BLOCKED", overview0.json.flow?.aiDeveloperAssignment === "BLOCKED_NO_CONNECTED_MODEL" && overview0.json.flow?.aiModelUsed === false);
  check("empty conversation at start", overview0.json.snapshot?.counts.messages === 0 && overview0.json.snapshot?.counts.commands === 0);

  const COMMAND = "GIMMS, register this development task, run the local QA and dependency checks, and report the result for my review.";
  let commandResult = null;
  const sse = await captureSse(cookie, async () => {
    commandResult = await call("/api/chat", { method: "POST", body: { action: "command", text: COMMAND }, cookie });
    return commandResult;
  });
  const r = commandResult?.json ?? {};
  log(`command http=${commandResult?.status} jobId=${r.jobId} checks=${r.testing?.passed}/${r.testing?.assertions?.length} failed=${r.testing?.failed}`);
  log(`routing=${r.routing?.taskType} selectedModel=${r.routing?.selectedModelId} basis=${r.routing?.basis}`);
  log(`blocked=${JSON.stringify(r.blocked)} result_sha256=${r.result?.sha256}`);
  log(`sse_http=${sse.httpStatus} sse_bytes=${sse.raw.length} event_lines=${(sse.raw.match(/^event:/gm) || []).length}`);
  check("REAL command returns 200 with a real jobId", commandResult?.status === 200 && r.ok === true && typeof r.jobId === "string" && r.jobId.startsWith("job_"));
  check("8-stage flow executed with real job transitions", r.stages?.length === 8 && r.stages.includes("OWNER REVIEW"));
  check("8 real local execution operations recorded", r.execution?.operations?.length === 8 && r.execution.aiModelUsed === false);
  check("real local testing assertions all pass", r.testing?.assertions?.length === 11 && r.testing.passed === 11 && r.testing.failed === 0);
  check("result has a real SHA-256 and blocked AI stage", /^[a-f0-9]{64}$/.test(String(r.result?.sha256)) && r.result?.blockedStage === "AI DEVELOPER ASSIGNMENT" && r.result?.aiModelUsed === false);
  check("AI DEVELOPER ASSIGNMENT is BLOCKED with 0 connected models", r.blocked?.connectedModels === 0 && r.blocked?.requiresOwnerApproval === true);
  check("routing plan is non-executable and reuses PR #7 router", r.routing?.selectedModelId !== undefined && /^[a-f0-9]{64}$/.test(String(r.routing?.sha256)));
  check("honesty: 0 model calls / 0 external calls / 0 emails / no deploy", r.honesty?.modelCalls === 0 && r.honesty?.externalApiCalls === 0 && r.honesty?.emailsSent === 0 && r.honesty?.deploymentPerformed === false);
  check("SSE stream returns 200 text/event-stream", sse.httpStatus === 200);
  check("SSE emitted a real ready event", sse.raw.includes("event: ready"));
  check("SSE emitted REAL TASK_CREATED progress", sse.raw.includes("TASK_CREATED"));
  check("SSE emitted REAL blocked AI-assignment event (not simulated success)", sse.raw.includes("AI_DEVELOPER_ASSIGNMENT_BLOCKED"));
  check("SSE emitted REAL test/result events", sse.raw.includes("TEST_PASS") || sse.raw.includes("RESULT_READY"));
  check("SSE emitted REAL Owner-review-pending event", sse.raw.includes("OWNER_REVIEW_PENDING"));
  check("SSE carries >= 10 real event frames", (sse.raw.match(/^event:/gm) || []).length >= 10, `count=${(sse.raw.match(/^event:/gm) || []).length}`);
  log(`sse_sample=${sse.raw.split("\n").filter((line) => line.startsWith("event:") || line.startsWith("id:")).slice(0, 14).join(" ")}`);
  log("");

  // ------------------------------------------------- STEP 6 persistence + review
  log("--- 3. Conversation history, job tracking, errors, Owner review ---");
  const after = await call("/api/chat", { cookie });
  const c = after.json;
  log(`counts=${JSON.stringify(c.snapshot?.counts)} jobStatus=${c.jobs?.[0]?.status} audit=${c.jobs?.[0]?.auditEntries} snapshot_sha=${String(c.snapshot?.sha256).slice(0, 16)}`);
  check("conversation history persisted (owner + gimms messages)", c.snapshot?.counts.messages === 2 && c.snapshot.messages.some((m) => m.role === "owner") && c.snapshot.messages.some((m) => m.role === "gimms"));
  check("every message is labelled aiModelUsed:false", c.snapshot.messages.every((m) => m.aiModelUsed === false));
  check("real job tracked at APPROVAL with audit trail", c.jobs?.[0]?.jobId === r.jobId && c.jobs[0].status === "APPROVAL" && c.jobs[0].auditEntries >= 6);
  check("real progress events persisted", c.snapshot?.counts.events >= 20, `events=${c.snapshot?.counts.events}`);
  check("1 command record with real result hash", c.snapshot?.counts.commands === 1 && c.snapshot.commands[0].resultSha256 === r.result?.sha256 && c.snapshot.commands[0].aiModelUsed === false);
  check("snapshot hash is deterministic across reload", (await call("/api/chat", { cookie })).json.snapshot?.sha256 === c.snapshot?.sha256);

  const emptyCommand = await call("/api/chat", { method: "POST", body: { action: "command", text: "" }, cookie });
  check("empty command is rejected with real error", emptyCommand.status === 400 && emptyCommand.json.ok === false);
  const unknownAction = await call("/api/chat", { method: "POST", body: { action: "generate-product" }, cookie });
  check("unknown action is rejected (no accidental product generation)", unknownAction.status === 400 && unknownAction.json.ok === false);
  const badReview = await call("/api/chat", { method: "POST", body: { action: "review", jobId: "job_missing", decision: "APPROVED_LOCAL_RECORD_ONLY" }, cookie });
  check("review of unknown job is rejected", badReview.status === 400 && badReview.json.ok === false);

  const review = await call("/api/chat", { method: "POST", body: { action: "review", jobId: r.jobId, decision: "APPROVED_LOCAL_RECORD_ONLY" }, cookie });
  log(`review http=${review.status} id=${review.json.review?.id} version=${review.json.review?.resultVersion?.slice(0, 16)}`);
  check("REAL Owner review recorded with the versioned result", review.status === 200 && review.json.ok === true && review.json.review?.resultVersion === r.result?.sha256);
  check("review makes no money movement / no external calls", review.json.review?.moneyMovement === false && review.json.review?.externalCalls === 0);
  const afterReview = await call("/api/chat", { cookie });
  check("review persisted; job stays at APPROVAL (no fake delivery)", afterReview.json.snapshot?.counts.reviews === 1 && afterReview.json.jobs?.[0]?.status === "APPROVAL");

  const second = await call("/api/chat", { method: "POST", body: { action: "command", text: "Run another local QA regression check for the Owner Chat." }, cookie });
  const afterSecond = await call("/api/chat", { cookie });
  log(`second_command http=${second.status} commands=${afterSecond.json.snapshot?.counts.commands} jobs=${afterSecond.json.jobs?.length}`);
  check("second real command creates a second real job", second.status === 200 && second.json.ok === true && afterSecond.json.snapshot?.counts.commands === 2 && afterSecond.json.jobs?.length === 2);
  check("second command also blocks AI execution honestly", second.json.blocked?.connectedModels === 0 && second.json.honesty?.aiModelUsed === false);
  log("");

  // ------------------------------------------------ STEP 5 Skills & Tools registry
  log("--- 4. Centralized Skills & Tools Registry ---");
  const registry = await call("/api/skills-tools");
  const reg = registry.json;
  log(`registry existingSkills=${reg.existingSkills?.total} specs=${reg.developmentSkillSpecifications?.total} groups=${reg.summary?.essentialGroups} localTools=${reg.summary?.localToolsAvailable} aiSdk=${reg.dependencyCheck?.aiSdkInstalled?.length}`);
  check("registry exposes 114 existing executable local skills", registry.status === 200 && reg.existingSkills?.total === 114 && reg.existingSkills.requiresExternal === 0);
  check("registry exposes 29 spec-only development skills (0 implemented)", reg.developmentSkillSpecifications?.total === 29 && reg.developmentSkillSpecifications.implemented === 0);
  check("8 essential skill groups prepared", reg.essentialSkillGroups?.length === 8 && reg.summary?.essentialGroups === 8);
  check("skill groups honestly split executable / partial / framework-only", reg.summary?.executableLocalGroups === 4 && reg.summary?.partialGroups === 3 && reg.summary?.frameworkOnlyGroups === 1);
  // Phase 1 narrowed lib/exec-guard.ts to exactly `git --version` + `node --version`.
  // The old expectation here was `localToolsAvailable >= 5`, which predates that
  // hardening and could only pass by re-opening the exec surface. Assert the honest
  // result instead: a non-allowlisted probe must be BLOCKED_BY_POLICY, never a version.
  const EXEC_ALLOWLIST_IDS = ["node", "git"];
  const tools = reg.localTools ?? [];
  const availableIds = tools.filter((tool) => tool.available).map((tool) => tool.id).sort();
  const blockedTools = tools.filter((tool) => !tool.available);
  check("7 real local tools declared, no duplicates (not invented)", tools.length === 7 && new Set(tools.map((tool) => tool.id)).size === 7);
  check(
    "only exec-guard allowlist probes report available (git --version, node --version)",
    availableIds.length === EXEC_ALLOWLIST_IDS.length &&
      availableIds.every((id) => EXEC_ALLOWLIST_IDS.includes(id)) &&
      reg.summary?.localToolsAvailable === availableIds.length,
    `available=${availableIds.join("+") || "(none)"} summary=${reg.summary?.localToolsAvailable}`,
  );
  check(
    "non-allowlisted tools report BLOCKED_BY_POLICY, never an invented version",
    blockedTools.length === 5 && blockedTools.every((tool) => tool.version === "BLOCKED_BY_POLICY"),
    blockedTools.map((tool) => `${tool.id}:${tool.version}`).join(","),
  );
  check("no AI SDK installed / no new package / no .env.local", reg.dependencyCheck?.aiSdkInstalled?.length === 0 && reg.dependencyCheck?.newPackagesInstalled === 0 && reg.dependencyCheck?.localSecretFilePresent === false);
  check("registry reports 0 connected AI models", reg.summary?.aiModelsConnected === 0 && reg.connectionsSummary?.aiModelsConnected === 0);
  log("");

  // --------------------------------------------- STEP 3/4 connections + honesty
  log("--- 5. AI models, accounts, tools — honesty regression ---");
  const team = await call("/api/production/ai-team");
  log(`prod_ai_team modelsConnected=${team.json.summary?.modelsConnected} connects=${team.json.summary?.registeredConnections}`);
  check("PR #7 AI team config UNCHANGED: 0 models connected", team.json.summary?.modelsConnected === 0 && team.json.summary?.modelsRegistered === 3);
  const connect = await call("/api/connect");
  check("/api/connect still connected:0", connect.json.connected === 0 && connect.json.channels?.length === 5);
  const bootstrap = await call("/api/bootstrap");
  check("no AI provider / MANUAL publishing", bootstrap.json.provider === "demo" && bootstrap.json.publishing === "MANUAL" && bootstrap.json.connected === 0);
  const skillsApi = await call("/api/skills");
  check("existing skills gateway UNCHANGED at 114", skillsApi.json.summary?.total === 114 && skillsApi.json.summary?.requiresExternal === 0);
  const depts = await call("/api/departments");
  check("department registry UNCHANGED 10/7/3/69/156", depts.json.summary?.total === 10 && depts.json.summary?.active === 7 && depts.json.summary?.deferred === 3 && depts.json.summary?.divisions === 69 && depts.json.summary?.roles === 156);
  const dept01 = await call("/api/dept01");
  check("Dept 01 honesty state UNCHANGED", dept01.json.honesty?.connectedServices === 0 && dept01.json.honesty?.deploymentPerformed === false);
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  check("package.json unchanged (3 deps / 4 devDeps)", Object.keys(pkg.dependencies).length === 3 && Object.keys(pkg.devDependencies).length === 4);
  check("no .env.local secret file", !fs.existsSync(path.join(process.cwd(), ".env.local")));
  for (const target of ["/", "/chat", "/departments/01"]) {
    const page = await call(target);
    log(`page ${target} http=${page.status}`);
  }
  const chatPage = await call("/chat");
  check("real Owner Chat page is served (HTTP 200)", chatPage.status === 200);
  let gitStatus = "";
  try {
    gitStatus = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  } catch {
    gitStatus = "";
  }
  const modifiedTracked = gitStatus.split("\n").filter((line) => /^ ?M |^M  /.test(line)).map((line) => line.trim());
  log(`modified_tracked=${modifiedTracked.join(",")}`);
  // This used to assert "exactly 2 modified files (.gitignore, HubShell.tsx)" — a
  // snapshot of the session that authored this harness. Those edits are merged now, so
  // that assertion could never pass again on a clean tree. The durable property is:
  // a harness run must not dirty any tracked SOURCE file. Only the committed evidence
  // artifacts these harnesses overwrite by design (`*-verification.txt`) may be dirty.
  // Consequence: this harness expects a COMMITTED tree. If you are mid-edit, commit
  // first — the failure then means exactly what it says, not a stale frozen snapshot.
  const EVIDENCE_ARTIFACT = /(^|\/)([\w.-]*-)?verification[\w.-]*\.txt$/;
  const modifiedPaths = modifiedTracked.map((line) => line.replace(/^\S+\s+/, ""));
  const modifiedSource = modifiedPaths.filter((file) => !EVIDENCE_ARTIFACT.test(file));
  check("harness run dirties no tracked source/config file", modifiedSource.length === 0, modifiedSource.join(","));
  check(
    "only committed evidence .txt artifacts may be dirty",
    modifiedPaths.length === modifiedTracked.length && modifiedTracked.every((line, index) => EVIDENCE_ARTIFACT.test(modifiedPaths[index])),
    modifiedPaths.join(","),
  );
  log("");

  // --------------------------------------------------------- Phase 0 regression
  log("--- 6. Phase 0 regression ---");
  let p0 = "";
  try {
    p0 = execFileSync("bash", ["scripts/verify-phase0.sh"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 240000 });
  } catch (error) {
    p0 = String(error.stdout || "") + String(error.stderr || "");
  }
  for (const line of p0.trim().split("\n").filter((line) => /^(PHASE0_VERIFICATION_DONE|skill_executed_ok|skill_failed|active_p0_count|deferred_count)/.test(line.trim()) || line.includes('"connected":0'))) {
    log(`P0 ${line.trim()}`);
  }
  check("Phase 0 harness: 0 skill failures", /skill_failed=0(\D|$)/.test(p0), (p0.match(/skill_failed=\d+/) || ["?"])[0]);
  check("Phase 0 harness: registry still 7 active / 3 deferred", /active_p0_count 7/.test(p0) && /deferred_count 3/.test(p0));
  check("Phase 0 harness: connected stays 0", /"connected":0/.test(p0));
  log("");

  // ------------------------------------------ cleanup: real Owner registers themselves
  log("--- 7. Local test-state cleanup (real Owner can now register) ---");
  try {
    await call("/api/owner", { method: "POST", body: { action: "logout" }, cookie });
  } catch (cause) {
    log(`cleanup_logout_note=${(cause instanceof Error ? cause.message : String(cause))} (local files are still removed below)`);
  }
  let removedOwner = false;
  let removedChat = false;
  try {
    if (fs.existsSync(OWNER_FILE)) {
      fs.unlinkSync(OWNER_FILE);
      removedOwner = true;
    }
    if (fs.existsSync(CHAT_FILE)) {
      fs.unlinkSync(CHAT_FILE);
      removedChat = true;
    }
  } catch {
    /* ignore */
  }
  let finalOwner = { json: {} };
  try {
    finalOwner = await call("/api/owner");
  } catch (cause) {
    log(`final_status_note=${(cause instanceof Error ? cause.message : String(cause))}`);
  }
  log(`removedOwnerFile=${removedOwner} removedChatFile=${removedChat} final_registered=${finalOwner.json.registered}`);
  check("test Owner account removed → real Owner can register themselves", removedOwner && finalOwner.json.registered === false && finalOwner.json.authenticated === false);
  check("test conversation removed (no simulated history left behind)", removedChat && !fs.existsSync(CHAT_FILE));
  check("no password value appears in this evidence file", !lines.join("\n").includes(TEST_PASSWORD));
  log("");

  log(`OWNER_CHAT_TESTS_PASS=${PASS}`);
  log(`OWNER_CHAT_TESTS_FAIL=${FAIL}`);
  log(`OWNER_CHAT_VERIFICATION_DONE=${STAMP}`);
  log("HONESTY=Real commands/jobs/events/tests/results/reviews. 0 AI models connected, 0 model calls, 0 external API calls, 0 emails, 0 purchases, 0 deploys. AI developer execution BLOCKED, NOT simulated. NOT production-ready.");
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = FAIL === 0 ? 0 : 1;
}

main().catch((error) => {
  log(`FATAL ${error instanceof Error ? error.stack || error.message : String(error)}`);
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = 1;
});
