# GIMMS — Ready-to-Send External Command Packets

**Prepared for:** Owner to paste into ChatGPT / Gemini / Google AI Studio Pro.
**Date:** 2026-11-03 (Asia/Colombo) · **Branch:** `arena/0a231881-ceylongimmsai`
**Status:** PREPARED, **NOT SENT**. The Development Agent has no connection to those tools and cannot
send these packets. Copy each fenced block into the named tool yourself. Nothing here has been
installed, purchased, connected, deployed or tested. No credential value appears in this file.

**Why:** Owner said `Man laga Chat, Gemini, AI Studio Pro okkala polime inne` — use those Pro tools
to produce the specifications, datasets, prompt packs and handler skeletons that cannot be created
inside this repo; then bring the artifacts back here for integration + authenticated testing.

---

## How to use

1. Paste **one packet** into the named tool. Attach `GIMMS-MISSING-COMPONENTS.md` if the tool
   accepts files (it contains the verified starting state and the integration contract).
2. Do **not** paste API keys, tokens, passwords, client data or `.env.local` into any tool.
3. When the tool returns files, save them in this repo (e.g. `handoff/`) and tell the Development
   Agent. Nothing becomes `connected:true` until a real credential + authenticated test exists.
4. Every packet forbids invented provider facts. Anything not verified from an official source must
   be labelled `UNVERIFIED`.

---

## Packet A → ChatGPT — Social Media Connection Kit

```
ROLE: You are an integration architect producing a SPEC + CODE SKELETON ONLY. You are not connected
to any provider and you must not claim a connection, publication or test result.

CONTEXT (verified live state of the GIMMS Next.js app on 2026-11-03):
- GET /api/connect returns 5 channels, ALL connected:false:
  linkedin (scope w_member_social; note "Page posting needs a company page token"),
  facebook (pages_manage_posts; "Requires a Meta app review for pages_manage_posts"),
  instagram (instagram_content_publish; "Business account only; media must be hosted first"),
  x (tweet.write; "Paid API tier required for write access"),
  youtube (youtube.upload; "Upload quota is per-project, per day").
- googleFlowVeo: "No public API — not connected."  Note: "No API keys configured".
- publishing: MANUAL.  POST /api/connect currently returns 403 and refuses to mark connected.
- These notes are the app's own recorded values, NOT official provider documentation.

TASK: Produce a Social Media Connection Kit for the 5 channels above, plus a clearly separated
OPTIONAL section for WhatsApp Cloud API, TikTok, Google Business Profile, Meta Ads, Google Ads and
LinkedIn Company Pages. For each channel deliver:
1. Provider account + app setup checklist (account type, admin role, OAuth redirect, consent screen,
   verification / app review, test users, sandbox).
2. Exact least-privilege scopes, why each is needed, and a safer alternative if one exists.
3. Webhook contract: subscribed fields, signature verification, verify-token handling, replay
   protection, idempotency, and a LOG-ONLY handler that performs no publication.
4. TypeScript handler skeleton matching this contract:
   POST /api/skills  { "skillId": "...", "payload": { ... } }
   SkillResult { ok, skillId, departmentId, kind, executedAt, steps[], evidence{}, blocked[], sha256, error? }
   SkillDefinition { id, departmentId, kind: "check"|"draft", description, requiresExternal }
   External skills MUST be declared requiresExternal:true and stay blocked until credential + test.
5. One automated test per handler using mocks, asserting it stays connected:false before a real
   authenticated test.
6. Credential NAME list only (no values). Proposed names, nothing stored:
   META_APP_ID, META_APP_SECRET, META_PAGE_ACCESS_TOKEN, META_WEBHOOK_VERIFY_TOKEN,
   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, INSTAGRAM_BUSINESS_ACCOUNT_ID,
   X_CLIENT_ID, X_CLIENT_SECRET, X_BEARER_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
   YOUTUBE_REFRESH_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN.
7. Publishing policy: MANUAL until Owner approves exact version, recipient and schedule. No
   auto-post, no auto-boost, no ad spend.
8. Official-link verification table: availability, tier/price, quota, rate limit, licence, data
   retention — each row VERIFIED or UNVERIFIED with source URL.

STRICT RULES:
- Do not invent API availability, pricing, quotas, approvals or test results. Mark UNVERIFIED.
- Never output, request or guess any secret value. No keys, tokens or client data in the response.
- LIVE means an authenticated tested connection, never a UI placeholder. Stay connected:false.
- No public posting, no payment, no call, no deployment, no permission change.
- One server-side gateway only; no provider call from browser code.
- Client isolation via RLS, not prompt text.
- Output as separate, clearly named Markdown/TypeScript files plus a short MANIFEST.md listing
  exactly what was produced and what remains UNVERIFIED.
```

---

## Packet B → Gemini / Google AI Studio Pro — "Our Own Model" Decision & Dataset Pack

