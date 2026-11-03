/**
 * GIMMS AUTO-PILOT WORKER — HTTP ENTRYPOINT
 *
 * A tiny Node service that holds a real headless browser. It is deployed SEPARATELY
 * from Vercel (Fly.io / Railway / Render / a small VPS) because Vercel functions
 * cannot run a browser session for several minutes.
 *
 * ── SECURITY MODEL ─────────────────────────────────────────────────────────────
 *   · POST /run requires `Authorization: Bearer ${WORKER_SECRET}`. Without it, 401.
 *   · The plan is validated again here: destination allowlist, closed op set,
 *     step budget. Vercel's checks are not trusted, they are re-done.
 *   · The browser runs with no persistent profile sharing your personal logins.
 *     `USER_DATA_DIR` is optional; if unset, every run is a clean context.
 *   · Screenshots are returned inline as base64 ONLY when under a size cap;
 *     otherwise they are dropped and reported as metadata.
 *   · No inbound port other than this HTTP listener. No shell. No filesystem writes
 *     outside USER_DATA_DIR.
 *
 * ── ENDPOINTS ──────────────────────────────────────────────────────────────────
 *   GET  /health   → { ok, browser, jobs }
 *   POST /run      → starts a job asynchronously, returns 202 immediately
 *   GET  /job/:id  → inspect a running/completed job (worker-secret required)
 */

import http from "node:http";
import crypto from "node:crypto";
import { chromium } from "playwright-core";
import { runPlan, hostAllowed } from "./runner.js";

const PORT = Number(process.env.PORT || 8080);
const WORKER_SECRET = process.env.WORKER_SECRET || "";
const MAX_STEPS = 60;
const MAX_DURATION_MS = Number(process.env.MAX_DURATION_MS || 4 * 60 * 1000);
const MAX_JOBS = 20;
const MAX_SCREENSHOT_INLINE_BYTES = 700_000;

if (!WORKER_SECRET || WORKER_SECRET.length < 24) {
  console.error("[worker] FATAL: WORKER_SECRET must be set and at least 24 characters. Refusing to start.");
  process.exit(1);
}

/** jobId → { startedAt, status, log, result } */
const jobs = new Map();
let activeCount = 0;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function authorised(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const provided = Buffer.from(match[1].trim());
  const expected = Buffer.from(WORKER_SECRET);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

async function readBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (cause) {
        reject(new Error(`invalid JSON: ${cause.message}`));
      }
    });
    req.on("error", reject);
  });
}

/** Re-validate everything. The worker never trusts the caller. */
function validatePlan(body) {
  const errors = [];
  if (!body || typeof body !== "object") return { ok: false, errors: ["body must be an object"] };
  if (!/^[a-z0-9_]{4,64}$/i.test(String(body.jobId || ""))) errors.push("jobId missing or malformed");
  if (!hostAllowed(String(body.startUrl || ""))) errors.push(`startUrl not allowlisted: ${body.startUrl}`);
  if (!Array.isArray(body.steps) || body.steps.length === 0) errors.push("steps must be a non-empty array");
  if (Array.isArray(body.steps) && body.steps.length > MAX_STEPS) errors.push(`steps exceeds ${MAX_STEPS}`);
  if (Array.isArray(body.steps)) {
    for (const step of body.steps) {
      if (step.op === "goto" && !hostAllowed(String(step.url || ""))) {
        errors.push(`step navigation not allowlisted: ${step.url}`);
      }
    }
  }
  if (!body.callback || typeof body.callback.url !== "string" || !/^https:\/\//.test(body.callback.url)) {
    errors.push("callback.url must be an https URL");
  }
  if (!body.callback?.token) errors.push("callback.token missing");
  return { ok: errors.length === 0, errors };
}

