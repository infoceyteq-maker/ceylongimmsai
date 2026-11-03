# Security Policy

## Supported version

Only the latest `main` branch and the active Arena development branch are supported. Older deployments are not security-supported.

## Reporting a vulnerability

Please do not open a public issue with exploit details, credentials, personal data, or client data.

1. Preferred: use GitHub private vulnerability reporting / repository security advisories if enabled for this repository.
2. If private reporting is unavailable, contact the existing project contact: `info.ceyteq@gmail.com`.
3. Include the affected route/file, reproduction steps, impact, and any suggested fix. Do **not** include live secrets, passwords, API keys, OAuth tokens, or client records.

We aim to acknowledge reports promptly, triage by severity, and coordinate a fix and disclosure. No system is claimed to be 100% secure.

## Scope

In scope: this repository, its Next.js API routes, owner authentication, agent policy/tool gates, Supabase access patterns used by this app, and GitHub Actions workflows.

Out of scope without separate written authorization: denial-of-service, social engineering, physical attacks, invasive penetration tests against production, third-party services not owned by the project, and any test that modifies production data or spends money.
