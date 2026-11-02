"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import Scene3D from "@/components/Scene3D";

type HubData = {
  ok?: boolean;
  provider?: string;
  storage?: string;
  brand?: string;
  tagline?: string;
  owner?: string;
  publishing?: string;
  connected?: number;
  counts?: { tasks?: number; agents?: number; clients?: number };
  state?: Record<string, any[]>;
};

function useHub() {
  const [data, setData] = useState<HubData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error(`bootstrap returned ${response.status}`);
      setData((await response.json()) as HubData);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, refresh };
}

function Items({ items, fields }: { items: any[]; fields: string[] }) {
  if (!items || items.length === 0) {
    return <p className="muted">No records yet.</p>;
  }
  return (
    <ul className="list">
      {items.map((item, index) => (
        <li className="row" key={String(item?.id ?? index)}>
          <strong>
            {String(item?.title ?? item?.name ?? item?.id ?? `Record ${index + 1}`)}
          </strong>
          <span>
            {fields
              .map((field) => item?.[field])
              .filter((value) => value !== undefined && value !== null && value !== "")
              .map(String)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TaskCreator({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const result = (await response.json()) as Record<string, any>;
      if (!response.ok) throw new Error(String(result.error || `HTTP ${response.status}`));
      setTitle("");
      setMessage(
        `Created · storage ${result.storage ?? "unknown"}${result.persisted ? " · saved" : " · not persisted"}`,
      );
      onCreated();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="New task title"
        aria-label="New task title"
        maxLength={180}
      />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Create task"}
      </button>
      {message ? <span className="msg">{message}</span> : null}
    </form>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function HomeOverview() {
  const { data, error, refresh } = useHub();
  const counts = data?.counts ?? {};

  return (
    <>
      <section className="hero">
        <div>
          <h2>AI GIMMS Hub</h2>
          <p>
            One place for tasks, approvals, agents, research and production. Publishing stays
            manual: build the package, put it in the outbox, a human posts it, then paste the link.
          </p>
        </div>
        <span className="badge">Live 3D · no external CDN</span>
      </section>

      <Scene3D />

      <div className="grid stats">
        <Stat label="Tasks" value={String(counts.tasks ?? "—")} />
        <Stat label="Agents" value={String(counts.agents ?? "—")} />
        <Stat label="Clients" value={String(counts.clients ?? "—")} />
        <Stat label="Connected" value={String(data?.connected ?? "—")} sub="No API keys configured" />
        <Stat label="Storage" value={data?.storage ?? "…"} sub={`provider: ${data?.provider ?? "…"}`} />
        <Stat label="Publishing" value={data?.publishing ?? "MANUAL"} sub="package → outbox → human → link" />
      </div>

      <TaskCreator onCreated={refresh} />

      {error ? <p className="note">bootstrap error: {error}</p> : null}
      <p className="note">
        Approvals are versioned and owner-only. No channel is shown as connected without a real
        credential. Google Flow / Veo has no public API and is not connected.
      </p>
    </>
  );
}

type SectionConfig = {
  title: string;
  subtitle: string;
  key: string;
  fields: string[];
};

const SECTIONS: Record<string, SectionConfig> = {
  "/tasks": {
    title: "Tasks",
    subtitle: "Proposed and approved work. Every record comes from the live hub_state row.",
    key: "tasks",
    fields: ["status", "department", "due", "description"],
  },
  "/approvals": {
    title: "Approvals",
    subtitle: "Versioned approvals. The owner approves the exact artifact, recipient and scope.",
    key: "tasks",
    fields: ["status", "department", "clientId"],
  },
  "/clients": {
    title: "Clients",
    subtitle: "Client workspaces stay separate. No client data crosses into another workspace.",
    key: "clients",
    fields: ["status", "contact", "note"],
  },
  "/agents": {
    title: "Agents",
    subtitle: "Department agents. They draft and propose; they never publish or claim work is done.",
    key: "agents",
    fields: ["department", "persona"],
  },
  "/status": {
    title: "Status",
    subtitle: "Which storage driver actually ran, and what is genuinely connected.",
    key: "audit",
    fields: ["action", "at"],
  },
  "/research": {
    title: "Research",
    subtitle: "Named sources only. Nothing unverified is presented as fact.",
    key: "research",
    fields: ["status", "source", "note"],
  },
  "/publishing": {
    title: "Publishing",
    subtitle: "MANUAL by design. No auto-posting, no scheduled sends.",
    key: "publishes",
    fields: ["status", "channel", "note"],
  },
  "/audience": {
    title: "Audience",
    subtitle: "Audience records and segments. No invented handles or metrics.",
    key: "audience",
    fields: ["segment", "note"],
  },
  "/connections": {
    title: "Connections",
    subtitle: "A real API key is required before any channel can be marked connected.",
    key: "channels",
    fields: ["note"],
  },
  "/callcenter": {
    title: "Call centre",
    subtitle: "Call log. Nothing is marked as sent without evidence.",
    key: "calls",
    fields: ["status", "at", "note"],
  },
  "/memory": {
    title: "Memory",
    subtitle: "Audit trail of hub actions.",
    key: "audit",
    fields: ["action", "at", "detail"],
  },
  "/production": {
    title: "Production",
    subtitle: "Creative outputs and packages, ready for the manual outbox.",
    key: "outputs",
    fields: ["status", "type", "note"],
  },
};

export function SectionPanel() {
  const pathname = usePathname() || "/";
  const { data, error, refresh } = useHub();
  const config: SectionConfig = SECTIONS[pathname] ?? {
    title: "Hub",
    subtitle: "Section overview.",
    key: "tasks",
    fields: ["status"],
  };
  const items = data?.state?.[config.key] ?? [];

  return (
    <>
      <section className="section-head">
        <h2>{config.title}</h2>
        <p>{config.subtitle}</p>
      </section>

      {pathname === "/tasks" ? <TaskCreator onCreated={refresh} /> : null}

      {pathname === "/connections" ? (
        <>
          <div className="grid stats">
            <Stat label="Connected channels" value={String(data?.connected ?? "—")} sub="Real keys required" />
            <Stat label="Available channels" value={String(items.length)} sub="All unconnected" />
            <Stat label="Google Flow / Veo" value="Not connected" sub="No public API" />
          </div>
          <div className="card">
            <ul className="list">
              {items.map((channel, index) => (
                <li className="row" key={String(channel?.id ?? index)}>
                  <strong>{String(channel?.name ?? channel?.id ?? "Channel")}</strong>
                  <span>
                    <span className="pill pill-off">
                      {channel?.connected === true ? "Connected" : "Not connected"}
                    </span>{" "}
                    {String(channel?.note ?? "")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="note">
            No social handles are claimed. A channel only becomes connected after a real credential
            exists and is verified.
          </p>
        </>
      ) : null}

      {pathname === "/publishing" ? (
        <>
          <div className="steps">
            <div className="card step"><b>1 · Package</b>Assemble the approved artifact.</div>
            <div className="card step"><b>2 · Outbox</b>Place it in the manual outbox.</div>
            <div className="card step"><b>3 · Human posts</b>A person publishes it by hand.</div>
            <div className="card step"><b>4 · Link</b>Paste the live link back as evidence.</div>
          </div>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Publishing mode: MANUAL. No automated posting or scheduled send is enabled.
            </p>
            <Items items={items} fields={config.fields} />
          </div>
        </>
      ) : null}

      {pathname === "/status" ? (
        <div className="grid stats">
          <Stat label="Storage driver" value={data?.storage ?? "…"} sub="postgres / file / memory" />
          <Stat label="Provider" value={data?.provider ?? "…"} />
          <Stat label="Tasks" value={String(data?.counts?.tasks ?? "—")} />
          <Stat label="Agents" value={String(data?.counts?.agents ?? "—")} />
          <Stat label="Clients" value={String(data?.counts?.clients ?? "—")} />
          <Stat label="Connected" value={String(data?.connected ?? "—")} />
          <Stat label="Publishing" value={data?.publishing ?? "MANUAL"} />
          <Stat label="Owner" value={data?.owner ?? "info.ceyteq@gmail.com"} />
        </div>
      ) : null}

      {!["/connections", "/publishing", "/status"].includes(pathname) ? (
        <div className="card">
          <Items
            items={pathname === "/approvals" ? items.filter((item) => item?.status === "Review") : items}
            fields={config.fields}
          />
        </div>
      ) : null}

      {error ? <p className="note">bootstrap error: {error}</p> : null}
    </>
  );
}