```
ROLE: You are an AI product architect. Produce a DECISION + DATASET/EVALUATION SPEC ONLY.
You are not training, hosting, deploying or connecting any model.

CONTEXT (verified 2026-11-03):
- GIMMS repo package.json has NO AI SDK (only next, react, react-dom, @types/*, typescript).
- Live /api/bootstrap returns provider:"demo", publishing:"MANUAL", connected:0.
- 0 connected AI APIs, 0 plugins, 0 MCP servers, 0 function-calling.
- 34 existing skills are deterministic local routines, NOT model calls.
- Master Doc §5 asks to evaluate (not assume connected): OpenAI GPT, Google Gemini, Anthropic
  Claude (existing README guardrail says Anthropic removed; explicit re-approval needed before
  inclusion), xAI Grok, DeepSeek, Mistral, Llama via inference provider, Perplexity, Cohere, Qwen.
- Master Doc §6 requires per-skill: native feasibility, specialized model necessity, API provider,
  exact capability, official docs, auth, plugin/MCP name, approvals/scopes, free vs paid, effort,
  cost, maintenance, priority, and Native/External/Hybrid recommendation.

TASK: Resolve "අපේම කියලා Model එක / our own model" into 3 clearly separated options:
B1 branded wrapper / prompt layer (native code + 1 LLM credential),
B2 own knowledge base / RAG (native code + embedding/vector service, per-client RLS),
B3 fine-tuned or custom weights (external dataset + training compute + hosted endpoint).
Deliver:
1. Decision matrix: trade-offs, cost, lock-in, maintenance, data privacy, time-to-first-test.
2. Dataset spec + JSONL template with SYNTHETIC examples only. No real client data, no secrets.
3. Consent / copyright / licence / retention checklist; PII redaction rules; client-isolation rules.
4. Evaluation set + scoring rubric + model card + training config + rollback/fallback plan.
5. Provider evaluation table for the Master Doc §5 list: exact model ID, API availability, SDK,
   auth method, streaming, tool/function calling, multimodal support, pricing, quotas,
   connection-test result, blockers — VERIFIED / UNVERIFIED with official source URLs.
6. Native-scope list: one chat gateway with model selector, streaming, scoped tool execution,
   department/task routing, human handoff, conversation history, cost/rate-limit logs, safe
   fallback, RLS-based client isolation.
7. A 10-row Master Doc §6 skill inventory example using this exact row format:
   Department | Division | Job Role | AI Skill/Function | Internal Skill? | External Tool/API? |
   Plugin/MCP? | Key/OAuth? | Connected Status | Test Evidence | Priority | Cost/Estimate

STRICT RULES:
- Do not invent model availability, IDs, pricing, quotas, benchmarks or test results. UNVERIFIED.
- Never output, request or guess any credential value. No client data in datasets or examples.
- State that a fine-tuned model cannot be produced by repo code alone.
- Anthropic Claude requires explicit Owner re-approval before inclusion — do not assume it.
- connected:true only after an authenticated test; no claim of a live connection.
- No training run, no deployment, no purchase, no permission change.
- Output as separate Markdown/JSONL files + MANIFEST.md with an explicit UNVERIFIED list.
```

---

## Packet C → Gemini AI Studio / video-capable Pro tool — AI Video Generation Matrix

```
ROLE: You are a media-AI architect. Produce a CAPABILITY MATRIX + PROMPT/HANDLER SPEC ONLY.
You are not generating, rendering, uploading or publishing any real video.

CONTEXT (verified 2026-11-03):
- GET /api/connect: googleFlowVeo = "No public API — not connected." Do NOT assume Flow/Veo is
  available as a public API; verify officially and mark UNVERIFIED if you cannot.
- The repo has no image/video generation, no render/encode tooling, no TTS/STT, no AI SDK.
- lib/skills.ts states no skill generates an image, renders a video, places a call, moves money,
  publishes a post or calls an external API.
- Master Doc §6 VIDEO EDITOR EXAMPLE lists 22 capabilities to analyse separately:
  concept generation; scriptwriting; storyboarding; scene planning; asset management; image
  generation; text-to-video; image-to-video; scene/clip selection; cut/trim; transitions;
  compositing; speech-to-text; subtitles; text-to-speech; voiceover; audio mixing; aspect ratio
  variants; reel editing; quality checks; encoding/rendering/export; client approval.

TASK:
1. Produce a 22-row matrix, one row per capability above, with columns:
   Capability | Native code? | External model? | Local editing software? | API/plugin? |
   Hybrid? | Provider + exact capability | Official docs URL | Auth method | Free/paid |
   Approval + security scope | Test status | Blocker | Recommendation + tradeoffs.
2. Provider comparison with OFFICIAL availability, pricing, quota, watermark/usage rights,
   output resolution/duration limits and content-safety rules. Every row VERIFIED or UNVERIFIED
   with source URL. If Flow/Veo has no public API, say so explicitly.
3. Prompt pack + storyboard template + shot list + aspect-ratio variants (9:16 / 1:1 / 16:9)
   + brand-safety and AI-disclosure rules.
4. TypeScript handler skeleton per external row matching:
   POST /api/skills { "skillId": "...", "payload": { ... } }
   SkillResult { ok, skillId, departmentId, kind, executedAt, steps[], evidence{}, blocked[], sha256, error? }
   plus a mock test that FAILS if a handler claims a video was generated without real evidence.
5. Test-clip acceptance criteria: duration, resolution, audio, subtitles, brand, QA evidence,
   SHA-256 completion evidence, and versioned Owner approval before DELIVERY.
6. Rights/consent checklist: talent, voice, music, client assets, AI-generated media disclosure.

STRICT RULES:
- Never claim a video was generated, rendered or exported. No fabricated output, URL or evidence.
- Never invent provider availability, pricing or licence terms. Mark UNVERIFIED.
- A prompt-only "skill" must never be described as video rendering (Master Doc §6).
- No credential values, no client assets, no uploads, no publication, no purchase.
- External handlers must be requiresExternal:true and blocked until credential + authenticated test.
- Output as separate Markdown/CSV/TypeScript files + MANIFEST.md with an UNVERIFIED list.
```

