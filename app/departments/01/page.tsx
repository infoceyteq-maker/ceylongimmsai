"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import HubShell from "@/components/HubShell";

const OWNER_COMMAND =
  "GIMMS, create a new employee record, prepare an employment agreement in Word and PDF, create a payroll sheet in Excel, register an approved office expense, and assign a website development job to Production through Management.";

type Agent = {
  id: string;
  name: string;
  division: string;
  jobRole: string;
  functions: string[];
  inputs: string[];
  outputs: string[];
  skills: string[];
  permissions: string[];
  approvalRequirements: string[];
  modelConnected: boolean;
  status: string;
};

type Artifact = { name: string; format: string; bytes: number; sha256: string; generatedBy: string };
type Approval = { id: string; subject: string; status: string; artifactVersion: string; decidedBy: string; scope: string };
type SkillRow = { id: string; departmentId: string; kind: string; description: string };

type Snapshot = {
  ok: boolean;
  honesty?: Record<string, unknown>;
  summary?: {
    records: number;
    artifacts: number;
    artifactBytes: number;
    approvals: number;
    workflows: number;
    commands: number;
    nextEmployeeId: string;
    byCollection: Record<string, number>;
  };
  modules?: string[];
  skillCount?: number;
  agentSummary?: { total: number; modelConnected: number };
  agents?: Agent[];
  ownerAccountProposal?: Record<string, unknown>;
  artifacts?: Artifact[];
  approvals?: Approval[];
  workflows?: { id: string; chain: string; ownerApproval: string; steps: { name: string; jobId: string; department: string; status: string }[] }[];
  commands?: { id: string; command: string; stepsExecuted: number; stepsSucceeded: number }[];
  integrationRequests?: Record<string, unknown>;
};

type CommandResult = {
  ok?: boolean;
  error?: string;
  evidence?: {
    parsedSteps?: string[];
    stepsExecuted?: number;
    stepsSucceeded?: number;
    executedSteps?: { step: string; ok: boolean; evidence: Record<string, unknown> }[];
    aiModelUsed?: boolean;
  };
  sha256?: string;
  steps?: string[];
};

