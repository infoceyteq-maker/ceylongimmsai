# GIMMS P1-01 — Missing Integration Requests (Owner review)

**Date:** 2026-11-03 (Asia/Colombo)  
**Branch:** `arena/219acd89-ceylongimmsai`  
**Status:** **PREPARED FOR OWNER REVIEW — NOT SENT, NOT REQUESTED, NOT PURCHASED, NOT CONFIGURED, NOT CONNECTED.**  
**Companion:** `GIMMS-DEPT01-IMPLEMENTATION-REPORT.md`, raw evidence `dept01-verification.txt`.

> No API key, token, password or secret VALUE appears in this document — credential **NAMES only**.
> `connected:0`, `testedAuthenticatedConnections:0`, `publishing:MANUAL` remain unchanged.
> A PR merge, a local test or a UI page is **not** an integration approval.

---

## 0. What is already done locally (so requests are not duplicated)

- 80 new native Dept 01 skills behind the **existing single `POST /api/skills` gateway**; 114 total skills, 0 failures.
- Real `.docx` / `.xlsx` / `.pptx` / `.pdf` / `.eml` / `.ics` files generated with Node built-ins (zero new npm dependency), validated with Python `zipfile` + `xml.etree`.
- Deterministic PDF create/edit/convert/merge/split/form-fill/text-extract/summarise for GIMMS-generated text PDFs.
- 10 role-based agent contracts, EMP-0001 proposal, versioned approvals, and a real HR→Management→Production→QA→OWNER APPROVAL job chain.
- Local Owner command executed 5/5 steps. `DEPT01_TESTS_PASS=88`, `DEPT01_TESTS_FAIL=0`.

**These are LOCAL FILES and LOCAL RECORDS, not integrations.** The items below are what remains to make Dept 01 genuinely LIVE.

---

## 1. Approval gates (each requires a separate, explicit Owner decision)

| # | Gate | Not performed in this task |
| --- | --- | --- |
| G1 | Microsoft 365 / Graph tenant + app registration + consent | NOT DONE |
| G2 | Google Cloud project + OAuth consent / app verification | NOT DONE |
| G3 | Auth provider for EMP-0001 secure login (Supabase Auth) | NOT DONE |
| G4 | Payment gateway / accounting API / live financial accounts | NOT DONE |
| G5 | Payroll RUN / real salary payment | NOT DONE |
| G6 | E-signature + qualified legal review | NOT DONE |
| G7 | SMTP / calendar sending & syncing | NOT DONE |
| G8 | AI model / SDK / MCP / function-calling provider | NOT DONE |
| G9 | Paid plans (e.g. Vercel Password Protection Pro) | NOT PURCHASED — price NOT re-verified |
| G10 | Production deployment / live permission changes / RLS migration | NOT DONE |
| G11 | Social-media OAuth, own model, AI video model (previous external packets A–D) | PACKETS PREPARED, **NOT SENT** |

---

## 2. Microsoft Office / Microsoft 365 request

**Why:** native OOXML generation produces compatible files locally, but no real Word/Excel/PowerPoint document is created, opened, co-authored, stored or tracked in a Microsoft tenant.

| Item | Detail | Credential NAME |
| --- | --- | --- |
| Tenant + Entra app registration | Owner-approved Microsoft 365 tenant, app registration, admin consent | `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_CLIENT_ID` |
| Application secret | Server-side only, approved secrets manager | `MICROSOFT_GRAPH_CLIENT_SECRET` |
| Graph scopes | `Files.ReadWrite`, `Sites.ReadWrite.All`, `Mail.Send`, `Calendars.ReadWrite` | — |
| Word/Excel/PowerPoint | Create/open/edit real documents; visual interoperability test in actual Office apps | — |
| Outlook | Send real mail (currently `.eml` DRAFT only, never sent) | — |
| SharePoint / OneDrive | Real document storage/versioning (currently local SHA-256 index) | — |

**Acceptance test before `connected:true`:** authenticated Graph call creates a real file, reads it back, and returns raw evidence (IDs, timestamps, SHA-256). Until then: **NOT CONNECTED**.

---

## 3. Google Workspace request

