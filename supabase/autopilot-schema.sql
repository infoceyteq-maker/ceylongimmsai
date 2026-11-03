-- ============================================================================
-- GIMMS AUTO-PILOT v3 — OPTIONAL TOKEN VAULT
--
-- v3 DOES NOT REQUIRE THIS FILE. The default wiring keeps the Gmail refresh token
-- as a Vercel environment variable, which is the smallest correct thing for a
-- single-tenant, single-mailbox hub.
--
-- Apply this ONLY if you later decide that OAuth tokens must live in the database
-- instead of Vercel env (e.g. multiple mailboxes, or re-auth without a redeploy).
-- It is written so that a stolen anon key cannot read it.
--
-- HOW TO APPLY (manual, by you — never by the agent):
--   1. Open https://supabase.com/dashboard  → your project
--   2. SQL Editor → New query → paste this whole file → Run
--   3. Expected: "Success. No rows returned"
--
-- WHAT IT STORES: an AES-256-GCM encrypted blob, the IV, and a key version.
-- WHAT IT NEVER STORES: a plaintext token, a password, or the encryption key
-- (that key stays in the server environment as AUTOPILOT_VAULT_KEY).
-- ============================================================================

create table if not exists public.autopilot_secrets (
  -- e.g. 'gmail:info.ceyteq@gmail.com'
  id            text primary key,
  provider      text not null check (provider in ('gmail', 'meta', 'voice')),
  -- base64 of iv || authTag || ciphertext. Opaque to the database.
  ciphertext    text not null,
  key_version   integer not null default 1,
  scopes        text[] not null default '{}',
  -- 'refresh_token' | 'access_token'
  token_kind    text not null check (token_kind in ('refresh_token', 'access_token')),
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.autopilot_secrets is
  'Encrypted OAuth material for the Auto-Pilot. Service-role only; no anon or authenticated access.';

-- RLS: enabled, and NO policy that permits anon/authenticated access. With RLS on
-- and no permissive policy, those roles read zero rows. Only the service_role key
-- (used server-side by the hub) bypasses RLS.
alter table public.autopilot_secrets enable row level security;
alter table public.autopilot_secrets force row level security;

revoke all on table public.autopilot_secrets from anon, authenticated;

-- Keep updated_at honest without trusting the application.
create or replace function public.autopilot_secrets_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists autopilot_secrets_touch on public.autopilot_secrets;
create trigger autopilot_secrets_touch
  before update on public.autopilot_secrets
  for each row execute function public.autopilot_secrets_touch();

-- ---------------------------------------------------------------------------
-- VERIFY (run this after applying; expect exactly one row, rowsecurity = true)
-- ---------------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public' and tablename = 'autopilot_secrets';
