"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

/**
 * /admin/login — Owner sign-in for the Auto-Pilot console.
 *
 * Deliberately minimal and separated from /chat: if the admin console is ever
 * exposed to a wider audience, the login surface is its own page with its own
 * rate limit, not a modal on a marketing route.
 *
 * The password never touches our logs, and the registration form only appears when
 * the deployment genuinely has no Owner yet AND the server says registration is open.
 */

type OwnerState = {
  registered?: boolean;
  authenticated?: boolean;
  registrationOpen?: boolean;
  bootstrapTokenRequired?: boolean;
  registrationBlockedReason?: string;
  durable?: boolean;
  cookieName?: string;
};

export default function AdminLoginPage() {
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/owner", { cache: "no-store" });
      setOwner((await response.json()) as OwnerState);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const action = owner?.registered ? "login" : "register";
    try {
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bootstrapToken ? { "x-gimms-bootstrap-token": bootstrapToken } : {}),
        },
        body: JSON.stringify({
          action,
          password,
          ...(action === "register" ? { displayName } : {}),
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; durable?: boolean };
      setPassword("");
      setBootstrapToken("");
      if (!response.ok || !data.ok) throw new Error(data.error || `sign-in returned ${response.status}`);
      setNotice(
        data.durable === false
          ? "Signed in. WARNING: this deployment cannot persist sessions (ephemeral filesystem) — see the report §5."
          : "Signed in. Redirecting…",
      );
      await refresh();
      const next = new URLSearchParams(window.location.search).get("next");
      // Same-origin admin path only: never follow an absolute or protocol-relative URL.
      const destination = next && next.startsWith("/admin") ? next : "/admin/auto-pilot";
      window.location.assign(destination);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const registering = owner?.registered === false;

  return (
    <main className="shell" style={{ maxWidth: 520 }}>
      <header className="topbar" style={{ marginBottom: 26 }}>
        <div className="brand">
          <img src="/logo-512.png" alt="AI GIMMS" width={46} height={46} />
          <div>
            <h1>AI GIMMS</h1>
            <div className="tagline">Auto-Pilot · Owner access</div>
          </div>
        </div>
      </header>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: 20 }}>
          {registering ? "First-run Owner registration" : "Owner sign-in"}
        </h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {registering
            ? "No Owner exists on this deployment yet. Choose a password of at least 12 characters. It is hashed with scrypt and never stored in plaintext."
            : "Sign in with the password you set. Sessions last 8 hours and are stored as SHA-256 hashes only."}
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {registering ? (
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)" }}
            />
          ) : null}

          <input
            type="password"
            placeholder={registering ? "Choose a password (12+ characters)" : "Owner password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={registering ? "new-password" : "current-password"}
            required
            minLength={12}
            style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)" }}
          />

          {registering && owner?.bootstrapTokenRequired ? (
            <input
              type="password"
              placeholder="OWNER_BOOTSTRAP_TOKEN (from Vercel env vars)"
              value={bootstrapToken}
              onChange={(event) => setBootstrapToken(event.target.value)}
              autoComplete="off"
              style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)" }}
            />
          ) : null}

          <button className="btn" type="submit" disabled={busy || password.length < 12}>
            {busy ? "Working…" : registering ? "Create Owner & sign in" : "Sign in"}
          </button>
        </form>

        {error ? <p className="note" style={{ borderColor: "#a11" }}>{error}</p> : null}
        {notice ? <p className="note">{notice}</p> : null}

        {registering && owner?.registrationBlockedReason ? (
          <p className="note">
            <strong>Registration is currently blocked.</strong> {owner.registrationBlockedReason}
          </p>
        ) : null}
      </section>

      <p className="note" style={{ marginTop: 24 }}>
        This console controls a real remote browser. Read{" "}
        <code>PHASE2-AGENT-ARCHITECTURE.md</code> before enabling outbound actions — automated
        interaction on social platforms breaches their terms and risks your account.
      </p>
    </main>
  );
}
