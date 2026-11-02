"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import HubShell from "@/components/HubShell";

type DepartmentRow = {
  id: string;
  name: string;
  priority: number | null;
  status: string;
  divisions: number;
  roles: number;
  safeSkills: string[];
  externalNeeds: string[];
  externalNeedsConnected: number;
};

type DeptResponse = {
  ok: boolean;
  summary?: { total: number; active: number; deferred: number; divisions: number; roles: number };
  departments?: DepartmentRow[];
};

type JobRow = {
  jobId: string;
  title: string;
  department: string;
  departmentName: string;
  status: string;
  jobRole: string;
  routing?: { basis: string; matchedKeywords: string[] };
};

type SkillRow = { id: string; departmentId: string; kind: string; description: string };

export default function Page() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [summary, setSummary] = useState<DeptResponse["summary"]>(undefined);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [skillId, setSkillId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [deptRes, jobRes, skillRes] = await Promise.all([
        fetch("/api/departments", { cache: "no-store" }),
        fetch("/api/jobs", { cache: "no-store" }),
        fetch("/api/skills", { cache: "no-store" }),
      ]);
      if (deptRes.ok) {
        const data = (await deptRes.json()) as DeptResponse;
        setDepartments(data.departments ?? []);
        setSummary(data.summary);
      }
      if (jobRes.ok) {
        const data = (await jobRes.json()) as { jobs?: JobRow[] };
        setJobs(data.jobs ?? []);
      }
      if (skillRes.ok) {
        const data = (await skillRes.json()) as { skills?: SkillRow[] };
        setSkills(data.skills ?? []);
        setSkillId((current) => current || (data.skills?.[0]?.id ?? ""));
      }
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createJob(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", title, departmentId: departmentId || undefined }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        job?: JobRow;
        persisted?: boolean;
      };
      setMessage(
        data.ok
          ? `Job ${data.job?.jobId} → Department ${data.job?.department} (${data.job?.departmentName}), routed ${data.job?.routing?.basis}, persisted ${String(data.persisted)}`
          : `Error: ${data.error ?? "unknown"}`,
      );
      setTitle("");
      await refresh();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSkill(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId, payload: { title: `Phase 0 check ${new Date().toISOString()}` } }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        skillId?: string;
        sha256?: string;
        steps?: string[];
        error?: string;
      };
      setMessage(
        data.ok
          ? `Skill ${data.skillId} executed ${data.steps?.length ?? 0} steps · evidence sha256 ${String(data.sha256).slice(0, 16)}…`
          : `Error: ${data.error ?? "unknown"}`,
      );
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HubShell>
      <div className="hero">
        <div>
          <h2>Departments · Phase 0</h2>
          <p>
            Ten-department architecture preserved. Seven Phase-1 priorities are registered;
            three stay deferred. Registry, job model, routing and safe internal skills are
            deterministic local code — no external AI, voice, ads or payment API is connected.
          </p>
        </div>
        <span className="badge">Credential-free · no deploy</span>
      </div>

      <div className="grid stats">
        <div className="card stat">
          <div className="label">Departments</div>
          <div className="value">{summary?.total ?? "—"}</div>
          <div className="sub">full architecture</div>
        </div>
        <div className="card stat">
          <div className="label">Phase-1 active</div>
          <div className="value">{summary?.active ?? "—"}</div>
          <div className="sub">{summary?.deferred ?? "—"} deferred</div>
        </div>
        <div className="card stat">
          <div className="label">Divisions / roles</div>
          <div className="value">{summary?.divisions ?? "—"}</div>
          <div className="sub">{summary?.roles ?? "—"} named roles</div>
        </div>
        <div className="card stat">
          <div className="label">Connected APIs</div>
          <div className="value">0</div>
          <div className="sub">no credentials configured</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Registry</h2>
        <p>Status, not functionality: a department is not working just because it is listed.</p>
      </div>
      <div className="card" style={{ marginBottom: 20, overflowX: "auto" }}>
        <ul className="list">
          {departments.map((department) => (
            <li className="row" key={department.id}>
              <strong>
                {department.id} · {department.name}
              </strong>
              <span>
                <span className={department.status === "active-p0" ? "pill" : "pill pill-off"}>
                  {department.status === "active-p0" ? `P${department.priority} active` : "deferred"}
                </span>{" "}
                {department.divisions} divisions · {department.roles} roles · {department.safeSkills.length} local skills
                {" · "}
                {department.externalNeedsConnected}/{department.externalNeeds.length} external needs connected
              </span>
            </li>
          ))}
          {departments.length === 0 ? <li className="row"><span>Loading registry…</span></li> : null}
        </ul>
      </div>

      <div className="section-head">
        <h2>Job intake &amp; routing</h2>
        <p>Creates a real Phase-0 job record with a full audit trail. Leave department on Auto to test keyword routing.</p>
      </div>
      <form className="form" onSubmit={createJob}>
        <input
          aria-label="New job title"
          placeholder="e.g. Research report on market trends"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <select aria-label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="">Auto (keyword routing)</option>
          {departments
            .filter((department) => department.status === "active-p0")
            .map((department) => (
              <option key={department.id} value={department.id}>
                {department.id} · {department.name}
              </option>
            ))}
        </select>
        <button className="btn" type="submit" disabled={busy || !title.trim()}>
          Create job
        </button>
        {message ? <span className="msg">{message}</span> : null}
      </form>

      <div className="section-head">
        <h2>Safe internal skills</h2>
        <p>Each run produces step and SHA-256 evidence. None calls an external service.</p>
      </div>
      <form className="form" onSubmit={runSkill}>
        <select aria-label="Skill" value={skillId} onChange={(event) => setSkillId(event.target.value)}>
          {skills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.departmentId} · {skill.id} ({skill.kind})
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={busy || !skillId}>
          Run skill
        </button>
      </form>

      <div className="section-head">
        <h2>Recent jobs</h2>
        <p>Stored locally in data/gimms-jobs.json. The live hub_state database is untouched.</p>
      </div>
      <div className="card">
        <ul className="list">
          {jobs.slice(0, 12).map((job) => (
            <li className="row" key={job.jobId}>
              <strong>{job.title}</strong>
              <span>
                {job.department} · {job.status} · {job.jobRole} · routed {job.routing?.basis ?? "—"}
              </span>
            </li>
          ))}
          {jobs.length === 0 ? <li className="row"><span>No Phase-0 jobs yet.</span></li> : null}
        </ul>
      </div>

      <p className="note">
        Phase 0 is credential-free by design. Publishing stays MANUAL, /connections stays at 0
        connected, and no deployment, purchase, key or production change was made. External
        skills and APIs are listed separately in GIMMS-MISSING-COMPONENTS.md.
      </p>
    </HubShell>
  );
}