export default function Page() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [command, setCommand] = useState(OWNER_COMMAND);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [skillId, setSkillId] = useState("hr.employee.register");
  const [skillResult, setSkillResult] = useState<CommandResult | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [approver, setApprover] = useState("");
  const [artifactVersion, setArtifactVersion] = useState("");
  const [decision, setDecision] = useState("APPROVED_RECORD_ONLY");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [res, skillRes] = await Promise.all([
        fetch("/api/dept01", { cache: "no-store" }),
        fetch("/api/skills", { cache: "no-store" }),
      ]);
      if (res.ok) setSnapshot((await res.json()) as Snapshot);
      if (skillRes.ok) {
        const data = (await skillRes.json()) as { skills?: SkillRow[] };
        setSkills((data.skills ?? []).filter((skill) => skill.departmentId === "01"));
      }
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runCommand(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/dept01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", command }),
      });
      const data = (await response.json()) as CommandResult;
      setCommandResult(data);
      await refresh();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSelectedSkill(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId, payload: { title: `Dept 01 dashboard run ${new Date().toISOString()}` } }),
      });
      const data = (await response.json()) as CommandResult;
      setSkillResult(data);
      await refresh();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitApproval(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/dept01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", approvalId, approver, artifactVersion, decision }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      setMessage(data.ok ? `Versioned decision recorded for ${approvalId}` : `Error: ${data.error ?? "unknown"}`);
      await refresh();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testGuard() {
    setBusy(true);
    try {
      const response = await fetch("/api/dept01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment.execute" }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      setMessage(`payment.execute → HTTP ${response.status}, ok=${String(data.ok)}: ${data.error ?? ""}`);
    } finally {
      setBusy(false);
    }
  }

  const summary = snapshot?.summary;
  const requests = snapshot?.integrationRequests ?? {};

  return (
    <HubShell>
      <div className="hero">
        <div>
          <h2>Department 01 · HR, Finance &amp; Administration</h2>
          <p>
            Local, credential-free P1-01 implementation. 80 deterministic skills behind the single
            skills gateway, 10 role-based agent contracts, real .docx / .xlsx / .pptx / .pdf / .eml /
            .ics files, versioned approvals and a real HR → Management → Production job chain.
          </p>
        </div>
        <span className="badge">LOCAL · 0 connected · NOT 100% complete</span>
      </div>

      <div className="note" style={{ marginBottom: 18 }}>
        <strong>Honesty boundary:</strong> Microsoft Office, Google Workspace, Outlook, Gmail, Drive,
        payment/accounting APIs, e-signature, Supabase Auth, AI models, MCP and plugins are{" "}
        <strong>NOT CONNECTED</strong>. Native compatible files are generated locally. No money moves,
        no email/calendar is sent, no real Owner details are stored, no secure login exists yet,
        no deploy was performed. EMP-0001 is a proposal only. Publishing stays MANUAL.
      </div>

      <div className="grid stats">
        <div className="card stat"><div className="label">Dept 01 native skills</div><div className="value">{snapshot?.skillCount ?? "—"}</div><div className="sub">single gateway</div></div>
        <div className="card stat"><div className="label">Local records</div><div className="value">{summary?.records ?? "—"}</div><div className="sub">real persisted rows</div></div>
        <div className="card stat"><div className="label">Real files</div><div className="value">{summary?.artifacts ?? "—"}</div><div className="sub">{summary?.artifactBytes ?? 0} bytes · SHA-256</div></div>
        <div className="card stat"><div className="label">Agents / models</div><div className="value">{snapshot?.agentSummary?.total ?? "—"} / {snapshot?.agentSummary?.modelConnected ?? "—"}</div><div className="sub">0 AI models connected</div></div>
        <div className="card stat"><div className="label">Connected APIs</div><div className="value">0</div><div className="sub">no credentials configured</div></div>
        <div className="card stat"><div className="label">Next employee ID</div><div className="value">{summary?.nextEmployeeId ?? "—"}</div><div className="sub">EMP-0001 reserved</div></div>
      </div>

      <div className="section-head">
        <h2>Owner command interface</h2>
        <p>Deterministic keyword parser — NOT an AI model. Executes real local work via the existing gateway.</p>
      </div>
      <form className="form" onSubmit={runCommand}>
        <textarea
          aria-label="Owner command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          rows={3}
          style={{ width: "100%", gridColumn: "1 / -1" }}
        />
        <button className="btn" type="submit" disabled={busy || !command.trim()}>Run command locally</button>
        <button className="btn" type="button" disabled={busy} onClick={testGuard}>Test payment guard</button>
      </form>
      {message ? <div className="note" style={{ marginTop: 10 }}>{message}</div> : null}
      {commandResult ? (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>ok={String(commandResult.ok)} · steps {commandResult.evidence?.stepsSucceeded ?? 0}/{commandResult.evidence?.stepsExecuted ?? 0} · aiModelUsed={String(commandResult.evidence?.aiModelUsed)}</strong>
          <p className="muted">evidence sha256 {String(commandResult.sha256 ?? "").slice(0, 24)}…</p>
          <ul className="list">
            {(commandResult.evidence?.executedSteps ?? []).map((step, index) => (
              <li className="row" key={`${step.step}-${index}`}>
                <strong>{step.step}</strong>
                <span>ok={String(step.ok)}</span>
              </li>
            ))}
          </ul>
          {commandResult.error ? <p className="muted">Error: {commandResult.error}</p> : null}
        </div>
      ) : null}

      <div className="section-head">
        <h2>Run one Dept 01 skill</h2>
        <p>All {skills.length || "—"} Dept 01 skills are executable here and via POST /api/skills.</p>
      </div>
      <form className="form" onSubmit={runSelectedSkill}>
        <select aria-label="Dept 01 skill" value={skillId} onChange={(event) => setSkillId(event.target.value)} style={{ gridColumn: "1 / -1" }}>
          {skills.map((skill) => (
            <option key={skill.id} value={skill.id}>{skill.id} · {skill.kind}</option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={busy}>Execute skill</button>
      </form>
      {skillResult ? (
        <div className="note" style={{ marginTop: 10 }}>
          {skillResult.ok ? `Executed ${skillResult.steps?.length ?? 0} steps · sha256 ${String(skillResult.sha256 ?? "").slice(0, 20)}…` : `Error: ${skillResult.error}`}
        </div>
      ) : null}

      <div className="section-head">
        <h2>10 role-based agents</h2>
        <p>Functions, inputs, outputs, skills, permissions and approval requirements are defined. 0 AI models connected.</p>
      </div>
      <div className="card" style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: 8 }}>Agent</th><th>Division / role</th><th>Functions</th><th>Inputs</th><th>Outputs</th><th>Skills</th><th>Permissions</th><th>Approvals</th><th>Model</th>
            </tr>
          </thead>
          <tbody>
            {(snapshot?.agents ?? []).map((agent) => (
              <tr key={agent.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}><strong>{agent.name}</strong><br /><span className="muted">{agent.id}</span></td>
                <td>{agent.division}<br /><span className="muted">{agent.jobRole}</span></td>
                <td>{agent.functions.length}</td><td>{agent.inputs.length}</td><td>{agent.outputs.length}</td>
                <td>{agent.skills.length}</td><td>{agent.permissions.length}</td><td>{agent.approvalRequirements.length}</td>
                <td><span className="pill pill-off">none</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <h2>Versioned approvals</h2>
        <p>No auto-approval. A decision must name an approver and the exact artifactVersion.</p>
      </div>
      <form className="form" onSubmit={submitApproval}>
        <input aria-label="Approval id" placeholder="approval id" value={approvalId} onChange={(event) => setApprovalId(event.target.value)} />
        <input aria-label="Approver" placeholder="approver" value={approver} onChange={(event) => setApprover(event.target.value)} />
        <input aria-label="Artifact version" placeholder="artifactVersion" value={artifactVersion} onChange={(event) => setArtifactVersion(event.target.value)} />
        <select aria-label="Decision" value={decision} onChange={(event) => setDecision(event.target.value)}>
          <option value="APPROVED_RECORD_ONLY">APPROVED_RECORD_ONLY</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <button className="btn" type="submit" disabled={busy}>Record decision</button>
      </form>
      <div className="card" style={{ marginTop: 12, marginBottom: 20 }}>
        <ul className="list">
          {(snapshot?.approvals ?? []).slice(0, 12).map((approval) => (
            <li className="row" key={approval.id}>
              <strong>{approval.subject}</strong>
              <span className="muted">{approval.status} · version {String(approval.artifactVersion).slice(0, 14)}… · {approval.decidedBy || "undecided"}</span>
            </li>
          ))}
          {(snapshot?.approvals ?? []).length === 0 ? <li className="row"><span className="muted">No approvals yet.</span></li> : null}
        </ul>
      </div>

      <div className="section-head">
        <h2>Cross-department workflow</h2>
        <p>Real jobs in the shared job model; Owner approval stays PENDING.</p>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        {(snapshot?.workflows ?? []).slice(0, 5).map((workflow) => (
          <div key={workflow.id} style={{ marginBottom: 12 }}>
            <strong>{workflow.id}</strong> · <span className="pill pill-off">{workflow.ownerApproval}</span>
            <p className="muted">{workflow.chain}</p>
            <ul className="list">
              {workflow.steps.map((step) => (
                <li className="row" key={step.jobId}><strong>{step.name}</strong><span>dept {step.department} · {step.status} · {step.jobId}</span></li>
              ))}
            </ul>
          </div>
        ))}
        {(snapshot?.workflows ?? []).length === 0 ? <p className="muted">No workflow yet — run the Owner command above.</p> : null}
      </div>

      <div className="section-head">
        <h2>Generated files (real bytes, SHA-256)</h2>
        <p>Downloads are served from the local artifact store — no Drive, OneDrive or email.</p>
      </div>
      <div className="card" style={{ marginBottom: 20, maxHeight: 260, overflowY: "auto" }}>
        <ul className="list">
          {(snapshot?.artifacts ?? []).slice(0, 30).map((artifact) => (
            <li className="row" key={artifact.name}>
              <a href={`/api/dept01/artifact?name=${encodeURIComponent(artifact.name)}`}><strong>{artifact.name}</strong></a>
              <span className="muted">{artifact.format} · {artifact.bytes}B · {String(artifact.sha256).slice(0, 16)}… · {artifact.generatedBy}</span>
            </li>
          ))}
          {(snapshot?.artifacts ?? []).length === 0 ? <li className="row"><span className="muted">No files generated yet.</span></li> : null}
        </ul>
      </div>

      <div className="section-head">
        <h2>EMP-0001 · proposed Owner account</h2>
        <p>Proposal only. No real personal data, no credentials, no secure login.</p>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <ul className="list">
          <li className="row"><strong>Employee ID</strong><span>EMP-0001 · Founder / Owner / Super Admin</span></li>
          <li className="row"><strong>Status</strong><span className="pill pill-off">PENDING_SECURE_REGISTRATION</span></li>
          <li className="row"><strong>Real details stored</strong><span>false</span></li>
          <li className="row"><strong>Secure login</strong><span>NOT IMPLEMENTED — needs Owner-approved auth provider</span></li>
          <li className="row"><strong>Department access</strong><span>01, 02, 03, 04, 05, 09, 10 (local registry only)</span></li>
          <li className="row"><strong>Approval permissions</strong><span>versioned record approval · workflow final sign-off</span></li>
          <li className="row"><strong>AI command interface</strong><span>deterministic local parser — NOT an AI model</span></li>
        </ul>
      </div>

      <div className="section-head">
        <h2>Integration requests for Owner review</h2>
        <p>Credential NAMES only. Nothing requested, purchased, configured or connected.</p>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        {Object.entries(requests)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <strong>{key}</strong>
              <ul className="list">
                {(value as string[]).map((item, index) => <li className="row" key={`${key}-${index}`}><span>{item}</span></li>)}
              </ul>
            </div>
          ))}
      </div>

      <div className="note">
        <strong>Module status:</strong> HR records, Finance records, Administration records, Office/Document
        file generation, PDF management, Document automation, agent roster, EMP-0001 proposal and the
        HR→Management→Production job chain are implemented and locally tested. Secure login, LIVE
        finance/payments, MS Office/Google Workspace connections, e-signature, legal/accountant review,
        AI models and production deployment remain MISSING / BLOCKED. See{" "}
        <code>GIMMS-DEPT01-IMPLEMENTATION-REPORT.md</code> and <code>dept01-verification.txt</code>.
      </div>
    </HubShell>
  );
}
