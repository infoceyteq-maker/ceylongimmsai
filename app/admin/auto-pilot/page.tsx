"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

/**
 * /admin/auto-pilot — the Owner's command console for the GIMMS Auto-Pilot.
 *
 * Three honest states are visible at all times, because the whole point of this
 * console is that it never pretends:
 *   1. WORKER  — is a browser worker configured and reachable?
 *   2. POLICY  — which classes of action are permitted on this deployment?
 *   3. STORAGE — is the job record durable, or will it vanish on cold start?
 *
 * The Owner types a command, gets a PLAN, and then decides. Nothing runs on "plan".
 */

type PolicyCheck = { id: string; passed: boolean; detail: string };

type AgentStep = {
  op: string;
  description: string;
  url?: string;
  selector?: string;
  text?: string;
  name?: string;
};

type AgentJobView = {
  id: string;
  createdAt: string;
  status: string;
  kind: string;
  platform: string;
  startUrl: string;
  command: string;
  requiresApproval: boolean;
  approvalReasons: string[];
  stepCount: number;
  steps: AgentStep[];
  attempts: number;
  error?: string;
  policyChecks: PolicyCheck[];
  result?: {
    ok: boolean;
    finalUrl: string;
    title: string;
    durationMs: number;
    extracted: Record<string, unknown>;
    screenshots: { name: string; url?: string }[];
    log: { at: string; level: string; message: string }[];
    error?: string;
  };
};

type ConsoleState = {
  ok?: boolean;
  storage?: { mode: string; durable: boolean };
  worker?: { configured: boolean; missing: string[]; note: string };
  outbound?: { allowedPlatforms: string[]; operatorAttested: boolean };
  limits?: { maxDurationMs: number; maxSteps: number; maxScreenshots: number };
  policy?: { allowed: string[]; refused: string[]; why: string };
  jobs?: AgentJobView[];
  counts?: Record<string, number>;
  error?: string;
};

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "#177a45",
  RUNNING: "#177a45",
  DISPATCHED: "#177a45",
  AWAITING_APPROVAL: "#8a6d1f",
  QUEUED: "#555",
  BLOCKED_BY_POLICY: "#a11",
  FAILED: "#a11",
  CANCELLED: "#777",
};

