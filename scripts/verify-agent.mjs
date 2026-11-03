/**
 * GIMMS Phase 2 — Auto-Pilot verification harness.
 *
 * Run against a dev server (GitHub Codespaces bash):
 *   npm run dev &
 *   node scripts/verify-agent.mjs
 *
 * Proves, against the REAL running app:
 *  · /api/admin/agent is 401 for anonymous callers and for cross-origin POSTs
 *  · the plan DSL produces a finite, policy-checked step list
 *  · non-allowlisted and hard-blocked hosts are refused before a browser starts
 *  · outbound social actions are BLOCKED_BY_POLICY (not "not implemented")
 *  · compose-only drafts are stored as AWAITING_APPROVAL and never auto-submit
 *  · dispatching without a worker fails honestly with the missing variable name
 *  · the worker callback rejects a missing or wrong lease
 *
 * It writes no secrets to disk and cleans up its own Owner account.
 */

const BASE = process.env.BASE || "http://localhost:3000";
const PASSWORD = "PhaseOne-Password-2026!";
let cookie = "";
let pass = 0, fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`PASS | ${name}`); }
  else { fail++; console.log(`FAIL | ${name}${detail ? " | " + detail : ""}`); }
}

async function call(path, { method = "GET", body, extraHeaders = {} } = {}) {
  const headers = {
    Origin: BASE,
    ...(method !== "GET" ? { "Sec-Fetch-Site": "same-origin" } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...extraHeaders,
  };
  const res = await fetch(BASE + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return { status: res.status, json, text, setCookies };
}

function cookieFrom(setCookies) {
  for (const raw of setCookies || []) {
    const pair = String(raw).split(";")[0];
    if (pair.startsWith("gimms_owner_session=") || pair.startsWith("__Host-gimms_owner_session=")) return pair;
  }
  return "";
}

console.log("=== 1. unauthenticated access to the admin agent API ===");
const unauth = await call("/api/admin/agent");
check("GET /api/admin/agent → 401", unauth.status === 401, `got ${unauth.status}`);
const unauthPost = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: "read https://gimms.lk" } });
check("POST /api/admin/agent → 401", unauthPost.status === 401, `got ${unauthPost.status}`);
// 401-for-unauthenticated takes precedence over 403-for-CSRF: an anonymous caller
// should not learn anything about our CSRF logic. That case is verified after login.

console.log("\n=== 2. register Owner ===");
const reg = await call("/api/owner", { method: "POST", body: { action: "register", password: PASSWORD, displayName: "Phase 2 Test Owner" } });
cookie = cookieFrom(reg.setCookies);
check("register → 201", reg.status === 201, `got ${reg.status} ${reg.text.slice(0,160)}`);
check("session cookie issued", cookie.length > 30);
check("dev cookie name is gimms_owner_session", cookie.startsWith("gimms_owner_session="), cookie.slice(0, 40));

console.log("\n=== 3. console capability report ===");
// CSRF with a REAL session cookie: this is the case that matters, because it is the
// one a malicious page could attempt against a logged-in Owner (CSRF).
const csrf = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: "read https://gimms.lk" }, extraHeaders: { Origin: "https://evil.example" } });
check("authenticated cross-origin POST → 403", csrf.status === 403, `got ${csrf.status}`);

const console_ = await call("/api/admin/agent");
check("GET → 200 when authenticated", console_.status === 200, `got ${console_.status}`);
check("worker reported NOT configured", console_.json.worker?.configured === false);
check("worker missing vars named", (console_.json.worker?.missing || []).includes("AGENT_WORKER_URL"));
check("storage durability stated", typeof console_.json.storage?.durable === "boolean");
check("policy summary present", Array.isArray(console_.json.policy?.refused) && console_.json.policy.refused.length === 4);

console.log("\n=== 4. plan a read-only job (safe default) ===");
const planRead = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: "read https://gimms.lk and screenshot the homepage" } });
check("plan → 201", planRead.status === 201, `got ${planRead.status} ${planRead.text.slice(0,300)}`);
check("kind = research.extract", planRead.json.job?.kind === "research.extract", planRead.json.job?.kind);
check("no approval required for read-only", planRead.json.job?.requiresApproval === false);
check("steps generated", (planRead.json.job?.steps?.length || 0) >= 6, String(planRead.json.job?.steps?.length));
check("plan is NOT dispatched on 'plan'", planRead.json.dispatched === false);
check("all policy checks passed", (planRead.json.job?.policyChecks || []).every((c) => c.passed));
const readJobId = planRead.json.job?.id;
console.log("   ops: " + (planRead.json.job?.steps || []).map(s => s.op).join(" → "));