| Service | Current local equivalent | Required | Credential NAME |
| --- | --- | --- | --- |
| Google Docs | `.md` + `.docx` | Docs API create/read test | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_SERVICE_ACCOUNT_KEY` |
| Google Sheets | `.csv` + `.xlsx` | Sheets API create/read test | same |
| Google Slides | `.pptx` | Slides API create/read test | same |
| Google Drive | local JSON file index (`uploadedToDrive=false`) | Drive upload/list/permission test | same |
| Gmail | `.eml` DRAFT never sent | Gmail API authenticated send-test (Owner-approved recipient only) | same |
| Google Calendar | `.ics` TENTATIVE, zero invites | Calendar API event create/read test | same |
| Consent | — | OAuth consent screen + app verification if external | — |

**Acceptance test before `connected:true`:** one authenticated create + read-back per API with raw evidence. Until then: **NOT CONNECTED**.

---

## 4. PDF / document capability gaps (library, not credential)

| Gap | Why native is insufficient | Owner action |
| --- | --- | --- |
| General PDF library | Native writer only handles GIMMS-generated text PDFs | Approve library addition (would be a **new** dependency — separate approval) |
| AcroForm / interactive fields | `pdf.form.fill` is flat text | Approve library + test |
| OCR / scanned PDF | No OCR engine | Approve OCR service/library |
| PDF digital signature / e-signature | No certificates, no provider | G6 + provider account |
| Sinhala / non-Latin fonts | Helvetica/WinAnsi replaces non-Latin glyphs with `?` | Approve font licensing + embedding |
| True page-tree merge/split | Current merge/split rebuild text lines, not object streams | Approve library |
| PDF/A, redaction, encryption | Not implemented | Approve scope |
| LLM summarisation / AI writing | `pdf.summarize` is deterministic frequency ranking, **NOT AI** | G8 |

---

## 5. EMP-0001 secure login / identity request

Current state: `EMP-0001`, Founder/Owner/Super Admin, **`PENDING_SECURE_REGISTRATION`**, `secureLogin.implemented=false`, `realDetailsStored=false`. Owner dashboard, approval permissions and command interface exist **locally** only.

| Item | Detail |
| --- | --- |
| Auth provider | Supabase Auth on the existing `kkyaekpsnjaualjiwirg` project — Owner approval required |
| Alternative | Vercel Password Protection is Pro/paid — **NOT purchased**, price NOT re-verified |
| MFA | Required; not configured |
| Session secrets | `SESSION_SECRET`, rotation policy — server-side only |
| Real Owner details | Only through an **authorised secure registration process**; no name/email/phone stored now |
| Per-client isolation | RLS on `public.hub_state` / Dept 01 tables — **not** prompt text |
| Production IAM | No live permission change was performed |

---

## 6. Finance / legal / payments request

| Item | Current status | Owner action |
| --- | --- | --- |
| Payment gateway | `finance.payment.request` → PENDING, `payment.execute` → **HTTP 403** | G4 + `PAYMENT_GATEWAY_API_KEY` + authenticated sandbox test |
| Accounting / ERP | No API; records are local DRAFTS | G4 + `ACCOUNTING_API_KEY` |
| Live financial accounts / bank feed | NOT accessed; `actualBankBalanceAvailable=false` | Separate Owner approval |
| Payroll RUN | Arithmetic only; `statutoryRatesApplied=false` | G5 + statutory rate source + qualified accountant |
| Statutory EPF / ETF / PAYE / tax | NOT invented; checklist only | Qualified accountant + official source |
| Invoices / quotations / reminders | DRAFTS, never sent/posted | G4/G7 |
| Agreements / legal | DRAFT, `legalAdviceGiven=false`, `signed=false` | G6 + qualified legal professional + e-signature provider |
| Publishing / public posting | MANUAL, 0 connected | Separate Owner approval |

---

## 7. AI layer / MCP / external-build packets

| Item | Current | Owner action |
| --- | --- | --- |
| AI SDK / LLM | 0 installed, 0 connected; `provider:"demo"` | G8 + `AI_MODEL_API_KEY` + authenticated test |
| MCP servers | 0 | Owner approval + server implementation + test |
| Function-calling / tool-use runtime | 0 | G8 |
| 10 role-based agents | `CONFIGURED_LOCAL_NO_MODEL`, deterministic contracts | G8 to become real AI agents |
| `owner.command.execute` | keyword parser, **NOT an AI model** | G8 for NLU |
| Social-media OAuth packets A–D | PREPARED in `GIMMS-EXTERNAL-COMMAND-PACK.md`, **NOT SENT** | Owner to send/build externally |
| "Our own" GIMMS model | NOT BUILT | Owner external build (ChatGPT / Gemini / AI Studio Pro) |
| AI video-generation model | NOT BUILT | Owner external build |
| Google Flow / Veo | No public API — NOT CONNECTED | Owner external build |

### Components that cannot be built natively (Owner to build externally, then integrate)

1. Social-media OAuth apps + app review (LinkedIn, Facebook, Instagram, X, YouTube).
2. A proprietary "our own" GIMMS model (data, training, compute, serving).
3. An AI video-generation model / render pipeline.
4. LLM writing, summarisation and natural-language command understanding.
5. Provider-side OAuth tenants and app verification for Microsoft 365 and Google Workspace.
6. Payment/accounting/e-signature/bank feeds and their compliance reviews.
7. OCR, AcroForm, general PDF tooling and licensed Sinhala fonts.

---

## 8. Integration contract (must hold for every future integration)

1. **Executable handler + one test per skill** — no prompt-only "skill" claims (Master Doc §6).
2. **One gateway** — everything goes through `POST /api/skills`; no duplicate dispatcher.
3. **Server-side env credentials** in an approved secrets manager; never in chat, Git, or client code.
4. **`connected:true` only after an authenticated test** with raw evidence; otherwise `connected:0` / MANUAL.
5. **No auto-posting, no payments, no calls, no destructive fixes**, no auto-approval.
6. **Financial transactions require appropriate, explicit, versioned Owner authorisation.**
7. **Client isolation via RLS**, not prompt text.
8. No secret VALUE is ever printed or logged; no production side effect without separate approval.

---

## 9. Summary of what this document does NOT do

- Does not request, generate, store or display any API key or secret value.
- Does not purchase any plan, install any plugin or add any npm dependency.
- Does not connect Microsoft Office, Google Workspace, Outlook, Gmail, Drive, payment, accounting, e-signature, auth, AI model, MCP or social media.
- Does not deploy, change production, move money, run payroll, sign a contract, send an email or post publicly.
- Does not claim Dept 01 is 100% complete or LIVE. Local tests passed (**88/88**); real integrations remain **MISSING / BLOCKED** pending Owner decisions.
