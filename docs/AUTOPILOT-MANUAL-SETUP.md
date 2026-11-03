# AUTO-PILOT v3 — MANUAL SETUP CHECKLIST

Everything here is **done by you, in a web UI, with your own hands.** The agent has not committed, pushed, migrated or deployed anything.

Rules that apply to every step:

- A secret is entered **only** in Vercel's Environment Variables UI or a vendor's own console. Never in chat, never in a GitHub issue, never in a commit.
- Every command is **bash for GitHub Codespaces** (repo → Code ▾ → Codespaces → Create → Terminal). There is no local-terminal step anywhere in this file.
- "Leave blank = feature OFF." Nothing fails open in this design.

---

## 0. Ship the code (GitHub web UI — no terminal)

The new files are in your working tree. To get them onto `main` yourself:

1. Open the repo → **Add file ▾ → Upload files** (or use the Codespaces bash below if you prefer).
2. New files to add:
   - `lib/autopilot/intent.ts`
   - `lib/autopilot/tools.ts`
   - `lib/autopilot/gmail.ts`
   - `app/api/agent/execute/route.ts`
   - `app/api/agent/voice/session/route.ts`
   - `app/api/agent/comms/route.ts`
   - `supabase/autopilot-schema.sql` *(optional — not needed for v3)*
   - `docs/AUTOPILOT-ARCHITECTURE-V3.md`, `docs/AUTOPILOT-MANUAL-SETUP.md`
   - modified: `.env.example`
3. GitHub web UI can only upload whole files, so drag the folders or paste contents with **Add file → Create new file** and type the path (e.g. `app/api/agent/execute/route.ts`) — the slashes create folders.

Prefer a terminal? In Codespaces bash:

```bash
git add lib/autopilot app/api/agent/execute app/api/agent/voice app/api/agent/comms supabase/autopilot-schema.sql docs/AUTOPILOT-ARCHITECTURE-V3.md docs/AUTOPILOT-MANUAL-SETUP.md .env.example
git commit -m "feat(autopilot): v3 intent layer, tool registry, execute/comms/voice routes"
git push origin main
```

Vercel auto-deploys on push *if* open item #8 (Git → Vercel connection) is connected. If it is not, use Vercel → Deployments → **Redeploy**.

---

## 1. Prove the loop with zero credentials (do this first)

1. Open `https://ai-gimms-hub.vercel.app/admin/login` and sign in.
2. Open DevTools → Console **on the same origin** (this is what makes the CSRF guard accept the call):

```js
await (await fetch("/api/agent/execute", {
  method: "POST",
  headers: { "content-type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ command: "status report" })
})).json()
```

Expected: `{"ok":true,"code":"REPORTED", …}` with real counts. No model, no credentials, no external call.

Then check the refusals are real:

```js
// expect HTTP 403 + code BLOCKED_BY_POLICY
await fetch("/api/agent/execute", {
  method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
  body: JSON.stringify({ command: "send an email to the client telling them we shipped" })
})
```

```js
// expect HTTP 202 + a jobId, status AWAITING_APPROVAL
await (await fetch("/api/agent/execute", {
  method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
  body: JSON.stringify({ command: "read https://example.com and extract the headline" })
})).json()
```

*(If your deploy still has `AGENT_WORKER_URL` empty, the job queues and honestly reports `workerConfigured:false` — nothing pretends to run.)*

---

## 2. Gmail — read + draft