export default function AutoPilotPage() {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [command, setCommand] = useState(
    'read https://gimms.lk and screenshot the homepage',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plan, setPlan] = useState<AgentJobView | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/agent", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/admin/login?next=/admin/auto-pilot");
        return;
      }
      setState((await response.json()) as ConsoleState);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function send(action: "plan" | "run" | "approve" | "cancel", extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, command, ...extra }),
      });
      const data = (await response.json()) as Record<string, any>;
      if (!response.ok) {
        const reasons = Array.isArray(data.policy?.reasons) ? ` — ${data.policy.reasons.join(" ")}` : "";
        throw new Error(`${data.error ?? `HTTP ${response.status}`}${reasons}`);
      }
      if (data.job) setPlan(data.job as AgentJobView);
      setNotice(
        data.awaitingApproval
          ? "Plan stored. It has an outside effect, so it will not run until you approve it."
          : data.dispatched
            ? "Worker accepted the plan. Watch the status below."
            : "Plan created. Nothing has run yet.",
      );
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setPlan(null);
    await send("plan");
  }

  return (
    <main className="shell" style={{ maxWidth: 1100 }}>
      <header className="topbar" style={{ marginBottom: 22 }}>
        <div className="brand">
          <img src="/logo-512.png" alt="AI GIMMS" width={46} height={46} />
          <div>
            <h1>AI GIMMS</h1>
            <div className="tagline">Auto-Pilot · Owner console</div>
          </div>
        </div>
        <div className="meta">
          <a href="/chat">Owner chat</a> · <a href="/admin/auto-pilot">Auto-Pilot</a>
        </div>
      </header>

      {/* ── capability banner ───────────────────────────────────────────── */}
      <div className="grid stats" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="label">Browser worker</div>
          <div className="value" style={{ fontSize: 18, color: state?.worker?.configured ? "#177a45" : "#a11" }}>
            {state?.worker?.configured ? "CONFIGURED" : "NOT CONFIGURED"}
          </div>
          <div className="sub">
            {state?.worker?.configured
              ? "External container is reachable for dispatch"
              : `Missing: ${state?.worker?.missing?.join(", ") || "AGENT_WORKER_URL, AGENT_WORKER_SECRET"}`}
          </div>
        </div>

        <div className="card stat">
          <div className="label">Job storage</div>
          <div className="value" style={{ fontSize: 18, color: state?.storage?.durable ? "#177a45" : "#8a6d1f" }}>
            {state?.storage?.mode?.toUpperCase() ?? "…"}
          </div>
          <div className="sub">{state?.storage?.durable ? "Durable across instances" : "NOT durable — apply supabase/agent-schema.sql"}</div>
        </div>

        <div className="card stat">
          <div className="label">Outbound actions</div>
          <div className="value" style={{ fontSize: 18, color: "#a11" }}>REFUSED</div>
          <div className="sub">
            {state?.outbound?.allowedPlatforms?.length
              ? `Allowed: ${state.outbound.allowedPlatforms.join(", ")}`
              : "No platform opted in (AGENT_ALLOW_OUTBOUND unset)"}
          </div>
        </div>

        <div className="card stat">
          <div className="label">Running / awaiting</div>
          <div className="value" style={{ fontSize: 18 }}>
            {state?.counts?.running ?? 0} / {state?.counts?.awaitingApproval ?? 0}
          </div>
          <div className="sub">{state?.counts?.total ?? 0} jobs recorded</div>
        </div>
      </div>

      {/* ── command box ─────────────────────────────────────────────────── */}
      <section className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 19 }}>Issue a command</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          The planner is a deterministic rule engine. It returns a plan you can read before anything runs.
        </p>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <textarea
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            rows={3}
            maxLength={2000}
            style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)", fontFamily: "inherit", fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy || !command.trim()}>
              {busy ? "Working…" : "Plan only (safe)"}
            </button>
            <button
              className="btn"
              type="button"
              style={{ background: "#333" }}
              disabled={busy || !command.trim()}
              onClick={() => void send("run")}
            >
              Plan &amp; run if allowed
            </button>
          </div>
        </form>

        {error ? <p className="note" style={{ borderColor: "#a11" }}>{error}</p> : null}
        {notice ? <p className="note">{notice}</p> : null}
      </section>

      {/* ── the returned plan ───────────────────────────────────────────── */}
      {plan ? (
        <section className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              Plan · <span style={{ color: STATUS_COLOR[plan.status] ?? "#333" }}>{plan.status}</span>
            </h3>
            <span className="pill">{plan.kind} · {plan.platform} · {plan.stepCount} steps</span>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>{plan.startUrl}</p>

          <ol style={{ margin: "12px 0 0", paddingLeft: 20, fontSize: 13 }}>
            {plan.steps.map((step, index) => (
              <li key={index} style={{ marginBottom: 4 }}>
                <code>{step.op}</code> — {step.description}
                {step.selector ? <span className="muted"> · {step.selector}</span> : null}
              </li>
            ))}
          </ol>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Policy checks ({plan.policyChecks.filter((c) => c.passed).length}/{plan.policyChecks.length} passed)</summary>
            <ul style={{ fontSize: 12, marginTop: 8 }}>
              {plan.policyChecks.map((check) => (
                <li key={check.id} style={{ color: check.passed ? "#177a45" : "#a11" }}>
                  {check.passed ? "PASS" : "FAIL"} · {check.id} — {check.detail}
                </li>
              ))}
            </ul>
          </details>

          {plan.requiresApproval ? (
            <div style={{ marginTop: 14, padding: 12, border: "1px solid #8a6d1f", borderRadius: 10 }}>
              <strong>This plan can have an outside effect.</strong>
              <p className="muted" style={{ margin: "6px 0 10px" }}>
                Reasons: {plan.approvalReasons.join(", ")}. Approving sends it to the worker.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" disabled={busy} onClick={() => void send("approve", { jobId: plan.id })}>
                  Approve &amp; dispatch
                </button>
                <button className="btn" style={{ background: "#333" }} disabled={busy} onClick={() => void send("cancel", { jobId: plan.id })}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                disabled={busy || !state?.worker?.configured}
                onClick={() => void send("run", { command: plan.command })}
              >
                {state?.worker?.configured ? "Dispatch to worker" : "Dispatch (no worker configured)"}
              </button>
              <button className="btn" style={{ background: "#333" }} disabled={busy} onClick={() => void send("cancel", { jobId: plan.id })}>
                Cancel
              </button>
            </div>
          )}
        </section>
      ) : null}

      {/* ── job history ─────────────────────────────────────────────────── */}
      <section className="card">
        <h3 style={{ marginTop: 0, fontSize: 17 }}>Job history</h3>
        {!state?.jobs?.length ? (
          <p className="muted">No jobs yet.</p>
        ) : (
          <ul className="list">
            {state.jobs.map((job) => (
              <li key={job.id} className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 340px" }}>
                  <strong style={{ fontSize: 13 }}>
                    <span style={{ color: STATUS_COLOR[job.status] ?? "#333" }}>[{job.status}]</span> {job.kind}
                  </strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{job.command.slice(0, 140)}</div>
                  {job.error ? <div style={{ fontSize: 12, color: "#a11", marginTop: 2 }}>{job.error.slice(0, 200)}</div> : null}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="pill" style={{ fontSize: 10 }}>{new Date(job.createdAt).toLocaleString()}</span>
                  <button
                    className="btn"
                    style={{ padding: "5px 10px", fontSize: 11 }}
                    onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                  >
                    {expanded === job.id ? "Hide" : "Details"}
                  </button>
                </div>
                {expanded === job.id ? (
                  <div style={{ flex: "1 1 100%", marginTop: 8, fontSize: 12 }}>
                    <div><strong>Target:</strong> {job.startUrl}</div>
                    {job.result ? (
                      <>
                        <div style={{ marginTop: 6 }}>
                          <strong>Result:</strong> {job.result.ok ? "ok" : "failed"} · {job.result.title || "(no title)"} ·{" "}
                          {Math.round(job.result.durationMs / 1000)}s
                        </div>
                        <div><strong>Final URL:</strong> {job.result.finalUrl}</div>
                        {Object.keys(job.result.extracted).length ? (
                          <details style={{ marginTop: 4 }}>
                            <summary style={{ cursor: "pointer" }}>Extracted data</summary>
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 220, overflow: "auto" }}>
                              {JSON.stringify(job.result.extracted, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                        {job.result.log?.length ? (
                          <details style={{ marginTop: 4 }}>
                            <summary style={{ cursor: "pointer" }}>Worker log ({job.result.log.length})</summary>
                            <ul style={{ maxHeight: 200, overflow: "auto" }}>
                              {job.result.log.map((line, index) => (
                                <li key={index}>
                                  <span className="muted">{new Date(line.at).toLocaleTimeString()}</span> [{line.level}] {line.message}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </>
                    ) : (
                      <div className="muted">No result reported yet.</div>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── policy reference ────────────────────────────────────────────── */}
      <section className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0, fontSize: 17 }}>What this agent will and will not do</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, fontSize: 13 }}>
          <div>
            <strong style={{ color: "#177a45" }}>Permitted</strong>
            <ul>
              {(state?.policy?.allowed ?? []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <strong style={{ color: "#a11" }}>Refused by policy</strong>
            <ul>
              {(state?.policy?.refused ?? []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
        <p className="note">{state?.policy?.why}</p>
      </section>
    </main>
  );
}
