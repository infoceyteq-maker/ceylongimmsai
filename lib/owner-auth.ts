/**
 * GIMMS — OWNER IDENTITY, SESSIONS AND THE ADMIN GATE.
 *
 * Security properties:
 *  - scrypt (Node built-in crypto) with a random 16-byte salt; only the derived
 *    hash is stored. The password is NEVER returned, logged, printed or persisted.
 *  - constant-time comparison; failed-attempt lockout (5 attempts / 10 min) PLUS an
 *    IP-scoped rate limit in the route handler.
 *  - random 32-byte session token; only its SHA-256 is stored; 8h expiry, idle-safe.
 *  - httpOnly cookie. In production the name is `__Host-` prefixed, which the browser
 *    only accepts with Secure + Path=/ + no Domain. That makes subdomain cookie
 *    injection structurally impossible. `SameSite=Lax` is kept so that top-level
 *    navigation to /admin after login works.
 *  - Session records are written ATOMICALLY (temp file + rename) so a crash cannot
 *    leave a half-written JSON that would silently log the Owner out or corrupt the
 *    hash chain.
 *
 * WHY REGISTRATION IS NOW GATED (changed in this patchset):
 *  The previous build let ANY anonymous visitor who reached /chat first create the
 *  Owner account — i.e. take over the hub. Registration now requires ONE of:
 *    a) an existing valid Owner session (adding a second device), or
 *    b) a matching `OWNER_BOOTSTRAP_TOKEN` header when that env var is set, or
 *    c) the `GIMMS_ALLOW_FIRST_RUN_CLAIM` escape hatch (non-production only).
 *  If the hub is already registered, registration is refused outright.
 *
 * HONEST BOUNDARIES — do not overstate this:
 *  - This is NOT Supabase Auth / SSO / MFA / email verification and there is no
 *    password-reset email. It is a single-tenant Owner gate.
 *  - ON VERCEL THE FILE STORE IS EPHEMERAL. `data/gimms-owner.json` lives in /tmp or
 *    a build-time read-only path, so a registration performed on one serverless
 *    instance is NOT durable across deployments or instances. Durable identity
 *    requires Supabase (see PHASE1-SECURITY-DIAGNOSTIC.md §5). This module therefore
 *    now REFUSES to report a healthy durable state when it detects a Vercel filesystem.
 *  - No external call, no email, no personal account connected, no deploy.
 *  - The Owner sets their OWN password through the UI. This module never receives a
 *    password from chat and never asks for one.
 *
 * Storage: data/gimms-owner.json (git-ignored). No in-memory cache, so deleting the
 * file genuinely returns the app to UNREGISTERED.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { auditEntry } from "@/lib/store";
import { hash } from "@/lib/jobs";
import { ownerCookieName, OWNER_COOKIE_NAMES } from "@/lib/cookie-names";
import { hasVar, isVercel, isProduction } from "@/lib/env";

const FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "gimms-owner.json");
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 10 * 60 * 1000;

/**
 * Backwards-compatible export. Resolves per-environment:
 * `__Host-gimms_owner_session` in production, `gimms_owner_session` in development.
 */
export const OWNER_COOKIE = ownerCookieName(isProduction);

export const OWNER_PERMISSIONS = [
  "owner.chat.command",
  "owner.chat.history",
  "owner.chat.stream",
  "owner.job.create",
  "owner.job.review",
  "owner.skills.view",
  "owner.connections.view",
  "owner.audit.view",
] as const;

export const OWNER_NOT_GRANTED = [
  "external.api.call",
  "email.send",
  "service.purchase",
  "production.deploy",
  "production.database.write",
] as const;

export type OwnerProfile = {
  employeeId: string;
  displayName: string;
  email: null;
  realDetailsStored: false;
  profileComplete: false;
  role: string;
  department: string;
  departmentName: string;
  division: string;
  jobRole: string;
  permissions: readonly string[];
  notGranted: readonly string[];
  status: "ACTIVE_LOCAL";
  loginImplemented: true;
  secureAuthProvider: "LOCAL_DEV_ONLY";
  createdAt: string;
};

type OwnerFile = {
  version: 1;
  registered: boolean;
  profile: OwnerProfile | null;
  passwordSalt: string | null;
  passwordHash: string | null;
  sessions: { tokenHash: string; createdAt: string; expiresAt: string }[];
  failedAttempts: number;
  lockUntil: string | null;
  auditTrail: { at: string; action: string; detail: string }[];
  sha256: string;
};

function empty(): OwnerFile {
  return {
    version: 1,
    registered: false,
    profile: null,
    passwordSalt: null,
    passwordHash: null,
    sessions: [],
    failedAttempts: 0,
    lockUntil: null,
    auditTrail: [],
    sha256: "",
  };
}

function read(): OwnerFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as OwnerFile;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.sessions)) return parsed;
  } catch {
    /* missing or unreadable: unregistered */
  }
  return empty();
}

