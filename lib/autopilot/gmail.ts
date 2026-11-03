/**
 * GIMMS AUTO-PILOT v3 — GMAIL ADAPTER (READ + DRAFT ONLY).
 *
 * There is no `send` function in this module and there must never be one. The whole
 * surface is: read metadata, list the inbox, create a DRAFT. You press send, in Gmail,
 * with your own hands. That single decision removes the worst failure mode of an
 * "autonomous assistant" — mailing a client something a model hallucinated at 3am.
 *
 * SCOPES
 *   gmail.readonly  — read message metadata and bodies.
 *   gmail.compose   — create drafts. NOTE, HONESTLY: Google's gmail.compose scope also
 *                     technically permits sending a draft. Our code contains no send
 *                     path, but the *token* is capable of it. If you want a hard
 *                     capability boundary at the token level, start with gmail.readonly
 *                     only, verify reading works, and add compose afterwards.
 *   We do NOT request gmail.send or gmail.modify.
 *
 * NO DEPENDENCY. Google's `googleapis` package is ~50MB of transitive surface for four
 * REST calls; raw `fetch` is used instead (Node 18+/22 built-in).
 *
 * SECRET HANDLING: values are read at call time from process.env and are never
 * returned, logged, or embedded in an error string. Errors carry HTTP status only.
 *
 * Server-only. Node runtime.
 */

import { hasVar } from "@/lib/env";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"] as const;

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const ENV_NAMES = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] as const;

const TIMEOUT_MS = 10_000;

export type GmailResult<T> = { ok: true; data: T } | { ok: false; code: "NOT_CONFIGURED" | "UPSTREAM_ERROR"; error: string; status?: number };

export function gmailMissing(): string[] {
  return ENV_NAMES.filter((name) => !hasVar(name));
}

export function gmailConfigured(): boolean {
  return gmailMissing().length === 0;
}

/** The URL to open in a browser to grant the two read/draft scopes. */
export function buildConsentUrl(params: { redirectUri: string; state: string; loginHint?: string }): string {
  const url = new URL(OAUTH_AUTH);
  url.searchParams.set("client_id", process.env.GMAIL_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export function encodeBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * RFC 2047 encoding for a non-ASCII header value; ASCII passes through untouched so
 * subjects stay readable in the Gmail UI.
 */
function encodeHeaderValue(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string, width = 76): string {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += width) chunks.push(value.slice(index, index + width));
  return chunks.join("\r\n");
}

export type DraftInput = { to: string; subject: string; body: string; inReplyTo?: string };

/**
 * Build an RFC 822 message. Header values are validated because a newline in `to` or
 * `subject` is header injection — the classic way an "assistant" is tricked into
 * Bcc-ing a stranger.
 */
export function buildDraftMime(input: DraftInput): { ok: true; mime: string } | { ok: false; error: string } {
  const to = input.to.trim();
  const subject = input.subject.trim();

  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[A-Za-z]{2,}$/.test(to)) {
    return { ok: false, error: "recipient must be a single plain email address" };
  }
  if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) {
    return { ok: false, error: "header injection refused: CR/LF is not allowed in to/subject" };
  }
  if (subject.length > 200) return { ok: false, error: "subject too long (max 200 characters)" };

  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (input.inReplyTo) {
    if (!/^[A-Za-z0-9._-]{4,200}$/.test(input.inReplyTo)) return { ok: false, error: "inReplyTo is not a valid message id" };
    headers.push(`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`);
  }

  const body = wrapBase64(Buffer.from(input.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"));
  return { ok: true, mime: `${headers.join("\r\n")}\r\n\r\n${body}\r\n` };
}

async function refreshAccessToken(): Promise<GmailResult<{ accessToken: string }>> {
  const missing = gmailMissing();
  if (missing.length > 0) {
    return { ok: false, code: "NOT_CONFIGURED", error: `missing: ${missing.join(", ")}` };
  }
  try {
    const response = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID ?? "",
        client_secret: process.env.GMAIL_CLIENT_SECRET ?? "",
        refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? "",
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, code: "UPSTREAM_ERROR", status: response.status, error: `token refresh failed with HTTP ${response.status}` };
    }
    const payload = (await response.json()) as { access_token?: string };
    if (!payload.access_token) return { ok: false, code: "UPSTREAM_ERROR", error: "token refresh returned no access_token" };
    return { ok: true, data: { accessToken: payload.access_token } };
  } catch (cause) {
    return { ok: false, code: "UPSTREAM_ERROR", error: `token refresh failed (${cause instanceof Error ? cause.name : "network error"})` };
  }
}

