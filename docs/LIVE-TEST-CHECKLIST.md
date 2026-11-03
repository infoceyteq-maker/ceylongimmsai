# LIVE TEST — DEPENDENCY CHECKLIST

**Purpose:** everything you must configure by hand to run the Live Assistant, and the exact steps to trigger it.
**Date:** 2026-11-03 · **App:** Next.js 16.4.3 on Vercel (Hobby) · **Branch tested:** `arena/35c6ad32-ceylongimmsai` (head `05e37d4`, Auto-Pilot v3 merged)

Every command here is **bash for GitHub Codespaces** (repo → `Code ▾` → Codespaces → Create → Terminal). There is no PowerShell and no local-terminal step anywhere in this file. Secrets are entered **only** in Vercel's UI or a vendor console — never in chat, never in a commit.

---

## 0. The blocker is fixed in this working tree — verify it first

**Open item #1 (durable Owner identity) is now implemented, uncommitted, awaiting your review.** Nothing about identity changed: scrypt, the salted hash, SHA-256 session tokens, the 8h TTL and the cookie are untouched. Only the storage behind the existing `read()` / `write()` seam moved.

### The failure, measured before the fix

Simulating Vercel's read-only filesystem by making `data/` unwritable:

```
register on READ-ONLY dir: HTTP 201
response ok: true | persisted: false | cookie issued: true
same session, next request GET /api/chat = 401
```

The hub said "success", issued a cookie, then rejected it immediately.

### The behaviour, measured after the fix

Against a local stand-in for Supabase's REST API, then **killing the process and reusing the same cookie on a new one** — the cold-start analogue:

```
register (Supabase driver):  HTTP 201
ok: true | persisted: true | durable: true | employeeId: EMP-0001
GET /api/chat (same process) = 200
GET /api/owner               → registered: true | durable: true

--- new process, PID 2039, no memory of that session ---
GET /api/chat with pre-restart cookie = 200
owner status → registered: true | durable: true | authenticated: true

--- control ---
GET /api/chat with a fake cookie      = 401
--- store intentionally made unreachable ---
GET /api/chat with valid cookie       = 401   (fail-closed, no silent file fallback)
data/gimms-owner.json                 = absent (the file driver was not used)
```

### What changed

| File | Change |
|---|---|
| `lib/owner-store.ts` | **New.** ~120 lines: reads/writes one Supabase row (`gimms_owner_state`, id `owner`, column `db`). Service-role key, 5s timeout, presence-only env checks, table name constrained to a safe identifier |
| `lib/owner-auth.ts` | `read()`/`write()` became async and dispatch on the driver. The file implementations are kept **byte-identical** as `fileRead()`/`fileWrite()`. Every exported function now returns a Promise |
| `lib/api-auth.ts` + 14 route files | One `await` per call site. Mechanical; no logic changed |
| `.env.example` | Documents `OWNER_STATE_TABLE` |

**Zero new dependencies. No Supabase Auth. No change to the cookie or hashing.** With Supabase unset, behaviour is exactly the old file store — verified by the full harness run below.

### Why the gate had to become async

A synchronous function cannot read a remote row without a dependency like `deasync`, which this repo will not add. So `requireOwner()` and friends are async now, and their callers await them — that is the entire reason 16 files appear in the diff.

### What you still must do

1. Create the `gimms_owner_state` table (§2a step 1) — without it, writes fail and behaviour is unchanged from before.
2. Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel (§1a).

### Honest limits of this change

- I could not reach `supabase.co` from the sandbox, so the adapter was proven against a **local mock of the REST shape** (same paths, headers, `Prefer: resolution=merge-duplicates`), not against a real Supabase project. Your first real registration is the true end-to-end test.
- There is **no cache**: each authenticated request costs one ~30–80 ms round trip to Supabase. Deliberate — a cache would reintroduce the "which instance knows what" problem this change exists to remove.
- `durable: true` means *the store is configured to be durable*, not *the store is reachable*. When Supabase is down you get `registered:false` and a 401, which is the safe direction but worth knowing when you read the status JSON.

## 1. Environment variables

### 1a. Minimum set for a working *text* assistant (no browser, no email, no voice)

Stop and read this before buying or generating anything: **the assistant does not need OpenAI.** Classification is deterministic by default. The minimum is storage + one bootstrap token.

