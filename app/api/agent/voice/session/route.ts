/**
 * GIMMS AUTO-PILOT v3 — REAL-TIME VOICE SESSION BROKER.
 *
 *   POST /api/agent/voice/session   → short-lived vendor session token (never our API key)
 *
 * ARCHITECTURE IN ONE PARAGRAPH
 * -----------------------------
 * The browser must never hold our vendor API key, and our server must never hold the
 * audio stream. So: this route authenticates the Owner, then asks the vendor for a
 * SHORT-LIVED session token and returns only that. The browser opens a WebRTC peer
 * connection straight to the vendor. Our server is in the auth path, not the audio path —
 * which also means the cheap Hobby function is never billed for a ten-minute call.
 *
 * VENDOR-NEUTRAL BY DESIGN
 * ------------------------
 * `AUTOPILOT_VOICE_SESSION_URL` points at whatever broker you choose (OpenAI Realtime
 * session endpoint, Vapi's token endpoint, Retell's web-call endpoint…). We do not pin a
 * vendor SDK into the app, so switching vendors is an env change, not a rewrite. If your
 * vendor wants a different request body, adjust the single `payload` below — that is the
 * only vendor-specific line in the codebase.
 *
 * THE VOICE SESSION HAS NO TOOLS
 * ------------------------------
 * Speech is an INPUT METHOD, not a privilege escalation. The voice agent cannot execute
 * anything: it transcribes, and the transcript is POSTed to /api/agent/execute, where the
 * same closed-enum classifier, tool gates and approval rules apply as for typed text.
 * A spoken "email everyone my bank details" is graded by exactly the same code.
 *
 * NOT CONFIGURED IS A FIRST-CLASS ANSWER: 501 + the exact missing variable names.
 */

import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { hasVar } from "@/lib/env";
import { INTENTS } from "@/lib/autopilot/intent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
const REQUIRED = ["AUTOPILOT_VOICE_SESSION_URL", "AUTOPILOT_VOICE_API_KEY"] as const;

const VOICE_INSTRUCTIONS = [
  "You are the voice interface of the AI GIMMS Hub.",
  "You cannot execute anything. You listen, confirm the request in one short sentence,",
  "and emit the user's words as a transcript for the hub to classify.",
  `Valid intents are: ${INTENTS.join(", ")}.`,
  "Never read out credentials, never promise an action has happened, and if the request",
  "is unclear ask one clarifying question. Keep answers under 30 words.",
].join(" ");

export async function POST(request: Request) {
  const auth = await requireOwnerWrite(request);
  if (!auth.ok) return NextResponse.json({ ok: false, ...authTag(auth), error: auth.error }, { status: auth.status, headers: NO_STORE });

  const limit = rateLimit(clientKey(request, "agent-voice"), RATE_LIMITS.agentCommand.limit, RATE_LIMITS.agentCommand.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many voice sessions. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const missing = REQUIRED.filter((name) => !hasVar(name));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        ...authTag(auth),
        code: "NOT_CONFIGURED",
        error: "No voice broker is configured on this deployment.",
        missingEnv: [...missing],
        manualSteps: "docs/AUTOPILOT-MANUAL-SETUP.md §3 — add both variables in Vercel → Settings → Environment Variables, then redeploy. Never paste a key into chat.",
        guardrails: { toolsEnabled: false, audioPath: "browser ↔ vendor (WebRTC)", authPath: "server (this route)" },
        note: "The text interface at /api/agent/execute works today without any of this.",
      },
      { status: 501, headers: NO_STORE },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const language = typeof body.language === "string" ? body.language.slice(0, 12) : "en";

  const payload = {
    // Vendor-agnostic shape. Adjust here only if your broker documents a different body.
    instructions: VOICE_INSTRUCTIONS,
    voice: typeof body.voice === "string" ? body.voice.slice(0, 40) : undefined,
    language,
    modalities: ["audio", "text"],
    metadata: { app: "ai-gimms-hub", purpose: "owner-voice-command", submitTo: "/api/agent/execute" },
  };

  try {
    const response = await fetch(process.env.AUTOPILOT_VOICE_SESSION_URL ?? "", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.AUTOPILOT_VOICE_API_KEY ?? ""}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, code: "UPSTREAM_ERROR", error: `voice broker returned HTTP ${response.status}`, note: "Our API key was not exposed. Check the broker's own dashboard." },
        { status: 502, headers: NO_STORE },
      );
    }

    const session = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        ok: true,
        ...authTag(auth),
        code: "SESSION_READY",
        session,
        guardrails: {
          toolsEnabled: false,
          ephemeralTokenOnly: true,
          transcriptSubmitUrl: "/api/agent/execute",
          note: "The voice session can only produce a transcript. Every execution decision happens in /api/agent/execute under the same gates as text.",
        },
      },
      { headers: NO_STORE },
    );
  } catch (cause) {
    return NextResponse.json(
      { ok: false, code: "UPSTREAM_ERROR", error: `voice broker unreachable (${cause instanceof Error ? cause.name : "network error"})` },
      { status: 502, headers: NO_STORE },
    );
  }
}
