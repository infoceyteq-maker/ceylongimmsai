# GIMMS — P1-01 Implementation Plan: "HR, Finance & Administration" FIRST

**Date:** 2026-11-03 (Asia/Colombo) · **Branch:** `arena/04c0f4ed-ceylongimmsai` (`active`)
**HEAD:** `5a7e67b` (merge of PR #4) · **Tree:** clean
**Status:** **PLAN ONLY — IMPLEMENTATION APPROVAL STILL PENDING.** No code written, no deployment,
no purchase, no credential, no production change. The Owner's approval question for the Tier A
build was skipped (not approved), so **no implementation has started**. Master Doc v1.3 §8 requires
the Owner to review and explicitly approve an implementation plan before work outside the
already-approved P0 scope. At the time of writing this document was uncommitted; it was subsequently
committed and submitted in a separate PR at the Owner's request so it can be reviewed on `main`.

---

## 1. Current verified stage (not a future proposal)

| Area | Verified fact | Evidence |
|---|---|---|
| Branch / main | `arena/04c0f4ed-ceylongimmsai` @ `5a7e67b`; PRs **#1–#4 all MERGED** | `git log`, `gh pr list` |
| Merged content | working app (13 pages) → preview fix → **P0 Phase 0** → status/handoff docs | PR #1/#2/#3/#4 |
| Code | 55 tracked files · 14 pages · 6 API routes · 10 departments / 69 divisions / 156 roles · 34 deterministic skills | `git ls-files`, `lib/departments.ts` |
| Last local verification | `tsc 0`, `build 0` (16/16), 14/14 pages `200`, `skill_executed_ok=34`, `skill_failed=0`, routing/guards/persistence, `connected:0` | `phase0-verification-0a231881.txt` (committed; run on the previous branch, same code as `5a7e67b`) |
| This fresh checkout | `node_modules` absent, no port-3000 listener, no local re-run yet | `git status`, `ss` |
| Public live site | `ai-gimms-hub.vercel.app` → `postgres`, `7/6/2`, `connected:0`, `provider:"demo"`, `publishing:"MANUAL"`; still `dpl_5aSZ…` from `fafcb51` — **P0 is not on the public live site** | `/api/bootstrap?cb=stage-04c0f4ed`, Vercel |
| Connections | 5 channels **all `connected:false`**; `googleFlowVeo:"No public API — not connected."`; `No API keys configured` | `/api/connect?cb=stage-04c0f4ed` |
| Git-linked project | `ceylongimmsai` production from `5a7e67b` = READY / PROMOTED, `public:false` / Vercel SSO — deployed but **not publicly verified** | Vercel |
| AI stack | 0 AI SDKs, 0 plugins, 0 MCP servers, 0 function-calling | `package.json` |

### Honest classification

| Class | Items |
|---|---|
| **DONE & TESTED** | P0 registry / job model / 13-state machine / routing / 34 local skills / 3 APIs / 1 page; PR #1–#4 merged into `main` |
| **PARTIAL** | **Dept 01 registered, not functional**: `status:"active-p0"`, 8 divisions / 23 roles, 3 safe skills, `externalNeedsConnected: 0` |
| **PENDING** | Dept 01 real job workflows, division-level skills, QA + approval gates, completion evidence, dept-specific page, local end-to-end tests |
| **BLOCKED** | Real payments / payroll / payouts, legal advice, e-signature, accounting API, production deploy — need credentials, paid decisions and explicit financial/legal authorization |

A UI or a registry entry does **not** make a department functional (Master Doc §3).

---

## 2. What "ඉවර / finished" can honestly mean

| Tier | Includes | Needs | Honest end state |
|---|---|---|---|
| **A — Native credential-free (can build after approval)** | 8 divisions → real job types, 23 role mappings, ~22 deterministic skills, full 13-state lifecycle with QA + versioned approval, SHA-256 evidence, audit trail, local persistence, `/departments/01` page, verification script | **Only Owner approval of this plan** | "Dept 01 workflows **working and tested locally**" — NOT client-ready LIVE finance |
| **B — External integration prep** | Env-name lists, handler contracts + mocked tests, provider/app-review checklists, `UNVERIFIED` labels | Owner decision on accounts; **no keys requested or stored** | `connected:0` still; specifications only |
| **C — Full LIVE finance** | real payment execution, payroll run, accounting sync, e-signature, production deploy | Credentials + paid tiers + financial/legal authorization + authenticated tests | `connected:true` **only after** an authenticated test; cannot be claimed now |

**Hard boundary already in code** — Dept 01 `mustNot`:
`execute payments`, `run payroll`, `move money`, `give legal advice`, `sign agreements`.
Dept 01 `externalNeeds`: `payment gateway API`, `accounting API`, `e-signature service` — currently **0 connected**.
Therefore Tier A must never be reported as "HR Finance සම්පූර්ණයි / LIVE". It is the
**first functional layer**, and it is the maximum honest scope without credentials.

**Priority check:** Owner's 7-priority order is `01, 02, 04, 03, 05, 09, 10` — Dept **01 is already first**,
so "මුලින්ම HR Finance" matches the approved architecture. Departments 06 / 07 / 08 stay deferred.

---

## 3. Proposed Tier A build — reuse, DO NOT rebuild or duplicate

| File | Change | Reuses |
|---|---|---|
| `lib/departments.ts` | extend Dept 01 `safeSkills` with the new skill IDs; keep `active-p0` → `active-p1` only after tests pass | existing registry |
| `lib/skills.ts` | implement the new Dept 01 deterministic skills behind the **existing one gateway** (`POST /api/skills`), each `requiresExternal:false`, real `steps` + `evidence` + SHA-256 | `runSkill`, `SkillResult`, `hash`, `createJob`, `transitionJob` |
| `lib/jobs.ts` | no rewrite — optionally add a `division` / `approver` / `artifactVersion` field used by QA + `APPROVAL` gates | existing 13-state machine, `typedAudit`, `newId` |
| `app/api/jobs/route.ts`, `app/api/skills/route.ts`, `app/api/departments/route.ts` | no new gateway; optional `departmentId` filter for reads | existing APIs |
| `app/departments/01/page.tsx` | division tabs, per-division job intake, role selector, status/approval timeline, evidence view | existing `HubShell`, `Panels` CSS, `/departments` page patterns |
| `components/HubShell.tsx` | one nav entry (optional) | existing nav |
| `scripts/verify-p1-01.sh` + `p1-01-verification.txt` | real job execution per division (not UI responses) | `scripts/verify-phase0.sh` pattern |
| `GIMMS-P1-01-REPORT.md` | verified results + honest classification + remaining integrations | `GIMMS-PHASE0-REPORT.md` pattern |
| `package.json` / lockfile | **unchanged** — no new dependency | — |

### Division → job types → deterministic skills (8 divisions, 23 roles)

| Division | Job types / skills (all DRAFT or CHECK only) |
|---|---|
| 1.1 Finance & Accounting (4 roles) | `invoice.draft`, `expense.draft`, `finance.reconciliation.check`, `finance.pl.draft` (income / expenses / P&L / cash-flow summary) |
| 1.2 Budgeting & Planning (3) | `finance.budget.draft`, `finance.budget.variance` |
| 1.3 Outstanding & Receivables (3) | `finance.ar.register`, `finance.ar.aging` (aging buckets, due dates) |
| 1.4 Payments, Payouts & Payables (3) | `finance.payment.request` (**DRAFT ONLY**), `finance.ap.register` — never executes a payment |
| 1.5 Human Resources (4) | `hr.employee.record`, `hr.leave.record`, `hr.onboarding.checklist` |
| 1.6 Payroll & Benefits (1) | `hr.payroll.draft` (**DRAFT ONLY**), `hr.payslip.draft` — never runs payroll / moves money |
| 1.7 Legal & Documentation (3) | `legal.contract.register`, `legal.renewal.check`, `document.register` — no legal advice, no signing |
| 1.8 Administration (2) | `admin.asset.register`, `admin.meeting.record`, `admin.request.register` |

Every skill returns `blocked[]` explicitly where an external credential / Owner approval is required
(e.g. payment request, payroll draft, e-signature). No skill calls an external API, moves money,
signs a document, gives legal advice or publishes anything.

### Job lifecycle & approval gate (Master Doc §3)

`NEW → REVIEW → ASSIGN → IN_PROGRESS → QUALITY_CHECK → APPROVAL → DELIVERY → COMPLETE`,
plus `BLOCKED / FAILED / ON_HOLD / CANCELLED / REOPENED`. At `APPROVAL` the job must carry
`approver`, exact `artifactVersion`, scope and timestamp; any revision returns it to `REVIEW`.
Illegal transitions must be rejected with `400`. Every job is persisted and reloadable.

### Acceptance tests (real execution, not UI/chatbot responses)

- `npx tsc --noEmit` → `0`; `npx next build` → `0`, 0 warnings; 15/15 pages `200` (14 + `/departments/01`).
- One **real persisted job per division** with correct `division` + `jobRole`; `job_present_after_reload 1`.
- Every new skill executed → `skill_executed_ok=N`, `skill_failed=0`, each with a real SHA-256 evidence hash.
- Full 8-state lifecycle succeeds; illegal transitions (e.g. `REVIEW → COMPLETE`) → `400`.
- Payment / payroll / e-signature guards prove **no execution** (`blocked[]` populated, no state change).
- `"connected":0`, `publishing:"MANUAL"`, no `.env.local`, no secret value printed or obtained.
- `git diff --stat origin/main...HEAD` shows only additive Tier A files; no new dependency.

### Explicitly NOT in Tier A

deploy to Vercel · purchase / paid tier · API key / OAuth / app review · external plugin or MCP install ·
production `public.hub_state` write · real payment / payroll / payout / refund · legal advice / e-signature ·
public posting / calls · AI model call or media generation · auto-approval · per-client RLS migration ·
activation of deferred departments 06 / 07 / 08.

---

## 4. Owner lists (names only — no values)

| List | Items |
|---|---|
| **Approval needed NOW** | Approve / narrow this Tier A plan (Master Doc §8). No work starts before that. |
| **Approval needed LATER (Tier C)** | financial transactions, payroll execution, legal actions, e-signature, production deployment, permission changes |
| **Credentials (names only, later, via approved secrets manager)** | payment gateway key, accounting API credential, e-signature token; server-side env vars only. Never in chat or Git. |
| **Paid / account decisions** | payment gateway account + fees, accounting SaaS, e-signature plan, Meta/other app reviews if publishing is ever added |
| **New development (after approval)** | the Tier A files in §3; then handler contracts + mocked tests for the 3 external needs; then authenticated connection tests **after** a real credential exists |

`connected:true` and LIVE are permitted **only after an authenticated test with raw evidence**.

---

## 5. Side-effect statement of THIS PLAN

Documentation only. No code, no dependency, no install, no purchase, no credential, no deployment,
no production data change, no external sending, no secret value. `connected:0` and `MANUAL` unchanged.
The four external command packets in `GIMMS-EXTERNAL-COMMAND-PACK.md` remain **prepared, not sent**.

**Postscript (PR):** this document was committed to `arena/04c0f4ed-ceylongimmsai` and submitted in
a docs-only PR at the Owner's explicit request. That PR adds **one Markdown plan file** — no
implementation. The Tier A / Tier B / Full LIVE scope decision in §2 is **still unanswered**, so
nothing in §3 is being built yet. A PR merge is not an implementation approval.
