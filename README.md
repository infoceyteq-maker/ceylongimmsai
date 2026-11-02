# ceylongimmsai — AI GIMMS Hub

**AI GIMMS** · *Empowering Digital Evolution* · owner `info.ceyteq@gmail.com`

> Honesty note: the original v7.2.0 app (93 files, commit `5eecfad`) was NOT present in
> this workspace. This is a fresh, working implementation built from the handoff spec so the
> hub can go live. `public/logo-512.png` is a **placeholder wordmark**, not the supplied logo.
> See `HANDOFF.md` for the verified state of GitHub / Vercel / Supabase.

## Run

```bash
npm install
npm run dev            # http://0.0.0.0:3000
```

`npx tsc --noEmit` and `npx next build` must both be clean.

## Storage drivers (`lib/store.ts`, server-only)

1. **postgres** — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `HUB_STATE_TABLE` (default
   `hub_state`). Reads/writes the single row `id='hub'` in `public.hub_state` through the
   Supabase REST API with the service-role key. RLS: only `service_role` may touch it.
2. **file** — `data/store.json` (writable filesystem).
3. **memory** — read-only host fallback; never throws, never 500s.

`GET /api/bootstrap` reports the driver that actually ran in `storage`.

## Pages

`/` `/tasks` `/approvals` `/clients` `/agents` `/status` `/research` `/publishing`
`/audience` `/connections` `/callcenter` `/memory` `/production`

## APIs

- `GET /api/bootstrap` → `{ provider: "demo", storage, counts, connected, state }`
- `GET|POST /api/tasks` → list / create a task (persists in postgres)
- `GET /api/connect` → channels, `connected: 0`; `POST` returns 403 (no real key)

## Guardrails

- Never commit `.env.local`; credentials stay server-side; Anthropic removed.
- `/connections` stays at **0 connected** until a real key exists.
- Publishing stays **MANUAL**: package → outbox → human posts → link.
- No Google Flow / Veo claims (no public API). No invented handles or citations.
- Light ash page, black type `#0B0D0F`, green only for actions.
- Live 3D = real-time 2D-canvas perspective in `components/Scene3D.tsx`, no Three.js, no CDN.
- One contact only: `info.ceyteq@gmail.com`.