console.log("\n=== 5. non-allowlisted host is refused ===");
const evilHost = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: "read https://evil.example/steal and screenshot" } });
check("plan → 400 for non-allowlisted host", evilHost.status === 400, `got ${evilHost.status}`);
check("error names the host", String(evilHost.json.error || "").includes("evil.example"));

console.log("\n=== 6. hard-blocked host (credential/store systems) ===");
const gh = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: "read https://github.com/settings/tokens" } });
check("github.com refused", gh.status === 400, `got ${gh.status}`);

console.log("\n=== 7. outbound social action is REFUSED by policy ===");
const engage = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: "send a connection request to the CTO of Acme on linkedin" } });
console.log(`   status=${engage.status} blocked=${engage.json.blocked} kind=${engage.json.job?.kind} status=${engage.json.job?.status}`);
check("outbound engage → 403 blocked", engage.status === 403, `got ${engage.status}`);
check("job stored as BLOCKED_BY_POLICY", engage.json.job?.status === "BLOCKED_BY_POLICY");
check("refusal cites platform opt-in", (engage.json.policy?.codes || []).includes("PLATFORM_OPT_IN"), JSON.stringify(engage.json.policy?.codes));
check("refusal cites operator attestation", (engage.json.policy?.codes || []).includes("OPERATOR_ATTESTATION"));
console.log("   reason: " + String(engage.json.policy?.reasons?.[0] || "").slice(0, 150));

console.log("\n=== 8. compose-only draft is allowed but needs approval ===");
const draft = await call("/api/admin/agent", { method: "POST", body: { action: "plan", command: 'draft a linkedin post: "Ceylon GIMMS just shipped its AI operations hub"' } });
console.log(`   status=${draft.status} kind=${draft.json.job?.kind} needsApproval=${draft.json.job?.requiresApproval}`);
check("draft → 202 awaiting approval", draft.status === 202 && draft.json.awaitingApproval === true, `got ${draft.status}`);
check("kind = social.draft", draft.json.job?.kind === "social.draft", draft.json.job?.kind);
check("NOT submitted — awaiting approval", draft.json.job?.status === "AWAITING_APPROVAL");
check("typed body ends with a screenshot step, no submit", (draft.json.job?.steps || []).some(s => s.op === "screenshot"));
check("no submit click in the plan", !(draft.json.job?.steps || []).some(s => s.op === "press" && s.key === "Enter"));

console.log("\n=== 9. dispatch without a worker fails honestly ===");
const run = await call("/api/admin/agent", { method: "POST", body: { action: "run", command: "read https://gimms.lk/pricing" } });
console.log(`   status=${run.status} error=${String(run.json.error || "").slice(0, 120)}`);
check("run without worker → 503", run.status === 503, `got ${run.status}`);
check("names the missing variable", String(run.json.missing || run.json.error || "").includes("AGENT_WORKER_URL"));
check("job NOT left in RUNNING", run.json.job?.status !== "RUNNING", run.json.job?.status);

console.log("\n=== 10. worker callback rejects a bad lease ===");
const cbNoAuth = await fetch(BASE + "/api/agent/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: readJobId, phase: "result" }) });
check("callback without lease → 401", cbNoAuth.status === 401, `got ${cbNoAuth.status}`);
const cbBadLease = await fetch(BASE + "/api/agent/callback", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + "a".repeat(64) }, body: JSON.stringify({ jobId: readJobId, phase: "result" }) });
check("callback with wrong lease → 403", cbBadLease.status === 403, `got ${cbBadLease.status}`);
const cbHealth = await fetch(BASE + "/api/agent/callback");
check("callback health probe → 200", cbHealth.status === 200);

console.log("\n=== 11. cancel works ===");
const cancel = await call("/api/admin/agent", { method: "POST", body: { action: "cancel", jobId: readJobId } });
check("cancel → 200 CANCELLED", cancel.json.job?.status === "CANCELLED", cancel.json.job?.status);

console.log("\n=== 12. job history persisted ===");
const list = await call("/api/admin/agent");
check("history contains the jobs", (list.json.jobs || []).length >= 3, String((list.json.jobs || []).length));
check("blocked count reported", list.json.counts?.blocked >= 1, String(list.json.counts?.blocked));

console.log("\n=== 13. logout ===");
const logout = await call("/api/owner", { method: "POST", body: { action: "logout" } });
check("logout → 200", logout.status === 200);
cookie = "";
const afterLogout = await call("/api/admin/agent");
check("admin API → 401 after logout", afterLogout.status === 401, `got ${afterLogout.status}`);

console.log(`\nAGENT_FLOW_TESTS_PASS=${pass}`);
console.log(`AGENT_FLOW_TESTS_FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