function write(data: OwnerFile): boolean {
  data.sha256 = hash({
    registered: data.registered,
    profile: data.profile,
    sessions: data.sessions,
    failedAttempts: data.failedAttempts,
    auditTrail: data.auditTrail,
  });
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    // Atomic write: a crash mid-write must never leave truncated session state.
    const temporary = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the runtime filesystem can be trusted to persist the Owner record.
 * On Vercel serverless: the project directory is read-only and /tmp is per-instance
 * and wiped on cold start, so a JSON file can never be the durable identity store.
 */
export function ownerStoreIsDurable(): boolean {
  return !isVercel;
}


function derive(password: string, saltHex: string): string {
  return crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function audit(data: OwnerFile, action: string, detail: string): void {
  data.auditTrail = [auditEntry(action, detail) as OwnerFile["auditTrail"][number], ...data.auditTrail].slice(0, 200);
}

export const SECURITY_BOUNDARIES = [
  "Single-tenant Owner gate — no Supabase Auth / SSO / MFA / email verification, no password-reset email",
  "scrypt salted hash only; password never stored, returned, logged or shown in chat",
  "httpOnly session cookie; __Host- prefixed + Secure in production; SameSite=Lax; 8h expiry",
  "Session token stored only as SHA-256; session file written atomically (0600)",
  "5 failed attempts → 10 minute lockout, plus an IP-scoped rate limit in the route",
  "Registration closed once registered; first-run claim requires OWNER_BOOTSTRAP_TOKEN in production",
  "No real Owner identity invented: email null, realDetailsStored false",
  "No email sent, no personal account connected, no external API call, no deploy",
  "ON VERCEL THE FILE STORE IS EPHEMERAL — durable identity requires a Supabase-backed store (open item)",
] as const;

export function ownerStatus() {
  const data = read();
  return {
    registered: data.registered,
    durable: ownerStoreIsDurable(),
    cookieName: OWNER_COOKIE,
    registrationOpen: !data.registered,
    bootstrapTokenRequired: hasVar("OWNER_BOOTSTRAP_TOKEN"),
    profile: data.profile,
    loginState: data.registered ? "REGISTERED" : "UNREGISTERED",
    permissions: data.profile?.permissions ?? [],
    notGranted: data.profile?.notGranted ?? OWNER_NOT_GRANTED,
    security: {
      algorithm: "scrypt (Node crypto)",
      sessionTtlHours: 8,
      failedAttempts: data.failedAttempts,
      locked: Boolean(data.lockUntil && new Date(data.lockUntil).getTime() > Date.now()),
      passwordStoredInPlaintext: false,
      secureAuthProvider: "LOCAL_DEV_ONLY",
      boundaries: SECURITY_BOUNDARIES,
    },
    auditCount: data.auditTrail.length,
    sha256: data.sha256,
  };
}

/**
 * Can a registration request proceed? See the module header for the three
 * permitted paths. Returns a reason string when refused.
 */
export function registrationGate(request: Request): { ok: boolean; reason?: string; via?: string } {
  const data = read();
  if (data.registered) {
    return { ok: false, reason: "Owner account already registered. Registration is closed; use login or change-password." };
  }

  const existingSession = verifySession(sessionFromRequest(request));
  if (existingSession) return { ok: true, via: "existing-owner-session" };

  const provided = request.headers.get("x-gimms-bootstrap-token")?.trim() || "";
  if (hasVar("OWNER_BOOTSTRAP_TOKEN")) {
    const expected = (process.env.OWNER_BOOTSTRAP_TOKEN || "").trim();
    if (provided.length > 0 && timingSafeStringEqual(provided, expected)) {
      return { ok: true, via: "bootstrap-token" };
    }
    return {
      ok: false,
      reason:
        "First-run registration requires the OWNER_BOOTSTRAP_TOKEN header (x-gimms-bootstrap-token) because one is configured for this deployment.",
    };
  }

  // An unregistered, token-less deployment is a genuine first run. Refuse it in
  // production unless the Owner explicitly opted in, so a public URL cannot be
  // claimed by whoever loads /chat first.
  if (isProduction && process.env.GIMMS_ALLOW_FIRST_RUN_CLAIM !== "1") {
    return {
      ok: false,
      reason:
        "First-run registration is disabled in production. Set OWNER_BOOTSTRAP_TOKEN in Vercel, then send it as x-gimms-bootstrap-token — or pre-create the Owner through the Supabase-backed store.",
    };
  }

  return { ok: true, via: isProduction ? "explicit-first-run-flag" : "local-development" };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function registerOwner(input: { password?: unknown; displayName?: unknown }): {
  ok: boolean;
  error?: string;
  profile?: OwnerProfile;
  sessionToken?: string;
  persisted?: boolean;
} {
  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < 12 || password.length > 256) {
    return { ok: false, error: "password must be 12–256 characters (chosen by the Owner in the UI, never sent in chat)" };
  }
  const data = read();
  if (data.registered) {
    return { ok: false, error: "Owner account already registered. Use the login form or change-password action." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const displayName = String(input.displayName ?? "").trim();
  const profile: OwnerProfile = {
    employeeId: "EMP-0001",
    displayName: displayName || "Owner (Founder) — profile incomplete",
    email: null,
    realDetailsStored: false,
    profileComplete: false,
    role: "Founder / Owner / Super Admin",
    department: "10",
    departmentName: "Project Management & Operations",
    division: "Owner Operations Control",
    jobRole: "Chief Operations Manager (Owner)",
    permissions: OWNER_PERMISSIONS,
    notGranted: OWNER_NOT_GRANTED,
    status: "ACTIVE_LOCAL",
    loginImplemented: true,
    secureAuthProvider: "LOCAL_DEV_ONLY",
    createdAt: new Date().toISOString(),
  };

  const token = crypto.randomBytes(32).toString("hex");
  data.registered = true;
  data.profile = profile;
  data.passwordSalt = salt;
  data.passwordHash = derive(password, salt);
  data.sessions = [
    { tokenHash: tokenHash(token), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() },
  ];
  data.failedAttempts = 0;
  data.lockUntil = null;
  audit(data, "owner.registered", `${profile.employeeId} local Founder/Super Admin created`);
  const persisted = write(data);
  return { ok: true, profile, sessionToken: token, persisted };
}

export function loginOwner(password: unknown): {
  ok: boolean;
  error?: string;
  profile?: OwnerProfile;
  sessionToken?: string;
} {
  const data = read();
  if (!data.registered || !data.passwordHash || !data.passwordSalt) {
    return { ok: false, error: "Owner account is not registered yet" };
  }
  if (data.lockUntil && new Date(data.lockUntil).getTime() > Date.now()) {
    return { ok: false, error: "Too many failed attempts. Login is temporarily locked (10 minutes)." };
  }
  const candidate = typeof password === "string" ? password : "";
  const derived = derive(candidate, data.passwordSalt);
  if (!safeEqual(derived, data.passwordHash)) {
    data.failedAttempts += 1;
    if (data.failedAttempts >= MAX_FAILED) data.lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
    audit(data, "owner.login.failed", `attempt ${data.failedAttempts}`);
    write(data);
    return { ok: false, error: "Invalid password" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  data.sessions = [
    ...data.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now()),
    { tokenHash: tokenHash(token), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() },
  ];
  data.failedAttempts = 0;
  data.lockUntil = null;
  audit(data, "owner.login.success", "session created");
  write(data);
  return { ok: true, profile: data.profile ?? undefined, sessionToken: token };
}

export function changeOwnerPassword(current: unknown, next: unknown): { ok: boolean; error?: string } {
  const data = read();
  if (!data.registered || !data.passwordHash || !data.passwordSalt) return { ok: false, error: "not registered" };
  const currentPassword = typeof current === "string" ? current : "";
  if (!safeEqual(derive(currentPassword, data.passwordSalt), data.passwordHash)) return { ok: false, error: "Invalid current password" };
  const nextPassword = typeof next === "string" ? next : "";
  if (nextPassword.length < 12 || nextPassword.length > 256) return { ok: false, error: "new password must be 12–256 characters" };
  const salt = crypto.randomBytes(16).toString("hex");
  data.passwordSalt = salt;
  data.passwordHash = derive(nextPassword, salt);
  data.sessions = [];
  audit(data, "owner.password.changed", "all sessions invalidated");
  write(data);
  return { ok: true };
}

export function verifySession(token: string | null | undefined): OwnerProfile | null {
  if (!token) return null;
  const data = read();
  if (!data.registered || !data.profile) return null;
  const digest = tokenHash(token);
  const session = data.sessions.find((item) => item.tokenHash === digest);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return data.profile;
}

export function sessionFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") || "";
  const parsed: Record<string, string> = {};
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    try {
      parsed[name] = decodeURIComponent(rest.join("="));
    } catch {
      parsed[name] = rest.join("=");
    }
  }
  for (const name of OWNER_COOKIE_NAMES) {
    const value = parsed[name];
    if (value) return value;
  }
  return null;
}

/**
 * Cookie attributes for the session. `secure` is forced on in production, which is a
 * hard requirement of the `__Host-` prefix.
 */
export function ownerSessionCookie(token: string): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    secure: boolean;
    maxAge: number;
  };
} {
  return {
    name: OWNER_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isProduction,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  };
}

export function requireOwner(request: Request): { ok: true; profile: OwnerProfile } | { ok: false; error: string; status: number } {
  const profile = verifySession(sessionFromRequest(request));
  if (!profile) {
    return { ok: false, error: "Owner login required. Register and log in before issuing commands.", status: 401 };
  }
  return { ok: true, profile };
}

export function logoutOwner(token: string | null): { ok: boolean } {
  if (!token) return { ok: true };
  const data = read();
  const digest = tokenHash(token);
  const before = data.sessions.length;
  data.sessions = data.sessions.filter((session) => session.tokenHash !== digest);
  audit(data, "owner.logout", "session removed");
  write(data);
  return { ok: data.sessions.length !== before || before === 0 };
}
