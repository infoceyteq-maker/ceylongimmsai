import { NextResponse } from "next/server";
import {
  OWNER_COOKIE,
  ownerStatus,
  registerOwner,
  loginOwner,
  logoutOwner,
  changeOwnerPassword,
  sessionFromRequest,
  verifySession,
} from "@/lib/owner-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const COOKIE = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 8 * 60 * 60 };

/**
 * Owner registration / login — LOCAL DEV auth only.
 * The password is chosen by the Owner in the browser form; it is never sent to
 * chat, never logged, never returned and never stored in plaintext.
 * No email, no external identity provider, no production change.
 */
export async function GET(request: Request) {
  const profile = verifySession(sessionFromRequest(request));
  return NextResponse.json({ ...ownerStatus(), authenticated: Boolean(profile) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim();

  if (action === "register") {
    const result = registerOwner(body);
    if (!result.ok || !result.sessionToken) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409, headers: NO_STORE });
    }
    const response = NextResponse.json(
      { ok: true, profile: result.profile, persisted: result.persisted, security: ownerStatus().security, note: "Local Owner account created. Password was never stored in plaintext or shown in chat." },
      { status: 201, headers: NO_STORE },
    );
    response.cookies.set(OWNER_COOKIE, result.sessionToken, COOKIE);
    return response;
  }

  if (action === "login") {
    const result = loginOwner(body.password);
    if (!result.ok || !result.sessionToken) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 401, headers: NO_STORE });
    }
    const response = NextResponse.json({ ok: true, profile: result.profile, security: ownerStatus().security }, { headers: NO_STORE });
    response.cookies.set(OWNER_COOKIE, result.sessionToken, COOKIE);
    return response;
  }

  if (action === "logout") {
    logoutOwner(sessionFromRequest(request));
    const response = NextResponse.json({ ok: true, note: "Session removed locally." }, { headers: NO_STORE });
    response.cookies.set(OWNER_COOKIE, "", { ...COOKIE, maxAge: 0 });
    return response;
  }

  if (action === "change-password") {
    const profile = verifySession(sessionFromRequest(request));
    if (!profile) return NextResponse.json({ ok: false, error: "Owner login required." }, { status: 401, headers: NO_STORE });
    const result = changeOwnerPassword(body.currentPassword, body.newPassword);
    if (!result.ok) return NextResponse.json(result, { status: 400, headers: NO_STORE });
    const response = NextResponse.json({ ok: true, note: "Password changed. All sessions invalidated — log in again." }, { headers: NO_STORE });
    response.cookies.set(OWNER_COOKIE, "", { ...COOKIE, maxAge: 0 });
    return response;
  }

  return NextResponse.json(
    { ok: false, error: `unknown action: ${action || "(empty)"}`, availableActions: ["register", "login", "logout", "change-password"] },
    { status: 400, headers: NO_STORE },
  );
}
