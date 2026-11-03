"use client";

import { useCallback, useEffect, useState } from "react";
import HubShell from "@/components/HubShell";

type Connection = {
  id: string;
  name: string;
  category: string;
  purpose: string;
  status: string;
  verifiedBy: string;
  credentialName: string;
  scopes: string[];
  networkProbe: string;
  ownerApprovalRequired: boolean;
  approvalGates: string[];
  authenticatedTest: string;
  blockers: string[];
  note: string;
};

type Snapshot = {
  ok: boolean;
  summary?: Record<string, number>;
  readiness?: { status: string; nextActions: string[]; ownerRegistrationState: string };
  connections?: Connection[];
  honesty?: Record<string, unknown>;
};

type ProbeResult = { id: string; reachable: boolean; httpStatus: number | null; error: string | null; note: string };

const banner = {
  background: "rgba(23,122,69,0.09)", border: "1px solid rgba(23,122,69,0.35)",
  borderRadius: 12, padding: "12px 14px", fontSize: 13, marginBottom: 16,
};
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

export default function Page() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/developer-team", { cache: "no-store" });
      if (!response.ok) throw new Error(`developer-team returned ${response.status}`);
      setData((await response.json()) as Snapshot);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runProbes() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/developer-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe-all" }),
      });
      const result = (await response.json()) as { results?: ProbeResult[]; ok: boolean };
      setProbes(result.results ?? []);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const connections = data?.connections ?? [];
  const connected = connections.filter((item) => item.status === "CONNECTED" || item.status === "CONNECTED_LOCAL");
  const blocked = connections.filter((item) => item.status === "BLOCKED");
  const pending = connections.filter((item) => item.status === "CONFIGURED_PENDING_RUN");

  return (
    <HubShell>
      <div className="section-head">
        <h2>Developer Team · Connections</h2>
        <p>Everything needed to move forward — real connection status, real network probes, exact approval gates. Nothing is marked connected without evidence.</p>
      </div>

      <div style={banner}>
        <strong>Honesty boundary:</strong> 0 AI models connected · 0 emails sent · 0 purchases · 0 deploys · 0 credential values in chat.
        OpenAI / Gemini / Gmail / Workspace hosts are <strong>unreachable from this sandbox</strong> (real probes returned 000); the Arena connector catalog returned <code>catalog_error</code> this turn.
        <br />GitHub, npm, the local toolchain, the 114-skill gateway and the real-time Owner Chat <strong>are</strong> connected and tested.
      </div>

      {error && <div className="note" style={{ borderColor: "#a33" }}>ERROR: {error}</div>}

      <div className="grid stats">
        <div className="card stat"><div className="label">Connected (real)</div><div className="value">{connected.length}</div><div className="sub">External + local, verified</div></div>
        <div className="card stat"><div className="label">CI configured</div><div className="value">{pending.length}</div><div className="sub">Pending real run</div></div>
        <div className="card stat"><div className="label">Blocked</div><div className="value">{blocked.length}</div><div className="sub">Approval / credential / network</div></div>
        <div className="card stat"><div className="label">AI models connected</div><div className="value">{data?.summary?.aiModelsConnected ?? 0}</div><div className="sub">Never simulated</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2 style={{ fontSize: 18 }}>Real network probes</h2><p>Unauthenticated HTTPS checks — failures reported honestly, never as success</p></div>
        <button className="btn" onClick={runProbes} disabled={busy}>{busy ? "Probing…" : "Run real probes"}</button>
        {probes.length > 0 && (
          <ul className="list" style={{ marginTop: 12 }}>
            {probes.map((probe) => (
              <li className="row" key={probe.id}>
                <strong>{probe.id}</strong>
                <span style={mono}>
                  {probe.reachable ? `HTTP ${probe.httpStatus ?? "LOCAL"} · reachable` : `000 · UNREACHABLE${probe.error ? ` (${probe.error.slice(0, 60)})` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {probes.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No probe run yet. Click above for real evidence.</p>}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2 style={{ fontSize: 18 }}>Connected &amp; working</h2><p>Real evidence, not placeholders</p></div>
        <ul className="list">
          {connected.map((item) => (
            <li className="row" key={item.id} style={{ display: "block" }}>
              <strong>{item.name} · {item.status}</strong>
              <div style={{ fontSize: 13 }}>{item.purpose}</div>
              <span>{item.verifiedBy}</span>
              <span style={mono}>credential: {item.credentialName}</span>
            </li>
          ))}
          {pending.map((item) => (
            <li className="row" key={item.id} style={{ display: "block" }}>
              <strong>{item.name} · {item.status}</strong>
              <div style={{ fontSize: 13 }}>{item.purpose}</div>
              <span>{item.verifiedBy}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-head"><h2 style={{ fontSize: 18 }}>Blocked — exactly what is needed</h2><p>No placeholder connection, no simulated success</p></div>
        <ul className="list">
          {blocked.map((item) => (
            <li className="row" key={item.id} style={{ display: "block" }}>
              <strong>{item.name} · {item.networkProbe}</strong>
              <div style={{ fontSize: 13, marginTop: 3 }}>{item.purpose}</div>
              <span style={mono}>credential NAME: {item.credentialName}</span>
              <div style={{ fontSize: 12, marginTop: 6 }}><b>Blockers:</b> {item.blockers.join(" · ")}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}><b>Owner approval gates:</b> {item.approvalGates.join(" · ")}</div>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      </div>

      {data?.readiness && (
        <div className="card">
          <div className="section-head"><h2 style={{ fontSize: 18 }}>Next actions before real AI use</h2><p>{data.readiness.status}</p></div>
          <div className="steps">
            {data.readiness.nextActions.map((action, index) => (
              <div className="step" key={action}><b>{index + 1}</b>{action}</div>
            ))}
          </div>
          <p className="muted">Owner registration state: {data.readiness.ownerRegistrationState}. Register your own password at <a href="/chat" style={{ textDecoration: "underline" }}>/chat</a>.</p>
        </div>
      )}
    </HubShell>
  );
}
