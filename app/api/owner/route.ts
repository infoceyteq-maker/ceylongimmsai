import { NextResponse } from "next/server";
import {
  ownerStatus,
  registerOwner,
  loginOwner,
  logoutOwner,
  changeOwnerPassword,
  registrationGate,
  sessionFromRequest,
  verifySession,
  ownerSessionCookie,
} from "@/lib/owner-auth";
import { guardMutation } from "@/lib/request-guard";
import { rateLimit, clearRateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Removes the session cookie for both the dev and production names. */
function clearCookies(response: NextResponse): NextResponse {
  for (const name of ["__Host-gimms_owner_session", "gimms_owner_session"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: name.startsWith("__Host-"),
      maxAge: 0,
    });
  }
  return response;
}

/**
 * Owner registration / login / logout / change-password.
 *
 * Hardening applied in this patchset:
 *  - `register` is GATED (see registrationGate) so an anonymous visitor can no
 *    longer claim the hub by loading /chat first.
 *  - Registration and login are rate limited per client IP.
 *  - Every mutating call passes the CSRF/origin guard.
 *  - The session cookie is `__Host-` prefixed + Secure in production.
 *
 * The password is chosen by the Owner in the browser form; it is never sent to
 * chat, never logged, never returned and never stored in plaintext.
 */
export async function GET(request: Request) {
  const profile = verifySession(sessionFromRequest(request));
  const status = ownerStatus();
  return NextResponse.json(
    {
      ...status,
      authenticated: Boolean(profile),
      // Presence flags only — never the values.
      registrationBlockedReason: status.registered ? undefined : registrationGate(request).reason,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const guard = guardMutation(request);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim();

  if (action === "register") {
    // "Already registered" is a 409 CONFLICT, not an authorisation failure. Check it
    // first so a duplicate call gets the honest status instead of a misleading 403.
    if (ownerStatus().registered) {
      return NextResponse.json(
        { ok: false, error: "Owner account already registered. Registration is closed; use login or change-password." },
        { status: 409, headers: NO_STORE },
      );
    }

    const gate = registrationGate(request);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.reason }, { status: 403, headers: NO_STORE });
    }

    const limit = rateLimit(clientKey(request, "owner-register"), RATE_LIMITS.ownerRegister.limit, RATE_LIMITS.ownerRegister.windowMs, RATE_LIMITS.ownerRegister.lockMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many registration attempts. Try again later." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const result = registerOwner(body);
    if (!result.ok || !result.sessionToken) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409, headers: NO_STORE });
    }
    const cookie = ownerSessionCookie(result.sessionToken);
    const response = NextResponse.json(
      {
        ok: true,
        profile: result.profile,
        persisted: result.persisted,
        durable: ownerStatus().durable,
        security: ownerStatus().security,
        claimedVia: gate.via,
        note: "Owner account created. Password was never stored in plaintext or shown in chat.",
      },
      { status: 201, headers: NO_STORE },
    );
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  }

  if (action === "login") {
    const limit = rateLimit(clientKey(request, "owner-login"), RATE_LIMITS.ownerLogin.limit, RATE_LIMITS.ownerLogin.windowMs, RATE_LIMITS.ownerLogin.lockMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: `Too many sign-in attempts. Locked for ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const result = loginOwner(body.password);
    if (!result.ok || !result.sessionToken) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 401, headers: NO_STORE });
    }
    clearRateLimit(clientKey(request, "owner-login"));
    const cookie = ownerSessionCookie(result.sessionToken);
    const response = NextResponse.json(
      { ok: true, profile: result.profile, durable: ownerStatus().durable, security: ownerStatus().security },
      { headers: NO_STORE },
    );
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  }

  if (action === "logout") {
    logoutOwner(sessionFromRequest(request));
    const response = NextResponse.json({ ok: true, note: "Session removed." }, { headers: NO_STORE });
    return clearCookies(response);
  }

  if (action === "change-password") {
    const profile = verifySession(sessionFromRequest(request));
    if (!profile) return NextResponse.json({ ok: false, error: "Owner login required." }, { status: 401, headers: NO_STORE });
    const result = changeOwnerPassword(body.currentPassword, body.newPassword);
    if (!result.ok) return NextResponse.json(result, { status: 400, headers: NO_STORE });
    const response = NextResponse.json(
      { ok: true, note: "Password changed. All sessions invalidated — log in again." },
      { headers: NO_STORE },
    );
    return clearCookies(response);
  }

  return NextResponse.json(
    { ok: false, error: `unknown action: ${action || "(empty)"}`, availableActions: ["register", "login", "logout", "change-password"] },
    { status: 400, headers: NO_STORE },
  );
}