| Variable | Required | What it does | If missing |
|---|---|---|---|
| `SUPABASE_URL` | **Yes** (production) | Storage driver for hub state + job records | Falls back to file → memory; jobs do not survive a cold start |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** (production) | Server-side writes; never sent to a browser | Same as above. If the hub is already live with data, this is probably already set — verify in the Vercel UI rather than trusting me |
| `HUB_STATE_TABLE` | Optional | Default `hub_state` | Default is used |
| `AGENT_JOBS_TABLE` | Optional | Default `gimms_agent_jobs` | Default is used; jobs land nowhere durable until §2 SQL runs |
| `OWNER_STATE_TABLE` | Optional | Default `gimms_owner_state` — where the Owner record + sessions live | Default is used. **This table must exist** (§2a) or nobody can stay signed in |
| `OWNER_BOOTSTRAP_TOKEN` | **Yes**, for the first registration | One-time secret that authorises creating the Owner account; sent as the `x-gimms-bootstrap-token` header by `/admin/login` | Production registration is refused (`GIMMS_ALLOW_FIRST_RUN_CLAIM` is not a safe workaround) |

That is genuinely the whole minimum. Everything else is an add-on.

### 1b. Browser worker (required for any *browser* job to actually run)

| Variable | Required | Notes |
|---|---|---|
| `AGENT_WORKER_URL` | Yes, for browser jobs | `https://gimms-agent-worker.fly.dev`, **no trailing slash** |
| `AGENT_WORKER_SECRET` | Yes, for browser jobs | Must be **character-identical** to the worker's `WORKER_SECRET`. Generate once: `openssl rand -hex 32` in Codespaces, paste into both places, never into chat |
| `GIMMS_PUBLIC_URL` | Recommended | Base URL used to build the worker's callback. Defaults to `https://ai-gimms-hub.vercel.app`; set it explicitly so a preview deploy does not call back to production |

Without these, `/api/agent/execute` still returns **202 + a jobId** and reports `workerConfigured:false`. Nothing pretends to run.

### 1c. Gmail — read + draft (optional)

| Variable | Notes |
|---|---|
| `GMAIL_CLIENT_ID` | From Google Cloud Console, §2 |
| `GMAIL_CLIENT_SECRET` | Same |
| `GMAIL_REFRESH_TOKEN` | From the consent flow, §2. Treat as a password |

With these absent, `/api/agent/comms` returns `configured:false` and `POST {action:"draft"}` returns **501** with these exact names. There is no send path in the code, by design.

### 1d. Voice (optional)

| Variable | Notes |
|---|---|
| `AUTOPILOT_VOICE_SESSION_URL` | The vendor's **session/token** endpoint (not its WebSocket URL) |
| `AUTOPILOT_VOICE_API_KEY` | The vendor key. The browser only ever receives the ephemeral token |

Absent → `/api/agent/voice/session` returns **501** with both names listed.

### 1e. Optional extras

| Variable | Default | Effect |
|---|---|---|
| `AUTOPILOT_LLM_CLASSIFIER` | off | Set `1` to let a model pick one of 11 intent ids. Invalid output falls back to the deterministic result |
| `OPENAI_API_KEY` | — | Needed **only** if the above is `1` |
| `AUTOPILOT_LLM_MODEL` | `gpt-4o-mini` | Classifier model |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | For an OpenAI-compatible gateway |
| `OWNER_EMAIL` | `info.ceyteq@gmail.com` | Display only |
| `GIMMS_DISABLE_CHILD_PROCESS` | unset | Set `1` to disable even the two allowlisted version probes |

### 1f. Leave these alone

| Variable | Why |
|---|---|
| `AGENT_ALLOW_OUTBOUND`, `AGENT_OPERATOR_ATTESTED` | **Leave empty.** These gate reviewed per-action approvals; they do not unlock unattended outbound |
| `GIMMS_ALLOW_FIRST_RUN_CLAIM` | **Do not set in production.** It lets the first visitor claim the hub |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | Declared in the tool registry but **no code reads them yet** (tools are `NOT_IMPLEMENTED`). Do not bother obtaining them this week |
| `BROWSERLESS_TOKEN`, `CRON_SECRET` | Presence-reported only; unused by v3 |

---

## 2. External platforms

### 2a. Supabase (do this first — it is what makes records durable)

Dashboard: https://supabase.com/dashboard → your project → **SQL Editor** → New query.

