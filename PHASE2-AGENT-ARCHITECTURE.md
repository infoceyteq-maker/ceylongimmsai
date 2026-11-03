# PHASE 2 — GIMMS Auto-Pilot: Architecture

**Status:** built and tested (40/40 harness assertions pass). **Not deployed** — nobody can deploy this for you without a worker host and a decision (§7).
**Date:** 2026-11-03

---

## 0. Read this first — the part you asked for, and the part that has a problem

You asked for an agent that **simulates human mouse movements, clicks, scrolling and typing** on social media to *"navigate to social media platforms, send requests, leave optimized comments, data gathering, and execute daily digital marketing workflows."*

**Data gathering: built.** The agent navigates, reads, extracts and screenshots real pages in a real headless Chromium.

**Human input simulation: built, as specified.** Curved Bézier pointer paths with eased velocity, hover-before-click with dwell, per-character typing with bigram-aware latency and self-corrected typos, eased multi-event scrolling, idle beats. `agent-worker/src/human.js`.

**"Send requests and leave comments automatically": deliberately refused, in code.**

Not because it is hard — it is one Playwright call. Because of what it does to you:

1. **It breaches the terms of every platform in scope.** LinkedIn, X, Facebook, Instagram and TikTok all prohibit automated interaction that mimics a human, and specifically prohibit automated commenting, connection requests and messaging. Their detection is not naive: behavioural analytics, device fingerprinting, TLS/JA3 fingerprinting and account-graph analysis.
2. **The penalty lands on your account, not the software's.** Enforcements are per-account and usually permanent. `info.ceyteq@gmail.com`'s LinkedIn history, connections and company page are the asset at risk.
3. **It cannot be made reliable.** When detection and evasion meet, evasion loses periodically by design. An agent that gets your account restricted on week three is worse than no agent.
4. **The compliant path exists and is better.** LinkedIn, X and Meta all have official APIs for posting and messaging. Those are rate-limited, permanent and supported.

So the build draws a hard line, and the line is executable:

| Capability | Status |
|---|---|
| Navigate allowlisted sites in a real browser | ✅ built |
| Human-like mouse/scroll/typing | ✅ built |
| Read + extract structured page data | ✅ built |
| Screenshot evidence | ✅ built |
| **Compose** a post/comment in the browser, fully typed, **stopped before submit** | ✅ built (default for social) |
| Fill a form up to the final submit and stop | ✅ built |
| Submit a comment / send a connection request / post unattended | ❌ **`BLOCKED_BY_POLICY`** |
| Type a password or 2FA code anywhere | ❌ **`BLOCKED_BY_POLICY`** |

If you still want outbound enabled, you can — `AGENT_ALLOW_OUTBOUND=linkedin` plus `AGENT_OPERATOR_ATTESTED=1`. Both must be set, both are off by default, and the refusal you just read is what you are agreeing to overrule. I recommend against it; see §7 for the alternative that gets you 90% of the value with none of the ban risk.

---

## 1. Why Vercel cannot run this (the constraint you asked about)

| Limit | Vercel Hobby | Vercel Pro | A browsing session needs |
|---|---|---|---|
| Function max duration | **60 s** | 300 s | 60–240 s, and the plan permits more |
| Memory | 1024 MB | 1024–3008 MB | ~1 GB for Chromium + one page |
| Filesystem | read-only, ephemeral `/tmp` | same | writable profile, cached browser |
| Binary size | 250 MB unzipped | 250 MB unzipped | Chromium alone is ~170 MB compressed |
| Long-lived connection | not supported | not supported | a browser is a process, not a request |

`chromium` cannot be bundled into a Vercel function — it exceeds the size limit and needs system libraries the runtime does not ship. Even with `@sparticuz/chromium` (Lambda-only), you would be re-launching a browser on every request and paying 3–8 s of cold-start per job.

**Conclusion: the browser must live outside Vercel.** Vercel stays the control plane — it authenticates, plans, stores and audits. A separate worker is the execution plane.

---

## 2. The architecture

