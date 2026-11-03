/**
 * GIMMS — OWNER REGISTRATION (Founder / Owner / Super Admin), local-first.
 *
 * Creates ONE local Owner account with an employee profile, permissions and a
 * REAL working login. Security properties:
 *  - scrypt (Node built-in crypto) with a random 16-byte salt; only the derived
 *    hash is stored. The password is NEVER returned, logged, printed or persisted.
 *  - constant-time comparison; failed-attempt lockout (5 attempts / 10 min).
 *  - random 32-byte session token; only its SHA-256 is stored; 8h expiry.
 *  - httpOnly, SameSite=Lax cookie (see app/api/owner/route.ts).
 *
 * HONEST BOUNDARIES (do not overstate):
 *  - LOCAL DEV AUTH ONLY. No Supabase Auth, no SSO, no MFA, no email verification,
 *    no password reset email, no production identity provider, no RLS.
 *  - No real Owner name/email/credentials are invented. `email: null`,
 *    `realDetailsStored: false`, `profileComplete: false`.
 *  - No external call, no email, no personal account connected, no deploy.
 *  - The Owner sets their OWN password through the local UI. This module never
 *    receives a password from chat and never asks for one.
 *
 * Storage: data/gimms-owner.json (git-ignored). File-only: no in-memory cache,
 * so deleting the file genuinely returns the app to UNREGISTERED.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { auditEntry } from "@/lib/store";
import { hash } from "@/lib/jobs";

const FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "gimms-owner.json");
export const OWNER_COOKIE = "gimms_owner_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 10 * 60 * 1000;

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
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
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
  "LOCAL DEV auth only — no Supabase Auth / SSO / MFA / email verification",
  "scrypt salted hash only; password never stored, returned, logged or shown in chat",
  "httpOnly + SameSite=Lax session cookie, 8h expiry, token stored as SHA-256 only",
  "5 failed attempts → 10 minute lockout; constant-time password comparison",
  "No real Owner identity invented: email null, realDetailsStored false",
  "No email sent, no personal account connected, no external API call, no deploy",
  "Production-grade identity provider remains BLOCKED pending separate Owner approval",
] as const;

export function ownerStatus() {
  const data = read();
  return {
    registered: data.registered,
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
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OWNER_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
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
