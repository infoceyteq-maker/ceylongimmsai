/**
 * GIMMS AUTO-PILOT v3 — COMMUNICATIONS HUB (READ + DRAFT).
 *
 *   GET  /api/agent/comms              integration status (presence only, no secrets)
 *   POST /api/agent/comms  action=inbox   read unread metadata
 *   POST /api/agent/comms  action=draft   create a Gmail DRAFT (never sends)
 *
 * WHY THERE IS NO `action=send`
 * -----------------------------
 * Sending is the one email operation that cannot be undone. The hub therefore stops at
 * a draft in your Gmail account and you press send. This is a product decision recorded
 * in docs/AUTOPILOT-ARCHITECTURE-V3.md §0, not an unfinished feature: the tool registry
 * marks `gmail.send` as BLOCKED_BY_POLICY and no send code path exists in the repo.
 *
 * INBOUND SOCIAL MESSAGES
 * -----------------------
 * The shape for Facebook/Instagram/X inbound messages is the same three moves — verify a
 * webhook signature, normalise to a common envelope, drop it into the same job store —
 * and belongs in `app/api/agent/webhooks/[platform]/route.ts`. It is deliberately NOT
 * stubbed here: a webhook that accepts unsigned payloads is worse than no webhook, and
 * the blueprint (docs/AUTOPILOT-ARCHITECTURE-V3.md §5) specifies the signature check and
 * the Meta app-review step first.
 */

import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { createDraft, gmailConfigured, gmailMissing, listInbox, GMAIL_POLICY } from "@/lib/autopilot/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

function statusPayload() {
  return {
    gmail: {
      configured: gmailConfigured(),
      missing: gmailConfigured() ? [] : gmailMissing(),
      ...GMAIL_POLICY,
    },
    socialInbound: {
      configured: false,
      note: "Not wired. Needs a Meta app with a verified webhook + X25519 signature check before it may accept anything.",
    },
    policy: {
      canSendEmail: false,
      canDeleteEmail: false,
      draftsRequireHumanSend: true,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireOwnerWrite(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, ...authTag(auth), ...statusPayload() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const auth = await requireOwnerWrite(request);
  if (!auth.ok) return NextResponse.json({ ok: false, ...authTag(auth), error: auth.error }, { status: auth.status, headers: NO_STORE });

  const limit = rateLimit(clientKey(request, "agent-comms"), RATE_LIMITS.agentCommand.limit, RATE_LIMITS.agentCommand.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many communications actions. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim();
  const missing = gmailMissing();

  if (!action) {
    return NextResponse.json({ ok: false, error: "action is required", availableActions: ["inbox", "draft"] }, { status: 400, headers: NO_STORE });
  }

  if (action === "send" || action === "reply" || action === "auto-reply") {
    return NextResponse.json(
      {
        ok: false,
        ...authTag(auth),
        code: "BLOCKED_BY_POLICY",
        error: "Sending is refused in code. The hub creates drafts only.",
        alternative: "action=draft, then press send in Gmail yourself.",
      },
      { status: 403, headers: NO_STORE },
    );
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        ...authTag(auth),
        code: "NOT_CONFIGURED",
        error: "Gmail is not connected on this deployment.",
        missingEnv: missing,
        manualSteps: "docs/AUTOPILOT-MANUAL-SETUP.md §2 — Google Cloud OAuth client, then GMAIL_REFRESH_TOKEN in Vercel env. Never in chat.",
        note: "No external call was made.",
      },
      { status: 501, headers: NO_STORE },
    );
  }

  if (action === "inbox") {
    const result = await listInbox({
      maxResults: typeof body.maxResults === "number" ? body.maxResults : 10,
      query: typeof body.query === "string" ? body.query : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code, error: result.error, ...(result.status ? { upstreamStatus: result.status } : {}) }, { status: result.code === "NOT_CONFIGURED" ? 501 : 502, headers: NO_STORE });
    }
    return NextResponse.json(
      { ok: true, ...authTag(auth), code: "INBOX_READ", messages: result.data.messages, count: result.data.messages.length, query: result.data.query, note: "Metadata only. Bodies stay in Gmail." },
      { headers: NO_STORE },
    );
  }

  if (action === "draft") {
    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.body ?? body.text ?? "").trim();
    if (!to || !subject || !text) return NextResponse.json({ ok: false, error: "to, subject and body are required" }, { status: 400, headers: NO_STORE });
    if (text.length > 20_000) return NextResponse.json({ ok: false, error: "draft body too long (max 20000 characters)" }, { status: 400, headers: NO_STORE });

    const result = await createDraft({ to, subject, body: text, inReplyTo: typeof body.inReplyTo === "string" ? body.inReplyTo : undefined });
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code, error: result.error, ...(result.status ? { upstreamStatus: result.status } : {}) }, { status: result.code === "NOT_CONFIGURED" ? 501 : 502, headers: NO_STORE });
    }
    return NextResponse.json(
      { ok: true, ...authTag(auth), code: "DRAFT_CREATED", draftId: result.data.draftId, messageId: result.data.messageId, sent: false, note: "It is a DRAFT in your Gmail account. Nothing was sent." },
      { status: 201, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: false, error: `unknown action: ${action}`, availableActions: ["inbox", "draft"] }, { status: 400, headers: NO_STORE });
}