```
┌─────────────────────────┐
│ Owner (browser)         │
│ /admin/auto-pilot       │  types a command, reads the plan,
│ /admin/login            │  approves, watches status
└───────────┬─────────────┘
            │ https + Owner session cookie (__Host-, httpOnly)
            ▼
┌─────────────────────────────────────────────────────────────┐
│ VERCEL — control plane (this repo)                          │
│                                                             │
│  proxy.ts            headers + first-line /admin gate       │
│  /api/admin/agent    plan · approve · run · cancel          │
│      ├── lib/agent/planner.ts   command → closed step plan   │
│      ├── lib/agent/policy.ts    allowlist + TOS gate         │
│      ├── lib/agent/store.ts     jobs (Supabase / file)       │
│      └── lib/agent/dispatcher.ts per-job lease, 15 s timeout │
│                                                             │
│  /api/agent/callback  ← worker reports progress + result     │
│      auth: Bearer <per-job lease>, single use, 10 min TTL    │
└───────────┬──────────────────────────────▲──────────────────┘
            │ POST /run                    │ POST callback
            │ Bearer WORKER_SECRET         │ Bearer <lease>
            ▼                              │
┌─────────────────────────────────────────────────────────────┐
│ AGENT WORKER (agent-worker/) — Fly.io / Railway / Render     │
│                                                             │
│  src/server.js   http listener, re-validates the plan        │
│  src/runner.js   CLOSED interpreter over the step DSL        │
│  src/human.js    Bézier pointer, typed keystrokes, eased scroll│
│  headless Chromium (playwright-core)                         │
└─────────────────────────────────────────────────────────────┘
```

**Three properties this buys you:**

1. **The request never waits for the browser.** `/api/admin/agent` returns `202` in milliseconds. The worker runs for minutes and reports to the callback. Vercel's timeout is irrelevant.
2. **A compromised worker cannot escalate.** It holds `WORKER_SECRET` (outbound only) and one job's lease. It cannot create jobs, approve jobs, read another job, or touch `hub_state`. The worst it can do is mark its own job failed.
3. **A compromised Vercel instance cannot drive a browser indefinitely.** Plans are capped at 60 steps / 4 minutes, and the worker re-enforces both.

### Storage: why Supabase is required

A job is dispatched from instance A and its callback lands on instance B. Process memory and `/tmp` cannot bridge that gap. So `lib/agent/store.ts` uses Supabase (`supabase/agent-schema.sql`) and falls back to file → memory, **reporting `durable: false`** when it does. The console shows this in red. Do not skip the SQL.

---

## 3. Deploy the worker — Codespaces bash, no local terminal

You have no working PowerShell. Every command below runs in **GitHub Codespaces** (`github.com` → your repo → Code → Codespaces) or the Codespaces terminal. All bash. Nothing installs on your Windows machine.

### Option A — Fly.io (recommended: free allowance, scale-to-zero, closest region to Colombo)

```bash
# 1. Install the CLI (Codespaces only — nothing touches your machine)
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="/home/codespace/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

# 2. Sign in (opens a browser flow)
fly auth login

# 3. Create the app from the committed config, without deploying yet
cd agent-worker
fly launch --no-deploy --copy-config --name gimms-agent-worker

# 4. Generate and store the shared secret. Copy the output — you need it twice.
SECRET=$(openssl rand -hex 32)
echo "AGENT_WORKER_SECRET=$SECRET"
fly secrets set WORKER_SECRET="$SECRET"

# 5. Deploy
fly deploy

# 6. Prove it is alive
curl -s https://gimms-agent-worker.fly.dev/health
```

### Option B — Railway / Render (web UI only, zero terminal)

1. New project → Deploy from GitHub repo → root directory `agent-worker`.
2. Railway/Render detect the `Dockerfile` automatically.
3. Add environment variable `WORKER_SECRET` = a 32+ character random string.
4. Deploy; copy the public URL.

### Then wire it into Vercel (web UI only)

Vercel → project `ai-gimms-hub` → Settings → Environment Variables → add for **Production and Preview**:

| Name | Value |
|---|---|
| `AGENT_WORKER_URL` | `https://gimms-agent-worker.fly.dev` (no trailing slash) |
| `AGENT_WORKER_SECRET` | the same secret from step 4 |
| `GIMMS_PUBLIC_URL` | `https://ai-gimms-hub.vercel.app` |
| `OWNER_BOOTSTRAP_TOKEN` | `openssl rand -hex 32` — **required**, see Phase 1 §4 |

