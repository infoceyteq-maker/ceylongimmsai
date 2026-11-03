import { NextResponse, type NextRequest } from "next/server";
import { OWNER_COOKIE_NAMES, looksLikeOwnerToken } from "@/lib/cookie-names";

/**
 * GIMMS — EDGE MIDDLEWARE (the boundary that did not exist before this patchset).
 *
 * Two jobs, both cheap, neither authoritative:
 *
 *  A. SECURITY HEADERS on every response (CSP, nosniff, Referrer-Policy,
 *     Permissions-Policy, no-store on /admin and /api/admin).
 *
 *  B. A FIRST-LINE GATE on /admin and /api/admin. This only checks that a
 *     structurally valid session cookie is present. It is NOT authentication —
 *     the route handlers still call requireOwner() against the real session store.
 *     That ordering matters: middleware runs on the Edge and cannot read the
 *     Node-only session file/DB.
 *
 * IMPORTANT — the frame-ancestors directive deliberately allows the Arena preview
 * host in development. The app is embedded in an iframe there, so the usual
 * `X-Frame-Options: DENY` would break the live preview. In production the policy is
 * strict (`'self'` only).
 */

const isDev = process.env.NODE_ENV !== "production";

const FRAME_ANCESTORS = isDev ? "'self' https://*.e2b.app" : "'self'";

const CSP = [
  "default-src 'self'",
  // Next.js hydration and the App Router stream inline bootstrap scripts, so
  // 'unsafe-inline' is required without a nonce pipeline. No user-authored HTML is
  // rendered anywhere in this app (no dangerouslySetInnerHTML), and React escapes by
  // default. Nonce-based CSP is tracked as an open hardening item in the report.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // React style= attributes are used throughout the hub panels.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  `frame-ancestors ${FRAME_ANCESTORS}`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

function structuralSessionPresent(request: NextRequest): boolean {
  for (const name of OWNER_COOKIE_NAMES) {
    if (looksLikeOwnerToken(request.cookies.get(name)?.value)) return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isAdminApi = pathname.startsWith("/api/admin");
  const isAdminPage = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";

  // ---- Gate -----------------------------------------------------------------
  if ((isAdminApi || isAdminPage) && !isLoginPage && !structuralSessionPresent(request)) {
    if (isAdminApi) {
      return NextResponse.json(
        {
          ok: false,
          error: "Owner session required.",
          hint: "Sign in at /admin/login with the password you set at /chat. Sessions last 8 hours.",
        },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    const target = `${pathname}${search}`;
    // Only allow a relative, same-origin path (blocks open-redirect via ?next=).
    if (target.startsWith("/admin/") && !target.startsWith("/admin/login")) {
      url.searchParams.set("next", target);
    }
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // ---- Headers --------------------------------------------------------------
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), fullscreen=(self)",
  );
  // NOTE: no X-Frame-Options here — CSP frame-ancestors (above) is the single source
  // of truth and is the only one that can express the preview-host exception.

  if (process.env.NODE_ENV === "production" && request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  // Admin surfaces and anything authenticated must never be cached by a CDN/proxy.
  if (isAdminApi || isAdminPage) {
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  response.headers.set("X-GIMMS-Security", "middleware");
  return response;
}

export const config = {
  /**
   * Run on pages and API routes, skip Next internals and static files.
   * `_next/static`, `_next/image` and files with an extension are excluded so the
   * middleware never adds latency or breaks asset caching.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-512.png|.*\\.[a-zA-Z0-9]+$).*)"],
};