---

## Packet D → ChatGPT — Remaining External Components (role-by-role inventory)

```
ROLE: You are a systems analyst. Produce a REQUIREMENTS REGISTER ONLY — no implementation,
no integration, no test claims.

CONTEXT (verified 2026-11-03, from lib/departments.ts externalNeeds; every department currently
returns externalNeedsConnected: 0):
01 HR/Finance/Admin: payment gateway, accounting API, e-signature.
02 Production: image generation, video generation, render/encode, TTS/STT, LLM content.
03 Sales & Marketing: Meta Marketing API + app review, Google Ads API + developer token,
   SEO/SERP data, email/SMTP.
04 Research & Development: web search, Perplexity, LLM synthesis, SERP/keyword data.
05 CRM/Supply/Audience: chatbot LLM, per-client RLS, telephony, STT/TTS, WhatsApp/Telegram.
09 Security/System Ops: uptime/cloud monitoring, alert channel, log storage, credit/usage metering.
10 Project Management & Ops: AI assignee model, workflow scheduler.
Deferred 06/07/08: model training compute, MCP runtime, LMS, payment/donation gateway,
   safeguarding review. Full 10-department architecture must be preserved; 06/07/08 stay inactive
   until the 7 priority departments are functional.

TASK: Produce Master Doc §7-style registers for the 7 priority departments using this exact row
format, one row per required AI skill:
Department | Division | Job Role | AI Skill/Function | Internal Skill? | External Tool/API? |
Plugin/MCP? | Key/OAuth? | Connected Status | Test Evidence | Priority | Cost/Estimate
Then produce:
1. REPORT 3-style external requirements per skill: providers, plugins/MCP, libraries, compute,
   official links, VERIFIED/UNVERIFIED availability + pricing + limits.
2. REPORT 4-style native opportunities: what can be built inside the repo, with limits.
3. REPORT 5-style credentials & Owner actions: names only, no values.
4. REPORT 6-style integration status matrix: EXISTING & TESTED / INSTALLED NOT TESTED / PARTIAL /
   NOT CONNECTED / NOT DEVELOPED / BLOCKED / OPTIONAL.
5. A gap list separating DONE & TESTED / BUILT BUT UNTESTED / PARTIAL / MISSING / BLOCKED.

STRICT RULES:
- Do not invent completion percentages, deployments, integrations, tests or completion claims.
- Do not claim any API is connected. connected:0 is the verified starting state.
- No secret values, no client data, no purchases, no deployments, no public posting.
- Flag financial, legal, telephony, public-posting and destructive actions as OWNER APPROVAL.
- Client isolation via RLS, not prompt text.
- Output as separate Markdown/CSV files + MANIFEST.md with an explicit UNVERIFIED list.
```

---

## What happens when the artifacts come back

| Step | Who | Rule |
|---|---|---|
| 1. Save returned files into this repo (suggested `handoff/`) | Owner / Dev Agent | No secret values committed |
| 2. Review against `GIMMS-MISSING-COMPONENTS.md` §6 integration contract | Dev Agent | Reject anything claiming `connected:true`, a generated video, or a completed test without evidence |
| 3. Decide credentials / paid tiers / approvals | **Owner only** | Names only in chat; values into approved secrets manager |
| 4. Implement gateway + handlers + tests | Dev Agent | **Requires separate Owner approval** — outside approved P0 scope |
| 5. Authenticated connection test | Dev Agent + Owner credential | `connected:true` only after raw evidence is recorded |
| 6. Publishing / payments / calls / production deploy | **Owner approval per action** | `MANUAL` default; no auto-post, auto-pay, auto-call |

**Nothing in this pack was sent, installed, purchased, connected, deployed or tested.**
