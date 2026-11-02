import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI GIMMS — Empowering Digital Evolution",
  description:
    "The AI GIMMS Hub: tasks, approvals, agents, research, production and a manual publishing outbox. Empowering Digital Evolution.",
  icons: { icon: "/logo-512.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
