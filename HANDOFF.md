# HANDOFF — AI GIMMS Hub (rewritten 2026-11-02 UTC)

## READ THIS FIRST: this session's workspace did NOT contain the app
The copy-paste mission prompt assumed `/home/user/ceyteq-hub` (93 files, Next.js 16.4.3,
React 19.3.1, v7.2.0, commit 5eecfad), `/home/user/AI-GIMMS-Hub-live/`,
`/home/user/AI-GIMMS-Hub-live.zip`, `logo-512.png`, `.env.local` and a previous HANDOFF.md.

In THIS session the checkout is `infoceyteq-maker/ceylongimmsai` at
`/home/user/ceylongimmsai`, branch `arena/92b892eb-ceylongimmsai`, from commit `5f0e1fd`.
The only tracked file is `README.md` (`# ceylongimmsai`). None of the above paths exist.
No source code, no logo, no zip, no secrets file. Nothing was deployed and nothing was
rebuilt (the mission says do not rebuild). No verification numbers were invented.

## What is REAL and verified this session
- GitHub auth: `gh auth status` → `infoceyteq-maker` (GitHub App token).
  `gh api /user/repos?visibility=all` → no repo named `ai-gimms-hub`, no private repos at all.
  Code search for `Scene3D` / `HUB_STATE_TABLE` in the account → 0 results.
  `gh repo create infoceyteq-maker/ai-gimms-hub --private` → 403
  "Resource not accessible by integration (createRepository)"; REST `POST /user/repos` → 403 too.
  The token CAN push to the existing `ceylongimmsai` repo but CANNOT create repositories.
  `git push --dry-run origin arena/92b892eb-ceylongimmsai` works.
- Vercel: authenticated as `info.ceyteq@gmail.com` / `infoceyteq-1343`, plan hobby.
  Project `ai-gimms-hub` EXISTS: id `prj_3QGrY4rzs67I4vu0iTeCkU1en87f`, framework `nextjs`,
  nodeVersion 26.x. Env vars set for production + preview: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (sensitive — value NOT read), `OWNER_EMAIL=info.ceyteq@gmail.com`,
  `HUB_STATE_TABLE=hub_state`.
  `list_deployments(project_id=prj_3QG...)` → `[]`; `live: false`, `latestDeployments: []`.
  ⇒ NO live URL yet. The project has never been deployed. Do NOT use `/new`; do NOT create a
  second project.
- Supabase: project ref `kkyaekpsnjaualjiwirg` ("Umbrellacafe", ACTIVE_HEALTHY, ap-northeast-2).
  `public.hub_state` id=`hub` exists; `db` jsonb is 65,319 bytes with keys:
  audit, calls, tasks, agents, clients, outputs, audience, channels, research, publishes,
  conversations. Counts: tasks 5, agents 6, clients 2, channels 5, publishes 2.
  The backend data from the earlier build survived. Keep the shared project (owner postponed
  isolating it).
- Connected Google Drive and Dropbox contain neither the zip nor the app source.
- Vercel Deployment Protection is ON in this account: fetching two existing production
  deployment URLs (`ceyteqos-3d7aeqwyt-ceyteq1.vercel.app` and
  `macrobox-pos-live-fsvydger8-ceyteq1.vercel.app`) redirects to `vercel.com/login`
  ("Protected Deployment – Vercel"). `get_project` shows
  `ssoProtection.deploymentType = "all_except_custom_domains"`. A correct deploy will therefore
  NOT return anonymous `curl 200` until protection is disabled (Vercel dashboard → project
  ai-gimms-hub → Settings → Deployment Protection → Vercel Authentication → Disabled), or a
  protection-bypass secret/token is used. The Vercel connector has no tool to change this.
- Sandbox egress is limited to github.com, codeload.github.com, api.github.com,
  registry.npmjs.org, pypi.org, files.pythonhosted.org. `curl https://<name>.vercel.app`
  from bash returns `000`. Live HTTP checks must be done with the platform's fetch_page tool or
  from the owner's own browser/terminal; the mission's curl loop cannot run inside this sandbox.

## Deployment URL
NONE. State: BLOCKED — source code missing.

## Exact fallback (mission step 1)
Create the PRIVATE repo `ai-gimms-hub` in the GitHub web UI (https://github.com/new), then
upload the CONTENTS of `AI-GIMMS-Hub-live.zip` there (that zip is not in this workspace either),
then connect it in Vercel → project `ai-gimms-hub` → Settings → Git → Connect Git Repository.

## What the owner must supply/do before the next agent can finish
1. The 93 source files: attach `AI-GIMMS-Hub-live.zip` (876 KB, no secrets) or push them to the
   private repo. Include the supplied `logo-512.png` — it is NOT here and must not be redrawn,
   inverted, recoloured or cropped.
2. Create the private repo `ai-gimms-hub` in the GitHub web UI (the token here cannot create it).
3. Disable Vercel Authentication on the project, or expect a login redirect instead of 200.
4. Then: verify `git ls-files | grep -i env` shows only `.env.example` and `next-env.d.ts`, push,
   connect Git, watch build to READY, verify live, create one task + reload.

## Guardrails (unchanged)
Never commit `.env.local`; never show "connected"/"live"/"sent" without a real credential;
`/connections` stays at 0 connected; publishing stays MANUAL (package → outbox → human posts →
link); never claim Google Flow / Veo is connected; never invent handles or citations;
supplied logo untouched, background = logo's own light ash, type `#0B0D0F`, green only for
actions; live 3D = 2D canvas perspective in `components/Scene3D.tsx`, no Three.js;
one contact only `info.ceyteq@gmail.com`; brand "AI GIMMS" / "Empowering Digital Evolution";
credentials server-side, Anthropic removed, Claude side open; never print secrets.

## Pending decisions (ask, do not decide silently)
- Owner postponed moving the hub to its own Supabase project — keep the shared one.
- NEXT product task after deploy: a login gate. Vercel Password Protection is Pro-only;
  free path is Supabase Auth inside the app. Ask before building.
