# ceylongimmsai — AI GIMMS Hub

**AI GIMMS** · *Empowering Digital Evolution* · owner `info.ceyteq@gmail.com`

> Honesty note: the original v7.2.0 app (93 files, commit `5eecfad`) was NOT present in
> this workspace. This is a fresh, working implementation built from the handoff spec so the
> hub can go live. `public/logo-512.png` is a **placeholder wordmark**, not the supplied logo.
> See `HANDOFF.md` for the verified state of GitHub / Vercel / Supabase.

## Cloud-only development (no local terminal required)

The owner's Windows machine cannot run PowerShell or Node. **Use GitHub Codespaces:**
open the repo on github.com, press `.`, and you get a bash terminal in the browser.
See [`docs/PHASE-TERMINAL-COMMANDS.md`](docs/PHASE-TERMINAL-COMMANDS.md) — every command
on that page is bash and Codespaces-compatible. `.devcontainer/devcontainer.json`
configures it automatically.

## Run

```bash
npm install
npm run dev            # http://0.0.0.0:3000
```

`npx tsc --noEmit` and `npx next build` must both be clean.

`next.config.mjs` sets `allowedDevOrigins: ["*.e2b.app"]`: the Arena preview loads the app in an
iframe from `https://3000-<sandbox>.e2b.app`, and Next.js 16 otherwise blocks cross-origin
`/_next` dev resources (HMR) with a 403. Restart the dev server after changing this config.
If Turbopack throws after a reinstall, delete `.next/` and restart.

## Storage drivers (`lib/store.ts`, server-only)

1. **postgres** — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `HUB_STATE_TABLE` (default
   `hub_state`). Reads/writes the single row `id='hub'` in `public.hub_state` through the
   Supabase REST API with the service-role key. RLS: only `service_role` may touch it.
2. **file** — `data/store.json` (writable filesystem).
3. **memory** — read-only host fallback; never throws, never 500s.

`GET /api/bootstrap` reports the driver that actually ran in `storage`.

## Pages

Public hub: `/` `/tasks` `/approvals` `/clients` `/agents` `/status` `/research`
`/publishing` `/audience` `/connections` `/callcenter` `/memory` `/production` `/chat`

Owner-only: `/admin/login` · `/admin/auto-pilot` (gated by `proxy.ts` + session check)

## APIs

**Read routes** (anonymous, no secrets, internals stripped):

- `GET /api/bootstrap` → counts + state; `clients` and `audit` are **redacted** for
  anonymous callers and listed in `redacted`
- `GET /api/connect` → channels, `connected: 0`; `POST` returns 403 (no real key)
- `GET /api/jobs` `/api/skills` `/api/departments` `/api/dept01` `/api/developer-team`
  `/api/production/ai-team` `/api/skills-tools`

**Mutating routes** — every one requires an Owner session (`requireOwnerWrite`), or
returns **401 in production**. Development allows anonymous writes so the CI harness
works, and stamps `authMode: "development-anonymous"` on the response.

`/api/owner` · `/api/chat` · `/api/tasks` · `/api/jobs` · `/api/skills`
`/api/dept01` · `/api/developer-team` · `/api/production/ai-team`

**Owner-only admin:**

- `/api/admin/agent` — plan / approve / run / cancel Auto-Pilot jobs
- `/api/admin/security` — live posture report: presence flags, route-auth audit, policy
- `/api/agent/callback` — worker callback, authenticated by a single-use per-job lease

## Security

| Control | Where |
|---|---|
| Security headers (CSP, nosniff, Referrer-Policy, Permissions-Policy, HSTS) | `proxy.ts` |
| CSRF (Origin + Sec-Fetch-Site + Referer) on every mutation | `lib/request-guard.ts` |
| Owner write gate | `lib/api-auth.ts` |
| Rate limiting + lockout (per-instance, **not** a global quota) | `lib/rate-limit.ts` |
| Child-process allowlist (`git --version`, `node --version` only) | `lib/exec-guard.ts` |
| Lazy, presence-only env access | `lib/env.ts` |
| `__Host-` + Secure session cookie, atomic session file | `lib/owner-auth.ts` |

Full findings: [`PHASE1-SECURITY-DIAGNOSTIC.md`](PHASE1-SECURITY-DIAGNOSTIC.md)

## GIMMS Auto-Pilot (Phase 2)

A real browser agent with human-like input simulation, run from `/admin/auto-pilot`.

It navigates, reads, extracts and screenshots. It **composes** social posts and stops
before submitting. It **refuses, in code**, unattended outbound actions such as
auto-commenting and connection requests, because those breach the terms of every
platform in scope and the penalty lands on the owner's own account.

The browser runs in a separate worker (`agent-worker/`), not on Vercel — serverless
functions time out long before a browsing session finishes. Architecture, deployment
and the full rationale: [`PHASE2-AGENT-ARCHITECTURE.md`](PHASE2-AGENT-ARCHITECTURE.md)

## Guardrails

- Never commit `.env.local`; credentials stay server-side; Anthropic removed.
- `/connections` stays at **0 connected** until a real key exists.
- Publishing stays **MANUAL**: package → outbox → human posts → link.
- No Google Flow / Veo claims (no public API). No invented handles or citations.
- Light ash page, black type `#0B0D0F`, green only for actions.
- Live 3D = real-time 2D-canvas perspective in `components/Scene3D.tsx`, no Three.js, no CDN.
- One contact only: `info.ceyteq@gmail.com`.
- No unattended outbound social actions; the policy gate refuses them by default.
- No secret value is ever logged, returned to a client, or written into evidence.
