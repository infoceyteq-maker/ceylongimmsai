# HANDOFF — AI GIMMS Hub · 2026-11-02 (Asia/Colombo)

## ✅ LIVE URL (verified)
**https://ai-gimms-hub.vercel.app**
- Immutable deployment URL: `https://ai-gimms-dwssjlygy-ceyteq1.vercel.app`
- Deployment: `dpl_5aSZArPYpLEC7ZTtLSeHZMbn9Qdg` · state `READY` / `PROMOTED` · target `production`
- Vercel project: `ai-gimms-hub` · `prj_3QGrY4rzs67I4vu0iTeCkU1en87f` · framework `nextjs` · plan `hobby`
- Source commit: `fafcb51c3821dff467bc98c02a58050f13de89fa` on
  `infoceyteq-maker/ceylongimmsai` @ `arena/92b892eb-ceylongimmsai`
- Build log: `vercel build` → `✓ Compiled successfully in 4.2s`, TypeScript 2.6s, 15/15 pages, exit 0.

## Verification — real outputs (GitHub Actions run 41483553389, external runner)
```
BASE=https://ai-gimms-hub.vercel.app
/ 200                     /status 200        /callcenter 200
/tasks 200                /research 200      /memory 200
/approvals 200            /publishing 200    /production 200
/clients 200              /audience 200      /api/bootstrap 200 (storage)
/agents 200               /connections 200   /api/connect 200
13/13 pages = 200
"storage":"postgres"
"counts":{"tasks":6,"agents":6,"clients":2}   (before the POST)
logo-512.png 200
scene3d_count 1
api/connect 200
POST /api/tasks -> {"ok":true,"storage":"postgres","persisted":true,...,"count":7}
reload -> bootstrap_counts {"tasks":7,...}; task_present_after_reload 1
```
Full raw output is committed as `verification-results.txt`; the commands are in
`scripts/verify-live.sh` and `.github/workflows/verify-live.yml`.
The sandbox itself cannot reach `*.vercel.app` (TLS egress filter), hence the external runner.
Local baseline: `npx tsc --noEmit` clean, `npx next build` exit 0, local 13/13 pages 200,
`git ls-files | grep -i env` → only `.env.example` and `next-env.d.ts`, no `.env.local`.

## ⚠️ What actually happened this session (read before assuming anything)
The copy-paste mission assumed `/home/user/ceyteq-hub` (93 files, v7.2.0, commit `5eecfad`),
`AI-GIMMS-Hub-live.zip`, `logo-512.png`, `.env.local` and a previous HANDOFF.md. **None of them
were in this workspace.** This checkout (`ceylongimmsai`, branch `arena/92b892eb-ceylongimmsai`,
from `5f0e1fd`) contained only `README.md`. GitHub code search, GitHub repo list, Google Drive,
Dropbox and Vercel deployments all confirmed the original source is unavailable here.
The owner then said "get it live today somehow", so a **fresh working implementation was built
from the spec** and deployed to the EXISTING Vercel project (no `/new`, no duplicate project).
It is NOT the verified 7.2.0 app. No verification numbers were invented.

What is genuinely real and reused: the Vercel project + its four env vars (values never read),
and the Supabase `public.hub_state` row `id='hub'` (5 tasks, 6 agents, 2 clients, 5 channels,
2 publishes, 65 KB jsonb). The live site reads/writes that row through the postgres driver.

## Code now in the repo
`app/` (13 pages + 3 API routes), `components/HubShell.tsx`, `components/Panels.tsx`,
`components/Scene3D.tsx` (real-time 2D-canvas perspective, no Three.js, no CDN),
`lib/store.ts` (postgres → file → memory, server-only), `lib/seed.ts`, `lib/types.ts`,
`data/store.json`, `public/logo-512.png` (**placeholder wordmark**), `scripts/make-logo.mjs`,
`scripts/verify-live.sh`, `.github/workflows/verify-live.yml`, `verification-results.txt`.
Local `npm run dev` runs on `http://0.0.0.0:3000` (driver `file`, because there is no local
`.env.local`). The LIVE driver is `postgres`.

## Honestly still missing
1. **Original app + supplied logo.** The 93-file v7.2.0 build and the real `logo-512.png` are not
   in this workspace. The deployed `logo-512.png` is a clearly-labelled placeholder wordmark; the
   original was never inverted/redrawn/recoloured/cropped because it was never available.
   To restore: attach `AI-GIMMS-Hub-live.zip` (876 KB, no secrets) and replace those assets.
2. **PRIVATE GitHub repo `ai-gimms-hub` does not exist.** `gh repo create` and REST
   `POST /user/repos` both return 403 `Resource not accessible by integration (createRepository)`;
   this GitHub App token can only push to `ceylongimmsai`. Code is currently on a **public** repo
   branch (no secrets in it). Exact fallback: create the private repo in the GitHub web UI
   (https://github.com/new), then upload the zip contents / mirror this branch there.
3. **Git → Vercel connection is not permanent.** The deploy was a one-off `git_source`
   deployment; `gitProviderOptions.createDeployments: "disabled"` so future pushes do NOT
   auto-deploy. Owner action: Vercel → project `ai-gimms-hub` → Settings → Git →
   Connect Git Repository → Save, or re-trigger `create_deployment` with a `git_source`.
4. **No login gate yet.** Pending decision, do not build silently. Vercel Password Protection is
   Pro-only ($20/mo); free path = Supabase Auth (email/password or magic link) inside the app.
   `ssoProtection.deploymentType = "all_except_custom_domains"`; the production alias
   `ai-gimms-hub.vercel.app` is public (anonymous 200 verified), immutable deployment URLs may
   redirect to Vercel login.
5. `/connections` stays **0 connected** (no keys), publishing stays **MANUAL**
   (package → outbox → human posts → link), Google Flow / Veo **not connected** (no public API).
6. Supabase stays on the shared `kkyaekpsnjaualjiwirg` ("Umbrellacafe") project — owner
   postponed isolating it; no migration was done.

## Guardrails honoured
Never committed `.env.local`; credentials server-side; Anthropic removed; no "connected"/"live"
claim without a real credential; type `#0B0D0F` on light ash, green only for actions; live 3D via
2D canvas; one contact only `info.ceyteq@gmail.com`; brand "AI GIMMS" / "Empowering Digital
Evolution"; no invented handles or citations; no secrets printed.
