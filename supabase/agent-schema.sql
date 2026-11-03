-- ============================================================================
-- GIMMS AUTO-PILOT — Supabase schema
--
-- Apply this ONCE, entirely in the browser (no local CLI, no PowerShell):
--   Supabase dashboard → your project → SQL Editor → New query → paste → Run
--
-- WHY IT IS NEEDED
--   Vercel serverless functions have a read-only project filesystem and an
--   ephemeral /tmp. A browser job is dispatched from one instance and reports back
--   to a different one, so the job record MUST live in a shared store. Files cannot
--   do this. Until this runs, the console honestly reports `durable: false`.
--
-- SAFETY
--   Both tables are RLS-enabled with NO policies, so the anon and authenticated
--   roles can read nothing. Only the service_role key (server-side only, never sent
--   to a browser) can touch them.
-- ============================================================================

create table if not exists public.gimms_agent_jobs (
  id          text primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      text        not null,
  kind        text        not null,
  platform    text,
  created_by  text,
  job         jsonb       not null
);

create index if not exists gimms_agent_jobs_updated_at_idx
  on public.gimms_agent_jobs (updated_at desc);

create index if not exists gimms_agent_jobs_status_idx
  on public.gimms_agent_jobs (status);

-- Audit trail of every console action. Append-only by convention; the app never
-- deletes rows here.
create table if not exists public.gimms_agent_audit (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       text        not null,
  action      text        not null,
  job_id      text,
  detail      jsonb
);

create index if not exists gimms_agent_audit_at_idx
  on public.gimms_agent_audit (at desc);

-- ── Lock both tables down -----------------------------------------------------
alter table public.gimms_agent_jobs  enable row level security;
alter table public.gimms_agent_audit enable row level security;

-- No policies are created on purpose. With RLS enabled and zero policies, every
-- request made with the anon key returns zero rows. The server uses service_role,
-- which bypasses RLS. Do NOT add a "public read" policy here.

-- ── Verify (run this separately after the migration) --------------------------
-- select tablename, rowsecurity
--   from pg_tables
--  where schemaname = 'public' and tablename like 'gimms_agent%';
-- Expected: both rows show rowsecurity = true.
