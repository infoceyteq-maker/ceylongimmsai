/**
 * GIMMS — Developer Team CI verification (REAL local tests, CI-safe).
 *
 * Unlike scripts/verify-owner-chat.mjs this harness makes NO assertions about
 * `git status` (in CI the tree is clean because files are already committed).
 * It still performs REAL work: Owner registration/login, a real chat command,
 * real job transitions, real local checks/tests, real SSE events, real Owner
 * review, real connection probes and honesty regression.
 *
 * Requires a running dev server (CI starts `npm run dev` first).
 * Writes developer-team-ci-verification.txt. Cleanup removes local test state.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "developer-team-ci-verification.txt");
const OWNER_FILE = path.join(process.cwd(), "data", "gimms-owner.json");
const CHAT_FILE = path.join(process.cwd(), "data", "gimms-chat.json");
const TEST_PASSWORD = crypto.randomBytes(24).toString("hex"); // never printed
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
  const headers = { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(BASE + target, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
      break;
    } catch (cause) {
      if (attempt === 3) throw cause;
      await sleep(300);
    }
  }
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  return { status: response.status, json, text, setCookies };
}
function cookieFrom(setCookies) {
  for (const raw of setCookies || []) {
    const pair = String(raw).split(";")[0];
    if (pair.startsWith("gimms_owner_session=")) return pair;
  }
  return "";
}

async function captureSse(cookie, trigger, durationMs = 3000) {
  const controller = new AbortController();
  let raw = "";
  let httpStatus = 0;
  const task = (async () => {
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
  await sleep(600);
  const result = await trigger();
  await sleep(Math.max(0, durationMs - 600));
  controller.abort();
  await Promise.race([task, sleep(500)]);
  return { raw, httpStatus, result };
}

async function main() {
  log(`DEV_TEAM_CI_BASE=${BASE}`);
  log(`DEV_TEAM_CI_STAMP=${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`);
  log("SCOPE=Real Developer Team core verification (CI-safe, no git-status assertions)");
  log("TEST_PASSWORD=generated locally; NEVER printed");
  log("");

  for (const file of [OWNER_FILE, CHAT_FILE]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }

  // --- 1. Developer Team connection layer -----------------------------------
  log("--- 1. Connection activation layer ---");
  const devTeam = await call("/api/developer-team");
  const d = devTeam.json;
  log(`dev_team status=${d.readiness?.status} connected=${d.summary?.connected} blocked=${d.summary?.blocked} aiModels=${d.summary?.aiModelsConnected}`);
  check("Developer Team endpoint returns 200", devTeam.status === 200 && d.ok === true);
  check("real connections > 0 and AI models connected = 0", d.summary?.connected >= 5 && d.summary?.aiModelsConnected === 0);
  check("0 credential values / 0 emails / 0 purchases / 0 deploys", d.honesty?.credentialValuesShown === 0 && d.honesty?.emailsSent === 0 && d.honesty?.purchasesMade === 0 && d.honesty?.deploymentsPerformed === 0);
  check("activation layer is fail-closed", d.summary?.credentialsRequestedInChat === 0 && d.summary?.personalAccountsConnected === 0);

  const probes = await call("/api/developer-team", { method: "POST", body: { action: "probe-all" } });
  const probeResults = probes.json.results ?? [];
  log(`probes total=${probeResults.length} reachable=${probes.json.reachable} unreachable=${probes.json.unreachable}`);
  check("real network probes executed for every connection", probes.status === 200 && probeResults.length === d.connections?.length);
  check("every probe reports an honest status (no fabricated success)", probeResults.every((item) => typeof item.reachable === "boolean" && item.note));
  const blockedProbe = probeResults.find((item) => item.id === "openai-gpt");
  log(`openai_probe reachable=${blockedProbe?.reachable} http=${blockedProbe?.httpStatus}`);
  check("OpenAI probe result is reported as-is (reachable OR unreachable, never faked)", Boolean(blockedProbe) && (blockedProbe.reachable === true || blockedProbe.reachable === false));

  const activate = await call("/api/developer-team", { method: "POST", body: { action: "activate", id: "openai-gpt", ownerApproved: true, authenticatedTestPassed: true } });
  log(`activate http=${activate.status} activated=${activate.json.activated}`);
  check("activation is REFUSED (no placeholder connection)", activate.status === 403 && activate.json.activated === false && activate.json.connected === false);
  const test = await call("/api/developer-team", { method: "POST", body: { action: "test", id: "openai-gpt" } });
  check("unapproved authenticated test is refused", test.status === 403 && test.json.authenticatedTestPassed === false);
  log("");

  // --- 2. Owner registration + real command ---------------------------------
  log("--- 2. Owner registration + real-time command ---");
  const register = await call("/api/owner", { method: "POST", body: { action: "register", password: TEST_PASSWORD, displayName: "CI Verification Owner" } });
  const cookie = cookieFrom(register.setCookies);
  check("Owner registers with a real local login", register.status === 201 && register.json.ok === true && cookie.startsWith("gimms_owner_session="));
  check("no real Owner details invented", register.json.profile?.email === null && register.json.profile?.realDetailsStored === false);

  const commandText = "GIMMS, register this development task, run the local QA and dependency checks, and report the result for my review.";
  let commandResult = null;
  const sse = await captureSse(cookie, async () => {
    commandResult = await call("/api/chat", { method: "POST", body: { action: "command", text: commandText }, cookie });
    return commandResult;
  });
  const r = commandResult?.json ?? {};
  log(`command http=${commandResult?.status} jobId=${r.jobId} checks=${r.testing?.passed}/${r.testing?.assertions?.length} sse_frames=${(sse.raw.match(/^event:/gm) || []).length}`);
  check("real command creates a real job", commandResult?.status === 200 && r.ok === true && typeof r.jobId === "string");
  check("8 real local operations + 11/11 real assertions", r.execution?.operations?.length === 8 && r.testing?.passed === 11 && r.testing?.failed === 0);
  check("AI developer assignment BLOCKED, not simulated", r.blocked?.connectedModels === 0 && r.result?.aiModelUsed === false);
  check("real SSE progress events", sse.httpStatus === 200 && sse.raw.includes("TASK_CREATED") && sse.raw.includes("AI_DEVELOPER_ASSIGNMENT_BLOCKED"));
  check("honesty: 0 model calls / 0 external calls / 0 emails", r.honesty?.modelCalls === 0 && r.honesty?.externalApiCalls === 0 && r.honesty?.emailsSent === 0);

  const overview = await call("/api/chat", { cookie });
  check("conversation + job persisted, job at APPROVAL", overview.json.snapshot?.counts.messages === 2 && overview.json.jobs?.[0]?.status === "APPROVAL");
  const review = await call("/api/chat", { method: "POST", body: { action: "review", jobId: r.jobId, decision: "APPROVED_LOCAL_RECORD_ONLY" }, cookie });
  check("real versioned Owner review", review.status === 200 && review.json.review?.resultVersion === r.result?.sha256);
  log("");

  // --- 3. Honesty regression ------------------------------------------------
  log("--- 3. Honesty regression ---");
  const skills = await call("/api/skills");
  check("114 local skills unchanged", skills.json.summary?.total === 114 && skills.json.summary?.requiresExternal === 0);
  const connect = await call("/api/connect");
  check("/api/connect still 0", connect.json.connected === 0);
  const bootstrap = await call("/api/bootstrap");
  check("demo provider / MANUAL publishing", bootstrap.json.provider === "demo" && bootstrap.json.publishing === "MANUAL");
  const depts = await call("/api/departments");
  check("registry 10/7/3/69/156 unchanged", depts.json.summary?.total === 10 && depts.json.summary?.divisions === 69 && depts.json.summary?.roles === 156);
  const registry = await call("/api/skills-tools");
  check("Skills & Tools Registry: 0 AI SDKs / 0 new packages", registry.json.dependencyCheck?.aiSdkInstalled?.length === 0 && registry.json.dependencyCheck?.newPackagesInstalled === 0);
  check("no .env.local", !fs.existsSync(path.join(process.cwd(), ".env.local")));
  for (const page of ["/", "/chat", "/developer-team"]) {
    const res = await call(page);
    log(`page ${page} http=${res.status}`);
    check(`page ${page} served`, res.status === 200);
  }
  log("");

  // --- 4. cleanup ------------------------------------------------------------
  log("--- 4. Cleanup ---");
  try {
    await call("/api/owner", { method: "POST", body: { action: "logout" }, cookie });
  } catch {
    /* local files still removed */
  }
  for (const file of [OWNER_FILE, CHAT_FILE]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
  check("local test Owner/chat state removed", !fs.existsSync(OWNER_FILE) && !fs.existsSync(CHAT_FILE));
  check("no password value in evidence", !lines.join("\n").includes(TEST_PASSWORD));
  log("");

  log(`DEV_TEAM_CI_TESTS_PASS=${PASS}`);
  log(`DEV_TEAM_CI_TESTS_FAIL=${FAIL}`);
  log("HONESTY=Real connections/probes/jobs/tests/events/reviews. 0 AI models connected, 0 emails, 0 purchases, 0 deploys, no simulated success.");
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = FAIL === 0 ? 0 : 1;
}

main().catch((error) => {
  log(`FATAL ${error instanceof Error ? error.stack || error.message : String(error)}`);
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = 1;
});