Then: Supabase → SQL Editor → paste `supabase/agent-schema.sql` → Run.

Finally redeploy (Vercel → Deployments → ⋯ → Redeploy). Visit `/admin/auto-pilot`: the "Browser worker" tile must read **CONFIGURED** and storage must read **SUPABASE**.

---

## 4. The plan DSL — a closed instruction set

A plan is *data*, never code. `agent-worker/src/runner.js` switches over a fixed op list; there is no `eval`, no `new Function`, no shell. An injected page cannot emit a new instruction because there is nowhere for one to go.

```
goto · waitFor · humanClick · humanHover · humanType · humanScroll
selectOption · press · wait · humanPause · extract · screenshot
assertVisible · assertText
```

A read-only plan, exactly as produced by the real app:

```
goto → waitFor → humanPause → humanScroll → humanPause
     → extract(page) → extract(headings) → extract(links) → screenshot(page-full)
```

A compose-only social plan adds `humanClick` on the composer, `humanType` with the body, and a screenshot proving it is filled **and unsent**. There is no submit step, and `press: Enter` is explicitly rejected by the harness.

---

## 5. Policy gate — every check is executable

Run before a job is stored, and **again** before dispatch (environment flags may have changed in between):

| Check | Refuses when |
|---|---|
| `HOST_ALLOWLIST` | target not in `ALLOWED_HOSTS` |
| `STEP_OPS_CLOSED` | any op outside the 15 above |
| `STEP_BUDGET` | 0 or >60 steps |
| `STEP_URLS_ALLOWLISTED` | an in-plan `goto` escapes the allowlist |
| `STEP_TIMEOUTS_BOUNDED` | any step > 5 min |
| `NO_CREDENTIAL_AUTOMATION` | a selector targets password / 2FA / OTP / recovery-code |
| `OUTBOUND_CLASSIFICATION` | decides `requiresApproval` |
| `PLATFORM_OPT_IN` | outbound and platform not in `AGENT_ALLOW_OUTBOUND` |
| `OPERATOR_ATTESTATION` | outbound and `AGENT_OPERATOR_ATTESTED !== "1"` |

**Hard-blocked regardless of configuration** — credential and control systems the agent must never touch: `vercel.com`, `github.com`, `supabase.co`, `accounts.google.com`, `login.microsoftonline.com`, `paypal.com`, `stripe.com`, `binance.com`, any host containing `bank`.

---

## 6. Where an LLM would go — and where it must not

You described a text command → action agent. Today the planner is a **deterministic rule engine**. That is a deliberate safety choice, not a shortcut: an LLM that emits *step lists* is an unbounded instruction channel in front of a real browser. A prompt injection in a scraped page becomes arbitrary clicking.

**The safe seam, when you want natural-language breadth:**

```
Owner text ──► LLM intent classifier ──► ONE of a closed enum
                                          { navigate, research.extract, social.draft,
                                            social.engage, form.submit }
                       │
                       ▼
              deterministic step builder   (unchanged today's code)
                       │
                       ▼
                policy gate   (unchanged)
```

The model picks *which known task* to run. It never picks *which clicks to make*. `codeFence`-style output parsing, JSON schema validation, and a strict enum mean a compromised or hallucinating model can only choose a safe task or fail. Implement this in `lib/agent/planner.ts` behind `AGENT_PLANNER=llm`, keeping the rule engine as the fallback.

`extract` results are also the natural place for an LLM to summarise gathered pages — read-only, post-hoc, no instructions flow back into the browser. That is the highest-value, lowest-risk place to add a model.

---

## 7. What "human simulation" does and does not buy you

**It does:** defeat naive "did the click teleport?" heuristics and reduce the robotic-timing signal that simple bot detectors flag. That is genuine for low-stakes reading and form-filling.

**It does not:**
- defeat behavioural analytics, account-graph analysis, or TLS/device fingerprinting;
- make automated commenting compliant with LinkedIn/X/Meta terms — it makes it a *successful TOS violation*, which is the worst combination: it works long enough for the account to accumulate history, then gets it removed;
- scale — one lease at a time per worker, by design.

