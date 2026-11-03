"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import HubShell from "@/components/HubShell";

type OwnerState = {
  registered: boolean;
  authenticated?: boolean;
  profile?: { employeeId: string; displayName: string; role: string; permissions: string[]; email: null; realDetailsStored: boolean; secureAuthProvider: string };
  security?: { algorithm: string; sessionTtlHours: number; passwordStoredInPlaintext: boolean; boundaries: string[] };
  loginState?: string;
};

type LiveEvent = {
  id: string;
  sequence: number;
  at: string;
  kind: string;
  stage: string;
  level: string;
  message: string;
  jobId?: string;
  data?: Record<string, unknown>;
  sha256: string;
};

type ChatData = {
  ok: boolean;
  flow?: { stages: string[]; status: string; aiDeveloperAssignment: string; executor: string; aiModelUsed: boolean };
  snapshot?: {
    counts: { messages: number; events: number; reviews: number; commands: number };
    messages: { id: string; role: string; text: string; at: string; jobId?: string; aiModelUsed: boolean; sha256: string }[];
    events: LiveEvent[];
    reviews: { id: string; jobId: string; decision: string; decidedBy: string; resultVersion: string }[];
    commands: { id: string; jobId: string; text: string; checksPassed: number; checksFailed: number; resultSha256: string; aiModelUsed: boolean }[];
    lastEventSequence: number;
    sha256: string;
  };
  jobs?: { jobId: string; title: string; status: string; department: string; auditEntries: number }[];
  connections?: Record<string, unknown>;
  honesty?: Record<string, unknown>;
};

type RegistryData = {
  ok: boolean;
  summary?: Record<string, number | string[]>;
  essentialSkillGroups?: { id: string; name: string; status: string; readySkills: string[]; note: string }[];
  localTools?: { id: string; available: boolean; version: string; note: string }[];
  connections?: { id: string; name: string; status: string; connectedToGimms: boolean; authorizationRequired: boolean; note: string }[];
};

const SAMPLE_COMMAND =
  "GIMMS, register this development task, run the local QA and dependency checks, and report the result for my review.";

const banner: CSSProperties = {
  background: "rgba(23,122,69,0.09)", border: "1px solid rgba(23,122,69,0.35)",
  borderRadius: 12, padding: "12px 14px", fontSize: 13, marginBottom: 16,
};
const mono: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };
const feed: CSSProperties = { maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.35)" };
const msgBox: CSSProperties = { maxHeight: 360, overflowY: "auto", marginBottom: 16 };
const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 };

