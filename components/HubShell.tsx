"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/tasks", label: "Tasks" },
  { href: "/approvals", label: "Approvals" },
  { href: "/clients", label: "Clients" },
  { href: "/agents", label: "Agents" },
  { href: "/status", label: "Status" },
  { href: "/research", label: "Research" },
  { href: "/publishing", label: "Publishing" },
  { href: "/audience", label: "Audience" },
  { href: "/connections", label: "Connections" },
  { href: "/callcenter", label: "Call centre" },
  { href: "/memory", label: "Memory" },
  { href: "/production", label: "Production" },
];

export default function HubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          {/* Plain img: the supplied brand asset is served exactly as-is. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-512.png" alt="AI GIMMS" width={46} height={46} />
          <div>
            <h1>AI GIMMS</h1>
            <div className="tagline">Empowering Digital Evolution</div>
          </div>
        </div>
        <div className="meta">
          Owner: info.ceyteq@gmail.com
          <br />
          Publishing: MANUAL · Connections: 0 connected
        </div>
      </header>

      <nav className="nav" aria-label="Hub sections">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main>{children}</main>

      <footer className="footer">
        <span>AI GIMMS · Empowering Digital Evolution</span>
        <span>
          Contact: <a href="mailto:info.ceyteq@gmail.com">info.ceyteq@gmail.com</a>
        </span>
        <span>Brand mark: placeholder wordmark — original logo-512.png pending</span>
      </footer>
    </div>
  );
}