**A. Google Cloud Console** (https://console.cloud.google.com)

1. Create a project, e.g. `gimms-mail`.
2. **APIs & Services → Library →** enable **Gmail API**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill app name + your email → **Save**.
4. **Data access / Scopes → Add or remove scopes →** add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   *(Do not add `gmail.send`. The app never requests it.)*
5. **Audience → Test users →** add `info.ceyteq@gmail.com` (and any mailbox you will read).
6. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorised redirect URI: `https://ai-gimms-hub.vercel.app/api/agent/comms/oauth/callback`
     *(That callback route does not exist yet — v3 exchanges the code manually, step D. Add it when the route ships.)*
7. Copy the **Client ID** and **Client secret**.

**B. Vercel env vars** (Project → Settings → Environment Variables → Production + Preview):

| Name | Value |
|---|---|
| `GMAIL_CLIENT_ID` | from step A7 |
| `GMAIL_CLIENT_SECRET` | from step A7 |

**C. Get a refresh token — no local tooling needed.** Build this URL, replacing `<CLIENT_ID>`, and open it in your browser:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>&redirect_uri=https%3A%2F%2Fai-gimms-hub.vercel.app%2Fapi%2Fagent%2Fcomms%2Foauth%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.compose&access_type=offline&prompt=consent
```

After consent, Google redirects to your callback URL with `?code=…`. That route is not built yet, so either:

- **Simplest path:** temporarily set the redirect URI to Google's own playground (`https://developers.google.com/oauthplayground`) — open OAuth 2.0 Playground, use **⚙ → Use your own OAuth credentials**, paste client id/secret, authorise the two scopes, **Exchange authorisation code for tokens** → copy the **refresh_token**; **or**
- ask me to build `app/api/agent/comms/oauth/callback/route.ts` that stores the token server-side, which is safer than shuttling it by hand.

**D. Add it to Vercel:**

| `GMAIL_REFRESH_TOKEN` | the refresh token |
|---|---|

Then **Redeploy** (env changes need a new deployment).

**E. Verify:**

```js
await (await fetch("/api/agent/comms", { credentials: "include" })).json()
// expect gmail.configured: true, canSend: false

await (await fetch("/api/agent/comms", {
  method: "POST", credentials: "include", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "inbox", maxResults: 5 })
})).json()
```

**Watch out:** while the consent screen is in **Testing**, refresh tokens expire after **7 days** — Gmail will silently stop working. Either re-authorise weekly, or publish the app (may need Google verification for these scopes).

---

## 3. Voice

1. Choose a broker. **OpenAI:** https://platform.openai.com → API keys (and see the Realtime docs for the session endpoint). **Vapi:** https://dashboard.vapi.ai → API keys. **Retell:** https://dashboard.retellai.com → API keys.
2. In Vercel, add:

| Name | Value |
|---|---|
| `AUTOPILOT_VOICE_SESSION_URL` | the vendor's **session / token** endpoint (not the WebSocket URL) |
| `AUTOPILOT_VOICE_API_KEY` | the vendor key |

3. Redeploy. Verify:

```js
await (await fetch("/api/agent/voice/session", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: "en" }) })).json()
```

- `501 NOT_CONFIGURED` → vars not set / not redeployed yet.
- `502 UPSTREAM_ERROR` → our key is fine but the broker rejected the body; the exact request body lives in `app/api/agent/voice/session/route.ts` (`payload`) and is the one vendor-specific line to adjust.
- `200 SESSION_READY` → you can wire a browser client to speak to the vendor and POST transcripts to `/api/agent/execute` with `source:"voice"`.

**Microphone note:** browsers only grant mic access on HTTPS or localhost. Vercel is HTTPS, so this is fine in production; a plain `http://` preview will not work.

---

## 4. Browser worker (Fly.io)

Needed before any browser job can actually run. In Codespaces bash:

```bash
# one-time: install the Fly CLI
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

cd agent-worker
fly auth signup      # or: fly auth login
fly launch --copy-config --name gimms-agent
fly secrets set WORKER_SECRET="$(openssl rand -hex 32)"
fly deploy
```

Then:

1. `fly status` → confirm one machine running.
2. Copy the `WORKER_SECRET` you just generated (it is printed only if you print it — regenerate if lost) into Vercel as `AGENT_WORKER_SECRET`, and the app URL as `AGENT_WORKER_URL` (e.g. `https://gimms-agent.fly.dev`, no trailing slash).
3. In Supabase → **SQL Editor**, run `supabase/agent-schema.sql` (from the repo). Expect "Success. No rows returned".
4. `fly logs` while you approve a job in `/admin/auto-pilot` — you should see the plan arrive.

**Worker facts:** headless Chromium, `playwright-core`, closed step interpreter, no shell, no `eval`, no access to your cookie or Supabase key. It can only report on the job it was leased.

---

## 5. Optional — encrypted token vault

Only if you later want OAuth tokens in the database instead of Vercel env.

1. Supabase → **SQL Editor** → paste `supabase/autopilot-schema.sql` → **Run**.
2. Expect "Success. No rows returned". Verify:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename = 'autopilot_secrets';
```

Expect `rowsecurity = true`. Anon/authenticated have no grant, so the table is unreadable without the service-role key.

Note: no code reads this table yet. Applying it early is harmless but pointless — it is documented so the decision is not blocked later.

---

## 6. What to check when something says NOT_CONFIGURED

| Response | Meaning | Fix |
|---|---|---|
| `501` + `missingEnv: ["GMAIL_…"]` | Env var absent on **this** deployment | Add it, then **Redeploy** (Vercel does not hot-apply env changes) |
| `501` + `missingEnv: []`, `NOT_IMPLEMENTED` | No code path exists yet | Expected for `meta.ads.*`, `seo.audit` |
| `403 BLOCKED_BY_POLICY` | Working as designed | Use the draft path; this is not a bug to report |
| `401` in production | No Owner session | Sign in at `/admin/login` |
| `403` on a POST that works in the console | CSRF guard | Call from the app's own origin, not `curl` from elsewhere |
| `429` | Rate limit (per instance, not global) | Wait; see open item #3 |

Everything above is also visible at `/admin/security` (route-auth audit) and `GET /api/agent/execute` (capability matrix).