async function reportProgress(callback, jobId, level, message) {
  if (!callback?.url) return;
  await fetch(callback.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${callback.token}` },
    body: JSON.stringify({ jobId, phase: "progress", level, message }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

async function executeJob(body) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(Number(body.limits?.maxDurationMs || MAX_DURATION_MS), MAX_DURATION_MS);
  const log = [];
  const state = jobs.get(body.jobId);
  let browser = null;
  let context = null;

  try {
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== "0",
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    context = await browser.newContext({
      viewport: { width: 1366, height: 860 },
      deviceScaleFactor: 1,
      locale: "en-LK",
      timezoneId: "Asia/Colombo",
      // A realistic, current UA. Update this when Chromium updates.
      userAgent:
        process.env.USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      permissions: [],
      ...(process.env.USER_DATA_DIR ? { storageState: process.env.USER_DATA_DIR } : {}),
    });

    // Reduce the most obvious headless tells. Not a guarantee — see the architecture doc.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      window.chrome = window.chrome || { runtime: {} };
    });

    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    if (state) {
      state.status = "RUNNING";
      state.log = log;
    }

    const context_ = await runPlan({
      page,
      plan: { startUrl: body.startUrl, steps: body.steps },
      log,
      deadline,
      onProgress: (level, message) => reportProgress(body.callback, body.jobId, level, message),
    });

    const finalUrl = page.url();
    let title = "";
    try {
      title = await page.title();
    } catch {
      /* page may have navigated away */
    }

    const screenshots = context_.screenshots.map((shot) => {
      const base64 = shot.buffer.toString("base64");
      const inline = shot.buffer.length <= MAX_SCREENSHOT_INLINE_BYTES;
      return {
        name: shot.name,
        bytes: shot.bytes,
        ...(inline ? { url: `data:image/png;base64,${base64}` } : {}),
      };
    });

    const result = {
      ok: true,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      finalUrl,
      title,
      extracted: context_.extracted,
      screenshots,
      log,
    };

    if (state) {
      state.status = "COMPLETED";
      state.result = result;
    }
    await postResult(body.callback, body.jobId, result);
  } catch (cause) {
    const result = {
      ok: false,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      finalUrl: "",
      title: "",
      extracted: {},
      screenshots: [],
      log,
      error: cause instanceof Error ? cause.message : String(cause),
    };
    if (state) {
      state.status = "FAILED";
      state.result = result;
    }
    await postResult(body.callback, body.jobId, result);
  } finally {
    try {
      await context?.close();
    } catch {
      /* ignore */
    }
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    activeCount = Math.max(0, activeCount - 1);
  }
}

async function postResult(callback, jobId, result) {
  if (!callback?.url) return;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(callback.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${callback.token}` },
        body: JSON.stringify({ jobId, phase: "result", result }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
  console.error(`[worker] failed to deliver result for ${jobId}`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, {
        ok: true,
        browser: "chromium (playwright-core)",
        active: activeCount,
        jobs: jobs.size,
        maxConcurrent: Number(process.env.MAX_CONCURRENT || 2),
        uptimeSeconds: Math.round(process.uptime()),
      });
    }

    if (req.method === "POST" && req.url === "/run") {
      if (!authorised(req)) return json(res, 401, { accepted: false, error: "invalid worker secret" });

      if (activeCount >= Number(process.env.MAX_CONCURRENT || 2)) {
        return json(res, 429, { accepted: false, error: "worker at capacity; retry shortly" });
      }

      const body = await readBody(req);
      const check = validatePlan(body);
      if (!check.ok) return json(res, 400, { accepted: false, error: check.errors.join("; ") });

      const workerId = `${body.jobId}-${crypto.randomBytes(3).toString("hex")}`;
      jobs.set(body.jobId, { workerId, startedAt: new Date().toISOString(), status: "ACCEPTED", log: [], result: null });
      activeCount += 1;

      // Fire-and-forget: the HTTP response returns immediately, which is the whole
      // point — a serverless caller cannot wait minutes for a browser.
      executeJob(body).catch((cause) => console.error("[worker] execution crashed:", cause));
      return json(res, 202, { accepted: true, workerId });
    }

    if (req.method === "GET" && req.url?.startsWith("/job/")) {
      if (!authorised(req)) return json(res, 401, { error: "invalid worker secret" });
      const jobId = decodeURIComponent(req.url.slice(5));
      const job = jobs.get(jobId);
      if (!job) return json(res, 404, { error: "unknown job" });
      return json(res, 200, job);
    }

    return json(res, 404, { error: "not found" });
  } catch (cause) {
    return json(res, 400, { error: cause instanceof Error ? cause.message : String(cause) });
  }
});

// Trim the in-memory job table so a long-lived worker cannot grow without bound.
setInterval(() => {
  if (jobs.size <= MAX_JOBS) return;
  const entries = [...jobs.entries()].sort((a, b) => (a[1].startedAt < b[1].startedAt ? -1 : 1));
  for (const [key] of entries.slice(0, jobs.size - MAX_JOBS)) jobs.delete(key);
}, 60_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[worker] listening on 0.0.0.0:${PORT}`);
});