**Step 1 — the Owner identity table (new, required).** Without it the durable gate cannot persist anything and you are back to the old behaviour:

```sql
create table if not exists public.gimms_owner_state (
  id         text primary key,          -- always the literal 'owner' (single tenant)
  db         jsonb not null,            -- scrypt hash+salt and SHA-256 session hashes only
  updated_at timestamptz not null default now()
);

alter table public.gimms_owner_state enable row level security;
alter table public.gimms_owner_state force row level security;
revoke all on table public.gimms_owner_state from anon, authenticated;
```

Verify (expect `rowsecurity = true`):

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename = 'gimms_owner_state';
```

If the app later returns 401 on writes while reads work, the table name or the service-role key is wrong — check `OWNER_STATE_TABLE` first.

**Step 2 — check the state table exists** (the hub is live, so it probably does):

```sql
select tablename from pg_tables where schemaname = 'public';
```

If `hub_state` is **missing**, create it to match what the code reads (`id` + `db`):

```sql
create table if not exists public.hub_state (
  id         text primary key,
  db         jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.hub_state enable row level security;
revoke all on table public.hub_state from anon, authenticated;
```

**Then apply the agent tables** — copy the whole of `supabase/agent-schema.sql` into the editor and Run. Expect *"Success. No rows returned"*. Without it, browser jobs have nowhere shared to live and the console reports `durable:false`.

**Optional:** `supabase/autopilot-schema.sql` (encrypted token vault). v3 works without it; skip unless you want OAuth tokens in the DB instead of Vercel env. If you apply it, confirm `rowsecurity = true`.

Verify RLS on the agent tables:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename like 'gimms_agent%';
```

### 2b. Vercel

1. Project → **Settings → Environment Variables** → add the names from §1 for **Production and Preview**.
2. **Redeploy** — env changes do not hot-apply (Deployments → ⋯ → Redeploy).
3. Confirm Git → Vercel auto-deploy is connected (open item #8); if pushes do not create deployments, that connection is still missing.
4. Hobby caps function duration hard. The architecture never runs long work in a route (§4 of the blueprint), so this is informational, not a blocker.

### 2c. Google Cloud Console — Gmail (only if you want email)

1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Library → Gmail API → Enable**.
3. **OAuth consent screen** → User type **External** → app name + support email → Save.
4. **Data access → Add scopes:** `gmail.readonly` and `gmail.compose`. **Do not** add `gmail.send` — the app never asks for it.
5. **Audience → Test users →** add the mailbox you will read.
6. **Credentials → Create credentials → OAuth client ID → Web application**, with redirect URI:
   `https://ai-gimms-hub.vercel.app/api/agent/comms/oauth/callback`
   *(That callback route does not exist yet — see the note in §"What is missing" below.)*
7. Copy the client id/secret into Vercel (§1c).

**Trap to plan around:** while the consent screen is in **Testing**, Google expires refresh tokens after **7 days**, so Gmail breaks weekly. Options: re-authorise weekly, publish the app (sensitive scopes may require Google verification), or use a Workspace account with domain-wide delegation. Check the current policy in the console — Google changes this.

### 2d. Voice vendor (only if you want speech)

Pick one and create a key: OpenAI Realtime (https://platform.openai.com), Vapi (https://dashboard.vapi.ai), or Retell (https://dashboard.retellai.com). You need the **session-token** endpoint URL, not the media URL. Put both values in Vercel per §1d. Microphone access requires HTTPS — Vercel is HTTPS, so production is fine.

### 2e. Fly.io — the browser worker (only if you want browser jobs)

```bash
# Codespaces bash, from the repo root
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="$HOME/.fly" && export PATH="$FLYCTL_INSTALL/bin:$PATH"

cd agent-worker
fly auth signup          # or: fly auth login
fly launch --no-deploy --copy-config --name gimms-agent-worker
fly secrets set WORKER_SECRET="$(openssl rand -hex 32)"
fly deploy
fly status               # expect 1 machine running
```

Then copy that same `WORKER_SECRET` into Vercel as `AGENT_WORKER_SECRET` and the app hostname as `AGENT_WORKER_URL`. The `fly.toml` asks for 1 GB RAM (Chromium's practical floor), Singapore region, and a `/data` volume.

**Do not paste `WORKER_SECRET` into chat.** Generate, copy, and paste directly between the Fly and Vercel UIs.

### 2f. Meta / Facebook (do not start yet)

Ad-campaign *reading* is declared but `NOT_IMPLEMENTED` (no code reads the token). Inbound social messages need a Meta app, webhook signature verification, and app review. Neither is part of this test; the blueprint §3 and §5 describe the path when you want it.

---

## 3. Plugins, dependencies, webhooks, database connections

**npm packages: zero new.** The app still has 3 dependencies; the worker already carries `playwright-core`. Do **not** install LangChain, `googleapis`, `@supabase/supabase-js`, Puppeteer, Upstash, or the Vapi SDK for this test.

| Thing | Needed now? | Detail |
|---|---|---|
| Supabase project + service-role key | **Yes** (production) | §2a |
| Postgres tables | `hub_state` (exists), `gimms_agent_jobs` + `gimms_agent_audit` (apply SQL) | RLS on, no policies, service-role only |
| Fly.io worker + volume | Only for browser jobs | §2e; volume comes from `fly.toml` |
| Google OAuth client | Only for Gmail | §2c |
| Voice vendor account | Only for speech | §2d |
| **Webhooks** | **None** | v3 registers no webhook. Inbound social is unimplemented on purpose: an unsigned webhook is worse than none |
| Redis / Upstash / QStash | **No** | Job durability comes from Postgres + the lease/callback dispatcher |
| Supabase Auth | **No** | Owner auth is scrypt + session cookie (and it is currently the blocker, §0) |
| Vercel Cron | **No** | A ticker, not a job runner |
| Analytics / APM | **No** | Not needed to test |

---

## 4. What is missing from the code (so you are not surprised mid-test)

| Gap | Effect on your test | Fix |
|---|---|---|
| ~~Durable Owner store~~ | **Fixed in this working tree** (uncommitted) | Review `lib/owner-store.ts`; apply the SQL in §2a step 1 |
| `app/api/agent/comms/oauth/callback/route.ts` | You cannot complete Google consent by hand without shuttling a refresh token | Enable the OAuth Playground route in `docs/AUTOPILOT-MANUAL-SETUP.md` §2C, or I build the callback |
| `meta.*` tools | `NOT_IMPLEMENTED`, `501` | Not required for this test |
| Worker deployment | Browser jobs queue but never run | §2e |
| Social inbound webhooks | Not built | Not required |

---

## 5. TEST RUN 1 — zero credentials, five minutes (recommended first)

This proves the whole agent loop with no keys at all. Development builds allow anonymous writes **by design** (`authMode:"development-anonymous"`), and only in development.

```bash
# terminal 1 (Codespaces)
npm install
npm run dev
```

```bash
# terminal 2 (Codespaces), from the repo root
B=http://localhost:3000
say () { curl -s -o /tmp/o -w "HTTP %{http_code}  " -X POST "$B/api/agent/execute" \
  -H 'content-type: application/json' -H 'Origin: http://localhost:3000' -H 'Sec-Fetch-Site: same-origin' \
  -d "{\"command\":\"$1\"}"; node -e 'const o=require("/tmp/o");console.log("code:",o.code,"| intent:",o.interpretation?.intent)'; }

say "status report"
say "check my emails and draft replies"
say "send an email to the client telling them we shipped"
say "automatically post this to linkedin for me"
say "increase the facebook ad campaign budget to 500"
say "read https://gimms.lk and extract the headline"
say "draft a linkedin post about our launch"
say "qwerty zxcvbn"
```

**Expected, in order:**

| Command | HTTP | code |
|---|---|---|
| status report | 200 | `REPORTED` |
| check my emails and draft replies | 501 | `NOT_CONFIGURED` (+ GMAIL_* names) |
| send an email… | **403** | `BLOCKED_BY_POLICY` |
| automatically post… | **403** | `BLOCKED_BY_POLICY` |
| increase the ad budget… | **403** | `BLOCKED_BY_POLICY` |
| read https://gimms.lk… | 202 | `QUEUED` |
| draft a linkedin post… | 202 | `AWAITING_APPROVAL` |
| qwerty zxcvbn | 400 | `UNKNOWN_INTENT` |

Then the full regression suite (all should be 0 failures):

```bash
BASE=http://localhost:3000 node scripts/verify-agent.mjs              # 40 assertions
BASE=http://localhost:3000 node scripts/verify-developer-team-ci.mjs  # 29
BASE=http://localhost:3000 node scripts/verify-dept01.mjs             # 88
BASE=http://localhost:3000 node scripts/verify-owner-chat.mjs         # 72
BASE=http://localhost:3000 bash scripts/verify-phase0.sh
```

**Two Codespaces gotchas:**

1. Registration and login are rate-limited (5 registrations/hour, per instance, in memory). If you see `429`, restart the dev server — that is open item #3, not a bug you introduced.
2. Next 16 blocks cross-origin dev assets; `next.config.mjs` allows `*.e2b.app` only. A Codespaces browser preview (`*.app.github.dev`) may 403 on `/_next` assets. Test via the `curl` matrix above, or ask me to add `*.app.github.dev` to `allowedDevOrigins`.

---

## 6. TEST RUN 2 — production, after the §0 blocker is fixed

Do these in order; each has a pass/fail you can see.

| # | Step | Where | Pass looks like |
|---|---|---|---|
| 1 | Apply SQL (§2a) | Supabase SQL Editor | "Success. No rows returned" |
| 2 | Set env vars (§1a–1b), redeploy | Vercel | Deployment goes green |
| 3 | `GET /api/bootstrap` | Browser | `storage` reports the **postgres** driver, not `file`/`memory` |
| 4 | Register once: `/admin/login` → password (12+ chars) + bootstrap token | Browser | `201`, `persisted:true`, and you stay signed in after a reload |
| 5 | `GET /api/agent/execute` | Browser console, same origin | capability matrix JSON; `gmail.configured`/`voice.configured` reflect reality |
| 6 | `POST /api/agent/execute {"command":"status report"}` | Browser console | `200 REPORTED` |
| 7 | `POST … {"command":"increase the facebook ad campaign budget to 500"}` | Browser console | `403 BLOCKED_BY_POLICY` |
| 8 | `POST … {"command":"read https://gimms.lk and extract the headline"}` | Browser console | `202` + `jobId` |
| 9 | Approve that job at `/admin/auto-pilot` | Browser | status moves `QUEUED → DISPATCHED`; `fly logs` shows the plan arriving |
| 10 | Worker reports back | automatic | job reaches `COMPLETED` with evidence + screenshot |

Browser-console form (the CSRF guard requires same-origin, so do **not** use curl from your PC):

```js
await (await fetch("/api/agent/execute", {
  method: "POST", credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ command: "status report" })
})).json()
```

**One honest caveat about step 4:** with the current file-based store, `persisted` can read `true` on the instance that handled the request and still be gone on the next cold start. That is precisely why step 3 (driver check) and step 4 (stay signed in after reload) are in the list — they are the tests that expose the blocker rather than hiding it.

---

## 7. Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| Every production POST → 401, even right after login | Owner session not persisted (§0) | Fix identity store, or test in Codespaces |
| `501` + `missingEnv:[...]` | Env var absent **on that deployment** | Add it, then **Redeploy** |
| `501` + `code:NOT_IMPLEMENTED` | No code path yet (`meta.*`) | Expected |
| `403 BLOCKED_BY_POLICY` | Refusal working as designed | Use the draft path |
| `403` "Cross-origin request blocked" | CSRF guard | Call from the app's own origin, not a random curl |
| `429` | Per-instance rate limit | Wait, or restart the dev server |
| `202` but nothing runs | Worker not configured/deployed | `AGENT_WORKER_URL` + `AGENT_WORKER_SECRET`, §2e |
| `storage: "file"` in production | Supabase env missing/wrong | §1a, then redeploy |
| Worker returns 401 to the app | `AGENT_WORKER_SECRET` ≠ Fly `WORKER_SECRET` | Re-set both to the same value |
| Registered, then logged out after a while | Cold start wiped the file store | §0 |

---

## 8. Cost awareness (no invented prices)

Real spend starts only when you switch these on: **Fly.io** (1 GB machine, billed while awake — `auto_stop_machines` is on), **voice** (billed per audio minute by the vendor), **OpenAI** (only if you enable the classifier or later compose text with a model), **Supabase** (free tier is likely enough at this volume). Check each vendor's current pricing page — do not budget from memory, mine included.

**Nothing in §1–§3 requires a paid plan to complete Test Run 1.** Test Run 1 costs zero.