/** Creates a draft. It does NOT send. There is no send path to call. */
export async function createDraft(input: DraftInput): Promise<GmailResult<{ draftId: string; messageId: string }>> {
  const mime = buildDraftMime(input);
  if (!mime.ok) return { ok: false, code: "UPSTREAM_ERROR", status: 400, error: mime.error };

  const token = await refreshAccessToken();
  if (!token.ok) return token;

  try {
    const response = await fetch(`${GMAIL_API}/drafts`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.data.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { raw: encodeBase64Url(mime.mime) } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, code: "UPSTREAM_ERROR", status: response.status, error: `Gmail drafts.create failed with HTTP ${response.status}` };
    const payload = (await response.json()) as { id?: string; message?: { id?: string } };
    return { ok: true, data: { draftId: payload.id ?? "(unknown)", messageId: payload.message?.id ?? "(unknown)" } };
  } catch (cause) {
    return { ok: false, code: "UPSTREAM_ERROR", error: `Gmail drafts.create failed (${cause instanceof Error ? cause.name : "network error"})` };
  }
}

export type InboxMessage = { id: string; threadId: string; subject: string; from: string; date: string; snippet: string };

/**
 * Read-only inbox listing. Fetching a header-only metadata view means full bodies stay
 * in Gmail, so an inbox compromise here leaks subjects, not content.
 */
export async function listInbox(params: { maxResults?: number; query?: string } = {}): Promise<GmailResult<{ messages: InboxMessage[]; query: string }>> {
  const token = await refreshAccessToken();
  if (!token.ok) return token;

  const maxResults = Math.min(Math.max(params.maxResults ?? 10, 1), 25);
  const query = params.query?.slice(0, 200) || "is:unread in:inbox";

  try {
    const listUrl = new URL(`${GMAIL_API}/messages`);
    listUrl.searchParams.set("maxResults", String(maxResults));
    listUrl.searchParams.set("q", query);

    const listResponse = await fetch(listUrl, {
      headers: { authorization: `Bearer ${token.data.accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!listResponse.ok) return { ok: false, code: "UPSTREAM_ERROR", status: listResponse.status, error: `Gmail messages.list failed with HTTP ${listResponse.status}` };

    const listed = (await listResponse.json()) as { messages?: { id?: string; threadId?: string }[] };
    const ids = (listed.messages ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id));

    const messages: InboxMessage[] = [];
    for (const id of ids.slice(0, maxResults)) {
      const detailUrl = new URL(`${GMAIL_API}/messages/${encodeURIComponent(id)}`);
      detailUrl.searchParams.set("format", "metadata");
      for (const header of ["Subject", "From", "Date"]) detailUrl.searchParams.append("metadataHeaders", header);

      const detailResponse = await fetch(detailUrl, {
        headers: { authorization: `Bearer ${token.data.accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!detailResponse.ok) continue;

      const detail = (await detailResponse.json()) as {
        id?: string;
        threadId?: string;
        snippet?: string;
        payload?: { headers?: { name?: string; value?: string }[] };
      };
      const header = (name: string) => detail.payload?.headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
      messages.push({
        id: detail.id ?? id,
        threadId: detail.threadId ?? "",
        subject: header("Subject"),
        from: header("From"),
        date: header("Date"),
        snippet: detail.snippet ?? "",
      });
    }

    return { ok: true, data: { messages, query } };
  } catch (cause) {
    return { ok: false, code: "UPSTREAM_ERROR", error: `Gmail read failed (${cause instanceof Error ? cause.name : "network error"})` };
  }
}

export const GMAIL_POLICY = {
  scopes: GMAIL_SCOPES,
  canSend: false,
  rawDelete: false,
  modify: false,
  note: "Read + draft only. Sending is a human action performed in the Gmail UI.",
} as const;
