# GIMMS — Components the Development Agent CANNOT build natively

**Owner request:** separate list of things to build with ChatGPT / Gemini / Google AI Studio Pro and
integrate later. **Date:** 2026-11-03 (Asia/Colombo) · **Branch:** `arena/0a231881-ceylongimmsai`
**Status:** HANDOFF LIST ONLY. Nothing here is built, installed, purchased, sent, connected, deployed
or tested by the Development Agent. No credential value appears in this file.

---

## 0. The boundary

| I CAN build inside the repo | I CANNOT build inside the repo |
|---|---|
| TypeScript / Next.js code, API routes, schemas, migrations (draft), job workflows, deterministic skills, test harnesses, one gateway, evidence/audit records | Create provider accounts, pass OAuth app review / business verification, accept legal terms, obtain or hold API keys, buy paid tiers, accept billing, grant permissions |
| Mock/stub handlers + automated tests that prove they are NOT live | Train or fine-tune a model, run GPU compute, host model weights, generate real video/voice/images through a proprietary model, evaluate model quality |
| RLS policy drafts, `connected:true` logic gated behind an authenticated test | Mark `connected:true` without a real credential + authenticated test, post publicly, place calls, move money, sign documents, change production systems |

**Verified starting point:** `package.json` has no AI SDK. `/api/connect` returns 5 channels, all
`connected:false`, `googleFlowVeo:"No public API — not connected."`, note `No API keys configured`.
`/api/bootstrap` returns `provider:"demo"`, `publishing:"MANUAL"`. `lib/skills.ts` explicitly states
no skill generates an image, renders a video, places a call, moves money, publishes a post or calls
an external API. All 34 existing skills are deterministic local routines.

> Channel notes, scopes and provider constraints quoted in §1 are **our own app's recorded values**
> (from live `/api/connect`), not independently verified official provider documentation.
> Official availability, pricing, quotas and licence terms were **NOT verified in this sandbox**.
> Owner / external AI must verify them from official sources and label anything unverified.

---

## 1. A — Social Media Connections (Owner's first priority)

Verified live `GET /api/connect?cb=status-0a231881`:

| Channel | Recorded scope | Recorded blocker note | Status |
|---|---|---|---|
| LinkedIn | `w_member_social` | "Page posting needs a company page token." | `connected:false` |
| Facebook Page | `pages_manage_posts` | "Requires a Meta app review for pages_manage_posts." | `connected:false` |
| Instagram | `instagram_content_publish` | "Business account only; media must be hosted first." | `connected:false` |
| X | `tweet.write` | "Paid API tier required for write access." | `connected:false` |
| YouTube | `youtube.upload` | "Upload quota is per-project, per day." | `connected:false` |

Not even registered as channels yet: WhatsApp Cloud API, TikTok, Google Business Profile,
Meta Ads, Google Ads, LinkedIn Company Pages, email/SMTP, Telegram.

### What must be produced outside (Owner + ChatGPT / Gemini / AI Studio Pro)

1. **Provider account + app setup checklist** per channel: which account, which app type, admin role,
   OAuth redirect URLs, consent screen, verification / app-review submission, test users, sandbox.
2. **Exact scope list** per channel and why each is needed; least-privilege alternatives.
3. **Webhook contract**: subscription fields, signature verification, verify-token handling, replay
   protection, retry/idempotency, and a log-only handler that performs no publication.
4. **Handler skeletons** (TypeScript) matching the integration contract in §6, plus one automated
   test each using mocks — with an explicit assertion that the handler stays `connected:false`
   until a real authenticated test exists.