export default function Page() {
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [chat, setChat] = useState<ChatData | null>(null);
  const [registry, setRegistry] = useState<RegistryData | null>(null);
  const [live, setLive] = useState<LiveEvent[]>([]);
  const [streamState, setStreamState] = useState("CLOSED");
  const [command, setCommand] = useState(SAMPLE_COMMAND);
  const [reviewJobId, setReviewJobId] = useState("");
  const [reviewDecision, setReviewDecision] = useState("APPROVED_LOCAL_RECORD_ONLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const streamRef = useRef<EventSource | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const refreshOwner = useCallback(async () => {
    const res = await fetch("/api/owner", { cache: "no-store" });
    setOwner((await res.json()) as OwnerState);
  }, []);

  const refreshChat = useCallback(async () => {
    const res = await fetch("/api/chat", { cache: "no-store" });
    if (res.status === 401) {
      setChat(null);
      return false;
    }
    if (res.ok) setChat((await res.json()) as ChatData);
    return res.ok;
  }, []);

  const refreshRegistry = useCallback(async () => {
    const res = await fetch("/api/skills-tools", { cache: "no-store" });
    if (res.ok) setRegistry((await res.json()) as RegistryData);
  }, []);

  const openStream = useCallback(() => {
    if (streamRef.current) streamRef.current.close();
    const source = new EventSource("/api/chat/stream?since=0");
    streamRef.current = source;
    setStreamState("CONNECTING");
    source.addEventListener("ready", () => setStreamState("LIVE"));
    source.onopen = () => setStreamState("LIVE");
    source.onerror = () => setStreamState("RECONNECTING");
    for (const level of ["info", "progress", "blocked", "error", "result", "reconnect"]) {
      source.addEventListener(level, (raw) => {
        try {
          const payload = JSON.parse((raw as MessageEvent).data) as LiveEvent;
          if (!payload || !payload.id || seenRef.current.has(payload.id)) return;
          seenRef.current.add(payload.id);
          setLive((previous) => [...previous.slice(-120), payload]);
        } catch {
          /* reconnect notice is not an event */
        }
      });
    }
  }, []);

  useEffect(() => {
    void refreshOwner();
    void refreshRegistry();
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [refreshOwner, refreshRegistry]);

  useEffect(() => {
    if (owner?.authenticated) {
      void refreshChat();
      openStream();
    } else {
      streamRef.current?.close();
      streamRef.current = null;
      setStreamState("CLOSED");
    }
  }, [owner?.authenticated, refreshChat, openStream]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const action = owner?.registered ? "login" : "register";
    try {
      const res = await fetch("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password, ...(action === "register" ? { displayName } : {}) }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setPassword("");
      if (!res.ok || !data.ok) throw new Error(data.error || `auth returned ${res.status}`);
      setNotice(action === "register" ? "Owner account registered locally. You are now logged in." : "Logged in.");
      await refreshOwner();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", text: command }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; jobId?: string; result?: { checksPassed: number; checksFailed: number; blockedStage: string } };
      if (!res.ok || !data.ok) throw new Error(data.error || `command returned ${res.status}`);
      setNotice(`Real command executed. Job ${data.jobId} · ${data.result?.checksPassed} checks passed / ${data.result?.checksFailed} failed · AI stage ${data.result?.blockedStage}.`);
      setReviewJobId(data.jobId ?? "");
      await refreshChat();
    } catch (cause) {
      setError((cause as Error).message);
      await refreshChat();
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", jobId: reviewJobId, decision: reviewDecision }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `review returned ${res.status}`);
      setNotice("Owner review recorded with the result version.");
      await refreshChat();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/owner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    streamRef.current?.close();
    streamRef.current = null;
    setChat(null);
    setLive([]);
    seenRef.current = new Set();
    await refreshOwner();
  }

  return (
    <HubShell>
      <div className="section-head">
        <h2>Owner Chat · AI Development Team</h2>
        <p>Real-time command interface for the Production AI Development Team. Real jobs, real progress events, real tests, real Owner review.</p>
      </div>

      <div style={banner}>
        <strong>Honesty boundary:</strong> 0 AI models connected · GIMMS Development Agent is a LOCAL deterministic coordinator ·
        AI developer assignment is <strong>BLOCKED</strong>, never simulated · no external API call, no email, no purchase, no deploy.
        <br />This chat is operational for real local commands; it is <strong>not</strong> an AI model chat.
      </div>

      {!owner && <p className="muted">Loading Owner status…</p>}

      {owner && !owner.authenticated && (
        <div className="card" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>{owner.registered ? "Owner login" : "Step 1 — Owner registration"}</h3>
          <p className="muted">
            {owner.registered
              ? "Your local Founder / Super Admin account exists. Log in to issue commands."
              : "Register your local Founder / Owner / Super Admin account. Choose your own password here — it is never sent to chat, never logged and never stored in plaintext."}
          </p>
          <form className="form" onSubmit={submitAuth}>
            <input type="password" placeholder="Password (min 12 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
            {!owner.registered && <input type="text" placeholder="Display name (optional — no real details invented)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
            <button className="btn" type="submit" disabled={busy}>{owner.registered ? "Log in" : "Register & log in"}</button>
            <div className="msg">
              {owner.registered
                ? "Already registered. Local dev auth only — no SSO/MFA/email verification yet."
                : "LOCAL DEV AUTH ONLY. No Supabase Auth, no email, no personal account connected."}
            </div>
          </form>
          {owner.security && <p className="muted" style={{ marginTop: 12 }}>{owner.security.algorithm} · {owner.security.sessionTtlHours}h session · stored plaintext: {String(owner.security.passwordStoredInPlaintext)}</p>}
        </div>
      )}

      {owner?.authenticated && (
        <>
          <div className="grid stats">
            <div className="card stat"><div className="label">Owner</div><div className="value" style={{ fontSize: 18 }}>{owner.profile?.employeeId}</div><div className="sub">{owner.profile?.role}</div></div>
            <div className="card stat"><div className="label">Live stream</div><div className="value" style={{ fontSize: 18 }}>{streamState}</div><div className="sub">SSE · real persisted events</div></div>
            <div className="card stat"><div className="label">Commands / Jobs</div><div className="value">{chat?.snapshot?.counts.commands ?? 0} / {chat?.jobs?.length ?? 0}</div><div className="sub">Real local job model</div></div>
            <div className="card stat"><div className="label">AI models connected</div><div className="value">0</div><div className="sub">BLOCKED, not simulated</div></div>
          </div>

          {(notice || error) && (
            <div className="note" style={{ borderColor: error ? "#a33" : undefined }}>
              {error ? `ERROR: ${error}` : notice}
            </div>
          )}

          <div style={twoCol}>
            <div className="card">
              <div className="section-head"><h2 style={{ fontSize: 18 }}>Conversation</h2><p>Real persisted history · SHA-256 per message</p></div>
              <div style={msgBox}>
                {(chat?.snapshot?.messages ?? []).length === 0 && <p className="muted">No messages yet. Issue your first real command below.</p>}
                <ul className="list">
                  {(chat?.snapshot?.messages ?? []).map((message) => (
                    <li className="row" key={message.id} style={{ display: "block" }}>
                      <strong style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: "0.08em" }}>
                        {message.role} · {new Date(message.at).toLocaleTimeString()} · AI model used: {String(message.aiModelUsed)}
                      </strong>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{message.text}</div>
                      {message.jobId && <div style={mono}>job: {message.jobId}</div>}
                      <div style={{ ...mono, opacity: 0.6 }}>sha {message.sha256.slice(0, 20)}…</div>
                    </li>
                  ))}
                </ul>
              </div>
              <form className="form" onSubmit={sendCommand} style={{ marginBottom: 8 }}>
                <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Type a real command…" required />
                <button className="btn" type="submit" disabled={busy}>Send command</button>
                <div className="msg">Commands create a real job and run real local checks. AI model output is not available yet.</div>
              </form>
              <button className="btn" style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }} onClick={logout}>Log out</button>
            </div>

            <div className="card">
              <div className="section-head"><h2 style={{ fontSize: 18 }}>Live activity</h2><p>Real-time progress events · errors · results</p></div>
              <div style={feed}>
                {live.length === 0 && <p className="muted">Waiting for real events… send a command.</p>}
                <ul className="list">
                  {live.slice(-60).map((item) => (
                    <li className="row" key={item.id} style={{ display: "block" }}>
                      <strong style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        #{item.sequence} · {item.level} · {item.stage}
                      </strong>
                      <div style={{ fontSize: 12, marginTop: 3 }}>{item.message}</div>
                      <span style={mono}>{item.kind} · sha {item.sha256.slice(0, 12)}…</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="muted" style={{ marginTop: 10 }}>Stream state: {streamState}. Reconnects automatically; duplicates are de-duplicated by event id.</p>
            </div>
          </div>

          <div style={{ ...twoCol, marginTop: 14 }}>
            <div className="card">
              <div className="section-head"><h2 style={{ fontSize: 18 }}>Job management</h2><p>Real 13-state job machine · audit trail</p></div>
              <ul className="list">
                {(chat?.jobs ?? []).length === 0 && <li className="row"><span>No jobs yet.</span></li>}
                {(chat?.jobs ?? []).map((job) => (
                  <li className="row" key={job.jobId}>
                    <strong>{job.title.slice(0, 58)}</strong>
                    <span>{job.status} · Dept {job.department} · {job.auditEntries} audit entries · <span style={mono}>{job.jobId}</span></span>
                  </li>
                ))}
              </ul>
              <form className="form" onSubmit={submitReview} style={{ marginTop: 14, marginBottom: 0 }}>
                <input value={reviewJobId} onChange={(e) => setReviewJobId(e.target.value)} placeholder="Job ID to review" required />
                <select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--line)" }}>
                  <option value="APPROVED_LOCAL_RECORD_ONLY">APPROVED_LOCAL_RECORD_ONLY</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
                <button className="btn" type="submit" disabled={busy}>Record Owner review</button>
              </form>
              <div className="card" style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reviews</strong>
                <ul className="list">
                  {(chat?.snapshot?.reviews ?? []).length === 0 && <li className="row"><span>No Owner review recorded yet.</span></li>}
                  {(chat?.snapshot?.reviews ?? []).map((review) => (
                    <li className="row" key={review.id}><strong>{review.decision}</strong><span>{review.decidedBy} · version {review.resultVersion.slice(0, 16)}…</span></li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="card">
              <div className="section-head"><h2 style={{ fontSize: 18 }}>Execution flow</h2><p>{chat?.flow?.status}</p></div>
              <div className="steps">
                {(chat?.flow?.stages ?? []).map((stage, index) => (
                  <div className="step" key={stage}><b>{index + 1}</b>{stage}</div>
                ))}
              </div>
              <p className="muted">Executor: {chat?.flow?.executor}. AI developer assignment: {chat?.flow?.aiDeveloperAssignment}.</p>
              <div className="card" style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Latest results</strong>
                <ul className="list">
                  {(chat?.snapshot?.commands ?? []).length === 0 && <li className="row"><span>No results yet.</span></li>}
                  {(chat?.snapshot?.commands ?? []).slice(-5).map((item) => (
                    <li className="row" key={item.id}>
                      <strong>{item.checksPassed} pass / {item.checksFailed} fail</strong>
                      <span style={mono}>{item.resultSha256.slice(0, 20)}… · AI used {String(item.aiModelUsed)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-head"><h2 style={{ fontSize: 18 }}>Skills &amp; Tools Registry</h2><p>Centralized · existing 114 local skills + {String(registry?.summary?.specOnlyDevelopmentSkills ?? 29)} spec-only development skills</p></div>
            <div className="grid stats">
              {(registry?.essentialSkillGroups ?? []).map((group) => (
                <div className="card stat" key={group.id}>
                  <div className="label">{group.status}</div>
                  <div className="value" style={{ fontSize: 15 }}>{group.name}</div>
                  <div className="sub">{group.readySkills.length} ready local skills · {group.note.slice(0, 110)}</div>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              Local tools detected: {(registry?.localTools ?? []).filter((tool) => tool.available).length}/{(registry?.localTools ?? []).length} ·
              {" "}{(registry?.localTools ?? []).map((tool) => `${tool.id}:${tool.available ? "yes" : "no"}`).join(" · ")}
            </p>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-head"><h2 style={{ fontSize: 18 }}>Connections</h2><p>0 AI models connected · nothing marked connected without an authenticated test</p></div>
            <ul className="list">
              {(registry?.connections ?? []).map((connection) => (
                <li className="row" key={connection.id}>
                  <strong>{connection.name}</strong>
                  <span>{connection.status} · connectedToGimms: {String(connection.connectedToGimms)} · authorization required: {String(connection.authorizationRequired)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </HubShell>
  );
}