**The compliant path for your actual goal** (daily digital marketing workflows, engagement, outreach):

| Goal | Compliant mechanism |
|---|---|
| Post to LinkedIn / X / Facebook | Official APIs with an app + OAuth token; post from `/publishing` |
| Read/analyse public pages | This agent — already built, already safe |
| Comment / reply at scale | **No compliant route.** Human-in-the-loop: agent drafts, you paste, you post. 2 minutes per post. |
| Connection requests | LinkedIn API does not expose it. Manual only. |
| DM outreach | Official API where the platform offers it; manual otherwise. |

The compose-only mode is built for exactly this: the agent opens the composer, types the optimized copy with human timing, screenshots it, and stops. You glance at it and press the last key. You keep the speed of automation and the account safety of a human, and you never trigger an enforcement action.

---

## 8. Verification — real output

`node scripts/verify-agent.mjs` against a running dev server:

```
AGENT_FLOW_TESTS_PASS=40
AGENT_FLOW_TESTS_FAIL=0
```

Covering: 401 for anonymous, 403 for cross-origin-with-session, plan generation, allowlist refusal, hard-block refusal, outbound → `BLOCKED_BY_POLICY` with `PLATFORM_OPT_IN` + `OPERATOR_ATTESTATION` codes, compose → `AWAITING_APPROVAL` with no submit step, honest 503 when no worker is configured, callback rejecting missing/wrong leases, cancel, persistence, and 401 after logout.

---

## 9. Open items — stated, not buried

| # | Item | Owner action |
|---|---|---|
| 1 | Worker not deployed | Fly/Railway per §3. Until then the console honestly reads **NOT CONFIGURED**. |
| 2 | `supabase/agent-schema.sql` not applied | Supabase SQL Editor, one paste. Until then `durable: false`. |
| 3 | Durable Owner identity (Phase 1 §4) | Choose table vs Supabase Auth. **Blocks trusting the admin gate in production.** |
| 4 | Screenshots returned as base64 data URLs | Works, but large. Move to Supabase Storage + signed URLs before heavy use. |
| 5 | No LLM planner | §6, when you want NL breadth. Keep the rule engine as fallback. |
| 6 | Worker has no per-tenant isolation | Single-tenant by design. A second owner needs a second worker or a `tenant` column plus profile isolation. |
| 7 | No replay/retry UI | One retry exists (`FAILED → DISPATCHED`, `maxAttempts: 2`). A UI button is a small addition. |

---

## 10. File map

```
proxy.ts                              headers + /admin gate (was missing entirely)
lib/env.ts                            lazy, presence-only env access
lib/cookie-names.ts                   __Host- cookie constants (Edge-safe)
lib/request-guard.ts                  CSRF: Origin / Sec-Fetch-Site / Referer
lib/rate-limit.ts                     sliding window + lockout (per-instance, stated)
lib/exec-guard.ts                     the only module allowed to spawn
lib/api-auth.ts                       requireOwnerWrite() for every mutation

lib/agent/types.ts                    job + step contract, three trust domains
lib/agent/policy.ts                   allowlist, TOS gate, hard blocks
lib/agent/planner.ts                  command → plan (deterministic)
lib/agent/store.ts                    Supabase → file → memory, durability reported
lib/agent/dispatcher.ts               per-job lease, worker call

app/api/admin/agent/route.ts          Owner-only control API
app/api/admin/security/route.ts       live route-auth audit + posture
app/api/agent/callback/route.ts       worker callback (lease auth)
app/admin/login/page.tsx              Owner sign-in
app/admin/auto-pilot/page.tsx         the console

agent-worker/src/server.js            http entry, re-validates plans
agent-worker/src/runner.js            closed interpreter
agent-worker/src/human.js             human input simulation
agent-worker/Dockerfile               browser image
agent-worker/fly.toml                 deploy config
agent-worker/.env.example             worker secrets template
supabase/agent-schema.sql             RLS-locked job + audit tables
scripts/verify-agent.mjs              40 assertions
```
