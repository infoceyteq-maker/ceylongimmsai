/**
 * GIMMS — THE ONLY PLACE IN THE CODEBASE THAT MAY SPAWN A PROCESS.
 *
 * BEFORE (Phase 1 audit finding):
 *   `spawnSync("git", ["status", "--porcelain"])` ran on every Owner chat command,
 *   and `lib/skills-tools.ts` ran `node -v`, `npm -v`, `git --version`, `gh --version`,
 *   `python3 -V`, `npx tsc --version`, `unzip -v` on every GET /api/skills-tools.
 *   Two real problems:
 *     a) `npx tsc --version` can DOWNLOAD and EXECUTE a package from the npm registry
 *        if it is not already installed — remote code execution triggered by an
 *        unauthenticated GET.
 *     b) Child processes are unavailable/blocked in many serverless runtimes, so the
 *        check was also simply unreliable in production.
 *
 * AFTER:
 *   - One allowlist. Only `git --version` and `node --version` may run.
 *   - `shell: false` (the default) so no shell metacharacters are interpreted.
 *   - Hard timeout, stdin ignored, output truncated.
 *   - Auto-disabled when `GIMMS_DISABLE_CHILD_PROCESS=1`, when running on Vercel, or
 *     when running on the Edge runtime.
 *   - `npx`, `npm`, `gh`, `python3`, `unzip` are NOT allowlisted. Version detection
 *     for them is reported as `BLOCKED_BY_POLICY` instead of being executed.
 *
 * Server-only. Node runtime only.
 */

import { spawnSync } from "node:child_process";

const ALLOWED: ReadonlyArray<{ command: string; args: readonly string[] }> = [
  { command: "git", args: ["--version"] },
  { command: "node", args: ["--version"] },
];

const TIMEOUT_MS = 4000;
const MAX_OUTPUT = 200;

export type ExecResult =
  | { executed: true; ok: boolean; exitStatus: number | null; output: string }
  | { executed: false; ok: false; reason: string };

function disabledReason(): string | null {
  if (process.env.GIMMS_DISABLE_CHILD_PROCESS === "1") return "child processes disabled by GIMMS_DISABLE_CHILD_PROCESS";
  if (process.env.VERCEL) return "child processes are not available on the Vercel serverless runtime";
  if (process.env.NEXT_RUNTIME === "edge") return "child processes are not available on the Edge runtime";
  return null;
}

export function isAllowedCommand(command: string, args: readonly string[] = []): boolean {
  return ALLOWED.some(
    (entry) => entry.command === command && entry.args.length === args.length && entry.args.every((arg, index) => arg === args[index]),
  );
}

/**
 * Run an allowlisted version probe. Everything else is refused without executing.
 */
export function runAllowedProbe(command: string, args: readonly string[] = []): ExecResult {
  const disabled = disabledReason();
  if (disabled) return { executed: false, ok: false, reason: disabled };

  if (!isAllowedCommand(command, args)) {
    return {
      executed: false,
      ok: false,
      reason: `BLOCKED_BY_POLICY: "${command} ${args.join(" ")}" is not on the exec allowlist. Only ${ALLOWED.map((entry) => `${entry.command} ${entry.args.join(" ")}`).join(", ")} may run.`,
    };
  }

  try {
    const result = spawnSync(command, args as string[], {
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      // Minimal env: PATH only, so an inherited secret cannot leak into a child.
      env: { PATH: process.env.PATH ?? "", LANG: "C", NODE_ENV: process.env.NODE_ENV ?? "production" },
    });
    if (result.error) {
      return { executed: false, ok: false, reason: `spawn error: ${result.error.message}` };
    }
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim().split("\n")[0]?.trim().slice(0, MAX_OUTPUT) ?? "";
    return { executed: true, ok: result.status === 0, exitStatus: result.status, output };
  } catch (cause) {
    return { executed: false, ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

/**
 * True when a working tree exists. Used by the Owner chat engine to decide whether a
 * real `git status` is even meaningful, instead of firing a subprocess blindly.
 */
export function hasGitWorkTree(): boolean {
  return disabledReason() === null;
}

export const EXEC_POLICY = {
  allowlist: ALLOWED.map((entry) => `${entry.command} ${entry.args.join(" ")}`),
  timeoutMs: TIMEOUT_MS,
  shell: false,
  note: "No npm/npx/gh/python3/unzip execution. npx in particular could fetch and run a remote package.",
} as const;