5. **Credential name list only** (no values). Examples of proposed names — nothing is stored here:
   `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`,
   `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`,
   `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_BEARER_TOKEN`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_ACCESS_TOKEN`.
6. **Publishing policy**: `MANUAL` until the Owner approves an exact artifact version, recipient
   and schedule. No auto-posting, no auto-boost, no ad spend.
7. **Official-link verification table**: availability, price/tier, quota, licence, rate limit,
   data-retention terms — each row marked `VERIFIED / UNVERIFIED` with the source URL.

### What I can build AFTER approval + credentials

One server-side gateway, `/api/connect` write path that refuses `connected:true` until an
authenticated test passes, per-channel skill records with `requiresExternal:true`, mocked tests,
approval/versioned publishing records, and audit evidence. **LIVE means authenticated tested
connection, not a UI placeholder.**

---

## 2. B — "අපේම කියලා Model එක" (our own model)

First decision the Owner must make — these are three different products:

| Option | What it really is | Native? |
|---|---|---|
| B1 Branded wrapper / prompt layer | Own system prompt, routing, guardrails, model selector, our UI + logs | **Yes — native** (needs one LLM provider credential) |
| B2 Own knowledge base (RAG) | Our documents, embeddings, retrieval, per-client isolation, citations | **Hybrid** (native code + embedding/vector service) |
| B3 Fine-tuned / custom weights | Own dataset, training job, model weights, evaluation, hosted endpoint | **No — external** (compute + dataset + licence) |

### Cannot be built natively

- Owning/cleaning/labelling a training dataset; consent, copyright and client-data licensing.
- GPU training / fine-tuning / LoRA / distillation runs, experiment tracking, checkpoint storage.
- Model evaluation: benchmark set, scoring rubric, hallucination/safety/bias/quality measurements.
- Model registry, versioning, rollout/rollback, endpoint hosting, autoscaling, latency/cost control.
- Verifying real model availability, exact model IDs, quotas and pricing from official sources.

### What must be produced outside

- Decision matrix B1/B2/B3 with trade-offs, cost, lock-in, maintenance, data-privacy impact.
- Dataset specification + JSONL template (synthetic examples only; **no real client data, no secrets**).
- Consent / licence / retention checklist; PII redaction rules; client-isolation requirements.
- Evaluation set + scoring rubric + model card + training config + fallback plan.
- Provider evaluation per Master Doc §5: OpenAI GPT, Google Gemini, Anthropic Claude
  (**README guardrail says Anthropic removed — needs explicit re-approval first**), xAI Grok,
  DeepSeek, Mistral, Llama via inference provider, Perplexity, Cohere, Qwen. For each: exact model
  ID, API availability, SDK, auth, streaming, tool/function calling, multimodal support, pricing,
  quota, connection-test result, blockers — `UNVERIFIED` where not checked.

### Native part I can build after approval

One chat gateway with model selection, streaming, scoped tool execution, department/task routing,
human handoff, conversation history, cost/rate-limit logs, safe fallback, and RLS-based client
isolation (never prompt-text isolation).

---

## 3. C — AI Video Generation Model (Owner's third priority)

**Verified fact:** `GET /api/connect` returns `googleFlowVeo:"No public API — not connected."`
Google Flow / Veo is **not connected** and is **not** claimed as an available API here. Official
availability must be verified by the Owner; nothing is assumed.

Master Doc §6 requires a **22-row capability matrix** for the VIDEO EDITOR role — concept
generation, scriptwriting, storyboarding, scene planning, asset management, image generation,
text-to-video, image-to-video, scene/clip selection, cut/trim, transitions, compositing,
speech-to-text, subtitles, text-to-speech, voiceover, audio mixing, aspect-ratio variants,
reel editing, quality checks, encoding/rendering/export, client approval. Each row must be
classified **Native / External model / Local editing software / API or plugin / Hybrid**, with
provider, exact capability, official docs, auth, cost, test status and blockers.

### Cannot be built natively

- Text-to-video / image-to-video inference, GPU rendering, encoding/export, upscaling.
- TTS/STT, voice cloning, subtitles, lip-sync, audio mixing, music/licence clearance.
- Proprietary model access, quota, watermark/usage rights, content-safety review, cost per minute.
- Claiming any provider is available or priced correctly without official verification.

### What must be produced outside

1. Provider comparison with **official** availability, pricing, licence, quota, output rights —
   each row `VERIFIED / UNVERIFIED` with source URL; explicitly state if Flow/Veo has no public API.
2. 22-row capability matrix in the format above (Native / External / Hybrid + tradeoffs).
3. Prompt pack + storyboard template + shot list + aspect-ratio variants + brand-safety rules.
4. Handler contract per external row, matching §6, with a mock test that proves no fake
   "video generated" claim.
5. Test-clip acceptance criteria (duration, resolution, audio, subtitles, brand, QA evidence).
6. Rights/consent checklist: talent, voice, music, client assets, disclosure of AI-generated media.

### Native part I can build after approval

Script/storyboard/QA/delivery/approval job records, asset registry, deterministic checks,
SHA-256 completion evidence, and the gateway that calls a real provider **only after** an
authenticated test. A prompt-only "skill" must never be described as video rendering.

---

## 4. D — Other external components (code-grounded)

From `lib/departments.ts` `externalNeeds` and Master Doc §5–§6. All currently
`externalNeedsConnected: 0`.

| Group | Components | Owner/external decision |
|---|---|---|
| LLM / chat | chat gateway, streaming, tool/function calling, KB/RAG, per-client RLS, human handoff, embed widget, conversation history, cost/quota tracking, safe fallback | provider + paid tier + approval |
| Production media | image generation, render/encode tooling, TTS/STT, voiceover | provider + compute + licence |
| Sales / ads / SEO | Meta Marketing API + app review, Google Ads API + developer token, SEO/SERP keyword data, email/SMTP | app review + paid tier + approval |
| Research | web search API, Perplexity API, LLM synthesis, SERP/keyword data | provider + quota |
| CRM / voice | chatbot LLM, telephony, STT/TTS, WhatsApp/Telegram channel API, call transfer, call recording consent | telecom/privacy approval |
| Finance / legal | payment gateway, accounting API, e-signature, payroll, invoicing, qualified professional review | financial/legal authorisation |
| System Ops | uptime/cloud monitoring, alert channel (SMTP/Slack), log storage, credit/usage metering, backup verification, login gate | account + possibly paid plan |
| Dept 06 (deferred) | model training compute, MCP runtime, plugin/function-calling registration, model evaluation lab | separate approval; deferred until 7 priorities work |
| Dept 07 / 08 (deferred) | LMS platform, payment gateway, donation gateway, safeguarding review process | separate approval |

**Full 10-department architecture stays preserved**; 06 / 07 / 08 remain defined but inactive.

---

## 5. Owner action lists (names only — no values)

| List | Items |
|---|---|
| **Credentials needed** | Provider API keys / OAuth client IDs & secrets / page or business tokens / webhook verify tokens / developer tokens / refresh tokens / SMTP credentials. Store **only** in an approved secrets manager or Vercel server-side env vars. Never paste values into chat, files or tickets. |
| **Paid / account decisions** | X write tier, Meta App Review + Business Verification, Google Ads developer token, YouTube quota, LLM provider billing, video provider billing, telephony, monitoring/alerting, Vercel plan if a login-gate feature needs it (verify current price). |
| **Owner approval required before** | any public posting, ad spend, payment/payroll, legal/e-signature action, live call, production deployment, permission change, client-data use in a dataset, activating departments 06/07/08. |
| **New development (after approval)** | external-skill registry with `requiresExternal:true`, one gateway, authenticated connection tests, RLS migration + tests, chat UI, publishing approval workflow, monitoring/alert ingestion, workflow A–G wiring, integration of the artifacts produced outside. |

---

## 6. Integration contract — anything built outside MUST follow this

1. **Executable handler + one automated test per skill.** A prompt, doc or screenshot is not a skill.
2. **One server-side gateway.** No provider call from browser code; no credential in client bundle.
3. **Secret handling.** Env names only in code/docs; values only in the approved secrets manager.
   Never print, log or commit a secret. No `.env.local` in Git.
4. **`connected:true` only after an authenticated test.** `/api/connect` currently refuses POST with
   `403 "A real API key must exist before a channel can be marked connected."` — keep this rule.
5. **LIVE = authenticated tested connection**, not a UI placeholder. Record timestamp, model/provider
   ID, scope tested and raw result.
6. **Shape must match the existing code.**
   - `POST /api/skills` → `{ "skillId": "...", "payload": { ... } }`
   - `SkillResult` → `{ ok, skillId, departmentId, kind, executedAt, steps[], evidence{}, blocked[], sha256, error? }`
   - `SkillDefinition` → `{ id, departmentId, kind: "check" | "draft", description, requiresExternal }`
   - External skills must be declared `requiresExternal:true` and stay blocked until credential + test.
   - Jobs use Master Doc §3 statuses: `NEW → REVIEW → ASSIGN → IN PROGRESS → QUALITY CHECK →
     APPROVAL → DELIVERY → COMPLETE`, plus `BLOCKED / FAILED / ON HOLD / CANCELLED / REOPENED`.
7. **MANUAL publishing** until the Owner approves exact version, recipient and scope. No auto-post,
   auto-pay, auto-call, auto-delete or destructive fix.
8. **Client isolation via RLS**, never prompt text.
9. **Honest reporting**: classify `DONE & TESTED / BUILT BUT UNTESTED / PARTIAL / MISSING /
   BLOCKED`. No invented completion percentage, deployment, integration or completion claim.

---

## 7. Honest closing statement

- 0 social channels connected · 0 AI model APIs connected · 0 AI SDKs · 0 plugins · 0 MCP servers ·
  0 function-calling · 0 functional departments · 0 client-ready AI services.
- No provider availability, pricing, quota or licence term was verified from official sources here.
- No credential was requested, received, stored or printed.
- Nothing in this file was sent to ChatGPT, Gemini or AI Studio Pro — see
  **`GIMMS-EXTERNAL-COMMAND-PACK.md`** for packets the Owner can paste.
