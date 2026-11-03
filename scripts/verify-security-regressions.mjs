/**
 * GIMMS — production-mode security regression harness (LOCAL ONLY by default).
 *
 * Purpose: prove the fixes for the November 2026 security audit fail closed:
 *   - anonymous / forged-session bootstrap requests are NOT authenticated and
 *     do not receive clients or audit records;
 *   - production mutating routes require an Owner session;
 *   - CSRF/origin guards reject cross-origin and missing-origin mutations;
 *   - first-run registration requires OWNER_BOOTSTRAP_TOKEN in production;
 *   - session cookies are __Host- prefixed, Secure, HttpOnly, SameSite=Lax;
 *   - logout and password change revoke existing sessions;
 *   - login abuse protection returns 429 after the configured burst.
 *
 * Safety:
 *   - Refuses non-local BASE unless GIMMS_SECURITY_TEST_ALLOW_REMOTE=1.
 *   - Refuses to run if a real local Owner file already exists.
 *   - Generates a random test password/bootstrap token; never prints either.
 *   - Removes only the test Owner state it created.
 *   - Makes no external API call, no deploy, no production DB write.
 *
 * Run against a local production build:
 *   NODE_ENV=production OWNER_BOOTSTRAP_TOKEN=<random> npm run start -- -p 3011
 *   BASE=http://127.0.0.1:3011 GIMMS_SECURITY_TEST_BOOTSTRAP_TOKEN=<same-random> \
 *     node scripts/verify-security-regressions.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const BOOTSTRAP_TOKEN = process.env.GIMMS_SECURITY_TEST_BOOTSTRAP_TOKEN || "";
const OUT = path.join(process.cwd(), "security-regression-verification.txt");
const OWNER_FILE = path.join(process.cwd(), "data", "gimms-owner.json");
const TEST_PASSWORD = crypto.randomBytes(24).toString("hex");
const NEXT_PASSWORD = crypto.randomBytes(24).toString("hex");
const TEST_IP = "203.0.113.99"; // TEST-NET-3, used only to isolate the rate-limit bucket.

const lines = [];
let PASS = 0;
let FAIL = 0;
let createdOwner = false;

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

async function call(target, { method = "GET", body, cookie, origin = BASE, extraHeaders = {} } = {}) {
  const headers = {
    ...(method !== "GET" ? { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" } : {}),
    ...(origin ? { Origin: origin } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...extraHeaders,
  };
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(BASE + target, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        redirect: "manual",
      });
      break;
    } catch (cause) {
      if (attempt === 3) throw cause;
      await sleep(300);
    }
  }
  const text = await response.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return { status: response.status, headers: response.headers, json, text, setCookies };
}

function cookieFrom(setCookies) {
  for (const raw of setCookies || []) {
    const pair = String(raw).split(";")[0];
    if (pair.startsWith("gimms_owner_session=") || pair.startsWith("__Host-gimms_owner_session=")) return pair;
  }
  return "";
}

function checkAnonymousBootstrap(label, result) {
  check(`${label}: bootstrap HTTP 200`, result.status === 200, `got ${result.status}`);
  check(`${label}: authenticated=false`, result.json.authenticated === false);
  check(`${label}: clients+audit listed as redacted`,
    Array.isArray(result.json.redacted) && result.json.redacted.includes("clients") && result.json.redacted.includes("audit"));
  check(`${label}: clients array absent`, !result.json.state || !Object.prototype.hasOwnProperty.call(result.json.state, "clients"));
  check(`${label}: audit array absent`, !result.json.state || !Object.prototype.hasOwnProperty.call(result.json.state, "audit"));
}

async function main() {
  log(`SECURITY_REGRESSION_BASE=${BASE}`);
  log(`SECURITY_REGRESSION_STAMP=${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`);
  log("SCOPE=local production-mode auth/redaction/CSRF/session regressions; no external calls");
  log(`BOOTSTRAP_TOKEN_PRESENT=${Boolean(BOOTSTRAP_TOKEN)}`);
  log("TEST_PASSWORD=generated locally; NEVER printed");
  log("");

  const baseHost = new URL(BASE).hostname;
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
  if (!localHosts.has(baseHost) && process.env.GIMMS_SECURITY_TEST_ALLOW_REMOTE !== "1") {
    log("FAIL | refusing to run write-capable security tests against a non-local BASE");
    log("Set GIMMS_SECURITY_TEST_ALLOW_REMOTE=1 only for an explicitly approved isolated test target.");
    fs.writeFileSync(OUT, lines.join("\n") + "\n");
    process.exit(2);
  }
  if (fs.existsSync(OWNER_FILE)) {
    log("FAIL | data/gimms-owner.json already exists; refusing to reset a real Owner account");
    fs.writeFileSync(OUT, lines.join("\n") + "\n");
    process.exit(2);
  }

  // --- 1. Anonymous data exposure / bootstrap authorization -----------------
  log("--- 1. Bootstrap redaction and anonymous authorization ---");
  checkAnonymousBootstrap("anonymous", await call("/api/bootstrap"));
  checkAnonymousBootstrap("forged session", await call("/api/bootstrap", {
    cookie: `__Host-gimms_owner_session=${"a".repeat(64)}`,
  }));
  log("");

  // --- 2. Security headers and admin gate -----------------------------------
  log("--- 2. Security headers and admin gate ---");
  const home = await call("/");
  check("Content-Security-Policy present", Boolean(home.headers.get("content-security-policy")));
  check("X-Content-Type-Options nosniff", String(home.headers.get("x-content-type-options")).toLowerCase() === "nosniff");
  check("Referrer-Policy present", Boolean(home.headers.get("referrer-policy")));
  check("Permissions-Policy present", Boolean(home.headers.get("permissions-policy")));
  check("X-Powered-By absent", !home.headers.get("x-powered-by"));
  const adminPage = await call("/admin/auto-pilot");
  check("anonymous /admin/auto-pilot redirects to login", [302, 307, 308].includes(adminPage.status) && String(adminPage.headers.get("location") || "").includes("/admin/login"), `got ${adminPage.status}`);
  const adminApi = await call("/api/admin/security");
  check("anonymous /api/admin/security -> 401", adminApi.status === 401, `got ${adminApi.status}`);
  log("");

  // --- 3. Production registration gate --------------------------------------
  log("--- 3. Production first-run registration gate ---");
  const noToken = await call("/api/owner", { method: "POST", body: { action: "register", password: TEST_PASSWORD } });
  check("registration without bootstrap token -> 403", noToken.status === 403, `got ${noToken.status}`);
  const wrongToken = await call("/api/owner", {
    method: "POST",
    body: { action: "register", password: TEST_PASSWORD },
    extraHeaders: { "x-gimms-bootstrap-token": "wrong-token" },
  });
  check("registration with wrong bootstrap token -> 403", wrongToken.status === 403, `got ${wrongToken.status}`);
  if (!BOOTSTRAP_TOKEN) {
    check("GIMMS_SECURITY_TEST_BOOTSTRAP_TOKEN provided for positive registration test", false);
  } else {
    const register = await call("/api/owner", {
      method: "POST",
      body: { action: "register", password: TEST_PASSWORD, displayName: "Security Regression Owner" },
      extraHeaders: { "x-gimms-bootstrap-token": BOOTSTRAP_TOKEN },
    });
    createdOwner = register.status === 201;
    const cookie = cookieFrom(register.setCookies);
    const rawCookie = (register.setCookies || []).find((item) => item.startsWith("__Host-gimms_owner_session=")) || "";
    check("registration with correct bootstrap token -> 201", register.status === 201, `got ${register.status}`);
    check("registration persisted locally", register.json.persisted === true);
    check("production session cookie is __Host- prefixed", cookie.startsWith("__Host-gimms_owner_session="));
    check("session cookie Secure", /;\s*Secure/i.test(rawCookie));
    check("session cookie HttpOnly", /;\s*HttpOnly/i.test(rawCookie));
    check("session cookie SameSite=Lax", /;\s*SameSite=Lax/i.test(rawCookie));
    check("session cookie Path=/", /;\s*Path=\//i.test(rawCookie));

    const ownerBootstrap = await call("/api/bootstrap", { cookie });
    check("owner bootstrap authenticated=true", ownerBootstrap.status === 200 && ownerBootstrap.json.authenticated === true);
    check("owner bootstrap receives full state", Array.isArray(ownerBootstrap.json.state?.clients) && Array.isArray(ownerBootstrap.json.state?.audit));

    // --- 4. CSRF and production write gates ---------------------------------
    log("");
    log("--- 4. CSRF and production write gates ---");
    const csrf = await call("/api/tasks", { method: "POST", body: {}, cookie, origin: "https://evil.example" });
    check("authenticated cross-origin POST -> 403", csrf.status === 403, `got ${csrf.status}`);
    const missingOrigin = await call("/api/tasks", { method: "POST", body: {}, cookie, origin: null });
    check("authenticated missing-origin POST -> 403", missingOrigin.status === 403, `got ${missingOrigin.status}`);
    for (const target of ["/api/tasks", "/api/jobs", "/api/skills", "/api/dept01", "/api/developer-team", "/api/production/ai-team", "/api/chat", "/api/agent/execute", "/api/agent/comms", "/api/admin/agent"]) {
      const result = await call(target, { method: "POST", body: {} });
      check(`anonymous production POST ${target} -> 401`, result.status === 401, `got ${result.status}`);
    }

    // --- 5. Session revocation / password change -----------------------------
    log("");
    log("--- 5. Session lifecycle ---");
    const logout = await call("/api/owner", { method: "POST", body: { action: "logout" }, cookie });
    check("logout -> 200", logout.status === 200, `got ${logout.status}`);
    checkAnonymousBootstrap("after logout", await call("/api/bootstrap", { cookie }));
    const wrongLogin = await call("/api/owner", { method: "POST", body: { action: "login", password: "definitely-wrong-password" } });
    check("wrong password -> 401", wrongLogin.status === 401, `got ${wrongLogin.status}`);
    const login = await call("/api/owner", { method: "POST", body: { action: "login", password: TEST_PASSWORD } });
    const loginCookie = cookieFrom(login.setCookies);
    check("correct password -> 200 + session", login.status === 200 && Boolean(loginCookie), `got ${login.status}`);
    const changeWrong = await call("/api/owner", {
      method: "POST",
      body: { action: "change-password", currentPassword: "definitely-wrong-password", newPassword: NEXT_PASSWORD },
      cookie: loginCookie,
    });
    check("change-password with wrong current password -> 400", changeWrong.status === 400, `got ${changeWrong.status}`);
    const change = await call("/api/owner", {
      method: "POST",
      body: { action: "change-password", currentPassword: TEST_PASSWORD, newPassword: NEXT_PASSWORD },
      cookie: loginCookie,
    });
    check("change-password -> 200", change.status === 200, `got ${change.status}`);
    checkAnonymousBootstrap("old session after password change", await call("/api/bootstrap", { cookie: loginCookie }));
    const newLogin = await call("/api/owner", { method: "POST", body: { action: "login", password: NEXT_PASSWORD } });
    check("login with new password -> 200", newLogin.status === 200, `got ${newLogin.status}`);

    // --- 6. Login abuse protection -------------------------------------------
    log("");
    log("--- 6. Login abuse protection ---");
    let lastStatus = 0;
    for (let i = 0; i < 9; i += 1) {
      const attempt = await call("/api/owner", {
        method: "POST",
        body: { action: "login", password: "definitely-wrong-password" },
        extraHeaders: { "x-forwarded-for": TEST_IP },
      });
      lastStatus = attempt.status;
    }
    check("repeated failed logins eventually -> 429", lastStatus === 429, `last status ${lastStatus}`);
  }

  // --- 7. Cleanup ------------------------------------------------------------
  log("");
  log("--- 7. Cleanup ---");
  if (createdOwner) {
    try { fs.unlinkSync(OWNER_FILE); } catch { /* ignore */ }
    check("test Owner state removed", !fs.existsSync(OWNER_FILE));
  } else {
    check("no test Owner state left behind", !fs.existsSync(OWNER_FILE));
  }
  check("no password or bootstrap token value printed", !lines.some((line) => line.includes(TEST_PASSWORD) || line.includes(NEXT_PASSWORD) || (BOOTSTRAP_TOKEN && line.includes(BOOTSTRAP_TOKEN))));

  log("");
  log(`SECURITY_REGRESSION_TESTS_PASS=${PASS}`);
  log(`SECURITY_REGRESSION_TESTS_FAIL=${FAIL}`);
  log("HONESTY=Local production-mode tests only. No deploy, no production DB write, no external account connection, no secret value printed.");
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((cause) => {
  log(`FATAL | ${cause instanceof Error ? cause.message : String(cause)}`);
  try { if (createdOwner && fs.existsSync(OWNER_FILE)) fs.unlinkSync(OWNER_FILE); } catch { /* ignore */ }
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(1);
});
