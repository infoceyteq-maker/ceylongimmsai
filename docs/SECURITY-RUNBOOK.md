# GIMMS Security Operations Runbook

**Status:** development documentation. These procedures are prepared, not executed against production. High-impact actions require explicit Owner approval.

## 1. Severity and response

| Severity | Example | Initial action |
|---|---|---|
| Critical | Anonymous production writes, public client/audit data, owner takeover, leaked service-role key | Contain first: stop promotion, revoke affected credential, restrict access; then investigate. |
| High | Auth bypass, CSRF bypass, tenant isolation failure, agent permission escalation | Patch on development branch, add regression test, request approval for release. |
| Medium | Missing monitoring, weak rate limiting, non-global lockout, stale security headers | Schedule fix and verify in CI/staging. |
| Low | Informational disclosure, hardening gap without direct exploit | Track and fix in normal development. |

## 2. Credential compromise

1. Identify the credential type and issuer (Vercel env, Supabase service role, Google OAuth, OpenAI/Gemini, worker secret). Never paste the value into chat or logs.
2. Revoke/rotate in the issuer dashboard. For Google OAuth, revoke the grant and re-consent with minimum scopes. For Supabase, rotate the service-role key in the Supabase dashboard and update Vercel env.
3. Update the replacement only in the hosting secret store / server environment.
4. Invalidate affected sessions/leases. For Owner identity, use password change (invalidates sessions) or remove the compromised Owner record only with approval and a tested backup.
5. Review access logs for the exposure window. Record a redacted incident receipt.
6. Verify the old credential fails and the new credential passes a harmless authenticated test.

## 3. Access revocation

- Owner session: `POST /api/owner` action `logout` revokes the current session; `change-password` invalidates all sessions.
- Agent worker: revoke `AGENT_WORKER_SECRET`, rotate on both worker and app, and cancel pending jobs. Per-job leases are single-use and expire.
- GitHub/Vercel/Supabase connector: remove the integration grant in the provider dashboard, then re-authorize only if needed.
- Do not approve permission changes requested by an agent itself. Owner approval is required.

## 4. Emergency containment (approval-gated for production)

- Stop production promotion/deployment.
- If a public endpoint is exposing data, prefer a verified rollback to a known-good deployment or an approved access restriction. Do not improvise DNS/firewall changes without approval.
- Disable agent dispatch by removing/rotating worker configuration only after approval; the default is already fail-closed when `AGENT_WORKER_URL`/`AGENT_WORKER_SECRET` are absent.
- Preserve logs and evidence before cleanup.

## 5. Backup and restore

1. Before any approved migration, export the affected Supabase tables/rows and record hashes/counts.
2. Store backups in an approved encrypted location with restricted access.
3. Test restore into an isolated project/schema first.
4. Rollback plan: restore the previous deployment and previous data snapshot; verify counts, auth gates, and redaction regressions.
5. Never delete or migrate production data without approval, tested backups, and a rollback plan.

## 6. Recovery verification checklist

- [ ] Production and staging SHAs identified and intended.
- [ ] Anonymous bootstrap returns `authenticated:false` and redacts clients/audit.
- [ ] Anonymous production mutations return 401; cross-origin mutations return 403.
- [ ] Owner registration requires bootstrap token in production; durable owner store reachable.
- [ ] Security headers present; admin routes gated.
- [ ] Dependency audit and secret-pattern scan pass; GitHub code/secret scanning reviewed.
- [ ] Agent policy refuses outbound/credential automation; worker not dispatched without configuration and approval.
- [ ] Incident receipt recorded with redacted evidence and Owner approval for high-impact actions.
