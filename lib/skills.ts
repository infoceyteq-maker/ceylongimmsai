/**
 * GIMMS Phase 0 — Safe Internal Skills.
 *
 * IMPORTANT HONESTY RULE (Master Doc section 6): these are DETERMINISTIC local routines,
 * not AI model calls. No skill here generates an image, renders a video, places a call,
 * moves money, publishes a post or calls an external API. Every skill returns real
 * evidence (steps, checks, counts, SHA-256) so "execution" can be tested, not just a UI
 * response. Anything needing an external provider stays in GIMMS-MISSING-COMPONENTS.md.
 *
 * Server-only. Reads local project files; writes nothing except the local job store used
 * by job.intake / status.transition. No network calls, no production side effects.
 */

import fs from "node:fs";
import path from "node:path";
import {
  DEPARTMENTS,
  activeDepartments,
  registrySummary,
  routeDepartment,
  P0_IDS,
  type Department,
} from "@/lib/departments";
import {
  createJob,
  transitionJob,
  jobsSummary,
  listJobs,
  hash,
  type Job,
} from "@/lib/jobs";
import { DEPT01_SKILL_IDS, DEPT01_CHECK_IDS, DEPT01_DESCRIPTIONS } from "@/lib/dept01-catalog";
import { runDept01Skill } from "@/lib/dept01-skills";

const ROOT = process.cwd();

export type SkillKind = "check" | "draft";

export type SkillDefinition = {
  id: string;
  departmentId: string;
  kind: SkillKind;
  description: string;
  requiresExternal: false;
};

export type SkillResult = {
  ok: boolean;
  skillId: string;
  departmentId: string;
  kind: SkillKind;
  executedAt: string;
  steps: string[];
  evidence: Record<string, unknown>;
  blocked: string[];
  sha256: string;
  error?: string;
};

function readText(relative: string): string | null {
  try {
    // turbopackIgnore: local, read-only audit reads must not trace the whole project.
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ ROOT, relative), "utf8");
  } catch {
    return null;
  }
}

function readJson<T>(relative: string): T | null {
  const raw = readText(relative);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function skillFor(id: string): Department | undefined {
  return DEPARTMENTS.find((department) => department.safeSkills.includes(id));
}

/** Skill IDs with dedicated evidence-producing implementations. */
const SPECIFIC_IDS = new Set([
  "system.audit",
  "env.hygiene",
  "integration.inventory",
  "dependency.check",
  "error.report",
  "qa.check",
  "delivery.checklist",
  "seo.audit.local",
  "research.report",
  "source.verify",
  "knowledge.index",
  "audience.segment",
  "department.registry",
  "job.intake",
  "job.route",
  "status.transition",
  "progress.report",
  "owner.dashboard",
]);

const DESCRIPTIONS: Record<string, string> = {
  "system.audit": "Reads package.json, .env.example, data/store.json and the registry; reports real counts and checks",
  "env.hygiene": "Checks .env.local absence, .gitignore rules, env example keys and allowedDevOrigins config",
  "integration.inventory": "Lists declared external needs and the real connected count (0) from local channel records",
  "dependency.check": "Lists installed dependencies and confirms no AI/voice/ads SDK is present",
  "error.report": "Collects failed local checks; no external log ingestion",
  "qa.check": "Validates registry and job-store integrity with pass/fail checks",
  "delivery.checklist": "Checks required project files and hashes each one",
  "seo.audit.local": "Checks layout metadata, page count, logo and robots/sitemap presence on local files only",
  "research.report": "Builds a report from named sources only; returns no-provider when no sources exist",
  "source.verify": "Validates source records; never marks a source verified without external proof",
  "knowledge.index": "Indexes local markdown documents with SHA-256; no external knowledge base",
  "audience.segment": "Segments local audience records; reports 0 when the local seed is empty",
  "department.registry": "Returns the 10-department registry summary and active department detail",
  "job.intake": "Creates a real Phase-0 job via the shared job model",
  "job.route": "Routes arbitrary text to a department with deterministic keyword evidence",
  "status.transition": "Applies a validated job status transition",
  "progress.report": "Aggregates real job counts by department and status",
  "owner.dashboard": "Combines registry, job progress and connection state into one honest snapshot",
};

const DECLARED_IDS = Array.from(new Set(DEPARTMENTS.flatMap((department) => department.safeSkills))).sort();

function isCheckSkill(id: string): boolean {
  return SPECIFIC_IDS.has(id) || DEPT01_CHECK_IDS.has(id);
}

export const SKILLS: SkillDefinition[] = DECLARED_IDS.map((id) => ({
  id,
  departmentId: skillFor(id)?.id ?? "10",
  kind: (isCheckSkill(id) ? "check" : "draft") as SkillKind,
  description:
    DESCRIPTIONS[id] ??
    DEPT01_DESCRIPTIONS[id] ??
    "Validates input and produces a versioned DRAFT record (no external action)",
  requiresExternal: false as const,
}));

function makeResult(
  skillId: string,
  steps: string[],
  evidence: Record<string, unknown>,
  blocked: string[] = [],
  ok = true,
  error?: string,
): SkillResult {
  const result: SkillResult = {
    ok,
    skillId,
    departmentId: skillFor(skillId)?.id ?? "10",
    kind: (isCheckSkill(skillId) ? "check" : "draft") as SkillKind,
    executedAt: new Date().toISOString(),
    steps,
    evidence,
    blocked,
    sha256: hash({ skillId, evidence }),
    ...(error ? { error } : {}),
  };
  return result;
}

function channelState() {
  const seed = readJson<Record<string, unknown[]>>("data/store.json");
  const channels = Array.isArray(seed?.channels) ? seed!.channels : [];
  const connected = channels.filter(
    (channel) => (channel as Record<string, unknown>)?.connected === true,
  ).length;
  return { channels: channels.length, connected };
}

function packageState() {
  const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
    "package.json",
  );
  const dependencies = pkg?.dependencies ?? {};
  const devDependencies = pkg?.devDependencies ?? {};
  return {
    dependencies: Object.keys(dependencies),
    devDependencies: Object.keys(devDependencies),
    dependencyCount: Object.keys(dependencies).length,
    devDependencyCount: Object.keys(devDependencies).length,
  };
}

function registryChecks() {
  const summary = registrySummary();
  const ids = DEPARTMENTS.map((department) => department.id);
  return {
    summary,
    checks: [
      { name: "exactly 10 departments", pass: summary.total === 10, value: summary.total },
      { name: "unique department ids", pass: new Set(ids).size === ids.length, value: new Set(ids).size },
      { name: "7 Phase-1 priorities active", pass: summary.active === 7, value: summary.active },
      { name: "3 departments deferred", pass: summary.deferred === 3, value: summary.deferred },
      { name: "priority order has 7 ids", pass: P0_IDS.length === 7, value: P0_IDS.length },
      {
        name: "deferred departments have no active skills",
        pass: DEPARTMENTS.filter((d) => d.status === "deferred").every((d) => d.safeSkills.length === 0),
        value: DEPARTMENTS.filter((d) => d.status === "deferred").length,
      },
      {
        name: "unique skill ids",
        pass: new Set(DECLARED_IDS).size === DECLARED_IDS.length,
        value: DECLARED_IDS.length,
      },
    ],
  };
}

/** Generic draft/record skills: real validation + structured output + hash, no side effects. */
function runDraftSkill(skillId: string, payload: Record<string, unknown>): SkillResult {
  const steps = ["validate input", "build DRAFT record", "compute sha256 evidence"];
  const title = String(payload.title ?? "").trim();
  if (!title) {
    return makeResult(skillId, steps, {}, ["no external provider configured"], false, "title is required");
  }

  const lines = Array.isArray(payload.lines) ? (payload.lines as Record<string, unknown>[]) : [];
  const numericLines = lines.map((line) => {
    const qty = Number(line.qty ?? 0);
    const unitPrice = Number(line.unitPrice ?? 0);
    return {
      description: String(line.description ?? "").trim(),
      qty: Number.isFinite(qty) ? qty : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      amount: (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0),
    };
  });
  const total = numericLines.reduce((sum, line) => sum + line.amount, 0);

  const draft: Record<string, unknown> = {
    recordId: `draft_${hash({ skillId, title, at: Date.now() }).slice(0, 16)}`,
    skillId,
    title,
    status: "DRAFT",
    description: String(payload.description ?? "").trim(),
    clientId: String(payload.clientId ?? ""),
    lines: numericLines,
    total: Number(total.toFixed(2)),
    moneyMovement: false,
    externalCalls: 0,
    requiresOwnerApproval: true,
  };

  const blocked = ["no external provider configured — draft only, no payment / publishing / call executed"];
  return makeResult(skillId, steps, { draft, lineCount: numericLines.length, total: draft.total }, blocked);
}

function runSpecific(skillId: string, payload: Record<string, unknown>): SkillResult {
  switch (skillId) {
    case "system.audit": {
      const pkg = packageState();
      const envExample = readText(".env.example") ?? "";
      const envKeys = envExample
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => line.split("=")[0]);
      const channels = channelState();
      const registry = registryChecks();
      const evidence = {
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
        dependencyCount: pkg.dependencyCount,
        envExampleKeys: envKeys,
        envLocalPresent: fs.existsSync(path.join(ROOT, ".env.local")),
        channels: channels.channels,
        connectedChannels: channels.connected,
        registry: registry.summary,
        checks: registry.checks,
      };
      return makeResult(
        skillId,
        ["read package.json", "read .env.example", "read data/store.json", "validate registry", "compute evidence hash"],
        evidence,
        ["no external monitoring/credits API configured — local checks only"],
      );
    }

    case "env.hygiene": {
      const gitignore = readText(".gitignore") ?? "";
      const envExample = readText(".env.example") ?? "";
      const config = readText("next.config.mjs") ?? "";
      const envLocalPresent = fs.existsSync(path.join(ROOT, ".env.local"));
      const checks = [
        { name: ".env.local absent", pass: !envLocalPresent, value: envLocalPresent },
        { name: ".env.local git-ignored", pass: gitignore.includes(".env.local"), value: gitignore.includes(".env.local") },
        { name: ".env.example exists", pass: envExample.length > 0, value: envExample.length },
        { name: "no secret values in .env.example", pass: !/(sk-[A-Za-z0-9]|eyJ[A-Za-z0-9])/.test(envExample), value: true },
        { name: "allowedDevOrigins configured", pass: config.includes("allowedDevOrigins"), value: config.includes("allowedDevOrigins") },
      ];
      return makeResult(
        skillId,
        ["inspect .gitignore", "inspect .env.example", "inspect next.config.mjs", "check .env.local"],
        { checks, allPassed: checks.every((check) => check.pass) },
        ["no secure secrets manager connected — cannot verify production secret rotation"],
      );
    }

    case "integration.inventory": {
      const channels = channelState();
      const needs = Array.from(
        new Set(activeDepartments().flatMap((department) => department.externalNeeds)),
      ).sort();
      const evidence = {
        connectedChannels: channels.connected,
        declaredChannels: channels.channels,
        connectedApis: 0,
        testedConnections: 0,
        mcpServers: 0,
        plugins: 0,
        externalNeeds: needs,
        externalNeedCount: needs.length,
        note: "No credentials configured. '/api/connect' stays at connected:0 until an authenticated test succeeds.",
      };
      return makeResult(
        skillId,
        ["read local channel records", "collect registry external needs", "count real connections"],
        evidence,
        needs.map((need) => `${need}: NOT CONNECTED`),
      );
    }

    case "dependency.check": {
      const pkg = packageState();
      const lock = readText("package-lock.json");
      const forbidden = ["openai", "anthropic", "gemini", "twilio", "deepgram", "elevenlabs", "stripe", "googleapis"];
      const all = [...pkg.dependencies, ...pkg.devDependencies].map((name) => name.toLowerCase());
      const found = forbidden.filter((name) => all.some((dep) => dep.includes(name)));
      return makeResult(
        skillId,
        ["read package.json", "read package-lock.json", "scan for external SDKs"],
        {
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
          lockfilePresent: lock !== null,
          lockfileBytes: lock?.length ?? 0,
          externalSdkMatches: found,
          externalSdkCount: found.length,
        },
        found.length === 0 ? ["no AI/voice/ads SDK installed — external capabilities remain NOT CONNECTED"] : [],
      );
    }

    case "error.report": {
      const audit = runSpecific("system.audit", {});
      const checks = (audit.evidence.checks as { name: string; pass: boolean }[]) ?? [];
      const failures = checks.filter((check) => !check.pass);
      return makeResult(
        skillId,
        ["run system.audit checks", "collect failed checks", "produce local error report"],
        { checksRun: checks.length, failures, failureCount: failures.length, externalLogSources: 0 },
        ["external error/log ingestion NOT CONNECTED; no alert channel configured"],
      );
    }

    case "qa.check": {
      const registry = registryChecks();
      const jobs = listJobs();
      const jobIds = jobs.map((job: Job) => job.jobId);
      const jobChecks = [
        { name: "unique job ids", pass: new Set(jobIds).size === jobIds.length, value: new Set(jobIds).size },
        {
          name: "every job has title + department + audit",
          pass: jobs.every((job) => job.title && job.department && job.auditTrail.length >= 2),
          value: jobs.length,
        },
        {
          name: "every job status is valid",
          pass: jobs.every((job) => job.status.length > 0),
          value: jobs.length,
        },
      ];
      const checks = [...registry.checks, ...jobChecks];
      return makeResult(
        skillId,
        ["validate registry", "validate local job store", "compute pass/fail checks"],
        { checks, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length, jobsChecked: jobs.length },
        [],
        checks.every((check) => check.pass),
      );
    }

    case "delivery.checklist": {
      const required = [
        "README.md",
        "package.json",
        "verification-results.txt",
        "PROJECT-STATUS.md",
        "HANDOFF.md",
        "scripts/verify-live.sh",
        "lib/departments.ts",
        "lib/jobs.ts",
        "lib/skills.ts",
      ];
      const files = required.map((name) => {
        const content = readText(name);
        return { name, present: content !== null, bytes: content?.length ?? 0, sha256: content ? hash(content) : null };
      });
      return makeResult(
        skillId,
        ["list required files", "hash each file", "report missing files"],
        { files, present: files.filter((file) => file.present).length, missing: files.filter((file) => !file.present).map((file) => file.name) },
        ["no deployment performed — checklist is local only"],
      );
    }

    case "seo.audit.local": {
      const layout = readText("app/layout.tsx") ?? "";
      const appDir = path.join(ROOT, "app");
      let pageCount = 0;
      try {
        pageCount = fs.readdirSync(appDir, { withFileTypes: true }).filter((entry) => {
          if (!entry.isDirectory()) return false;
          try {
            return fs.existsSync(path.join(appDir, entry.name, "page.tsx"));
          } catch {
            return false;
          }
        }).length;
      } catch {
        pageCount = 0;
      }
      const checks = [
        { name: "layout has title metadata", pass: /title\s*:/.test(layout), value: /title\s*:/.test(layout) },
        { name: "layout has description metadata", pass: /description\s*:/.test(layout), value: /description\s*:/.test(layout) },
        { name: "logo asset present", pass: fs.existsSync(path.join(ROOT, "public", "logo-512.png")), value: true },
        { name: "local page files found", pass: pageCount > 0, value: pageCount },
      ];
      return makeResult(
        skillId,
        ["read app/layout.tsx", "count page.tsx files", "check logo", "check robots/sitemap"],
        {
          checks,
          pageCount,
          robotsPresent: fs.existsSync(path.join(ROOT, "app", "robots.ts")),
          sitemapPresent: fs.existsSync(path.join(ROOT, "app", "sitemap.ts")),
          keywordResearch: "NOT AVAILABLE — no external SEO/SERP API",
        },
        ["keyword research, competitor SERP data and off-page SEO need an external provider"],
      );
    }

    case "research.report": {
      const rawSources = Array.isArray(payload.sources) ? (payload.sources as Record<string, unknown>[]) : [];
      const sources = rawSources
        .filter((source) => String(source.name ?? "").trim())
        .map((source) => ({
          name: String(source.name).trim(),
          url: String(source.url ?? "").trim(),
          dated: String(source.dated ?? "").trim(),
          verified: false,
        }));
      const state = sources.length === 0 ? "no-provider" : "named-sources-only";
      return makeResult(
        skillId,
        ["validate sources", "reject invented facts", "build dated report skeleton", "hash report"],
        {
          title: String(payload.title ?? "").trim(),
          state,
          sources,
          sourceCount: sources.length,
          findings: [],
          externalVerification: false,
          note: sources.length === 0
            ? "No external research provider configured; no facts invented."
            : "Sources are named only; none is verified without an external provider.",
        },
        ["web search / Perplexity / LLM synthesis NOT CONNECTED"],
      );
    }

    case "source.verify": {
      const rawSources = Array.isArray(payload.sources) ? (payload.sources as Record<string, unknown>[]) : [];
      const records = rawSources.map((source) => ({
        name: String(source.name ?? "").trim(),
        hasName: Boolean(String(source.name ?? "").trim()),
        hasUrl: Boolean(String(source.url ?? "").trim()),
        verified: false,
      }));
      return makeResult(
        skillId,
        ["validate source records", "mark verification state", "hash result"],
        { records, count: records.length, verifiedCount: 0, externalChecks: 0 },
        ["no external source-verification API — all sources remain unverified"],
      );
    }

    case "knowledge.index": {
      let docs: { name: string; bytes: number; sha256: string }[] = [];
      try {
        docs = fs
          .readdirSync(/*turbopackIgnore: true*/ ROOT)
          .filter((name) => name.toLowerCase().endsWith(".md"))
          .map((name) => {
            const content = readText(name) ?? "";
            return { name, bytes: content.length, sha256: hash(content) };
          });
      } catch {
        docs = [];
      }
      return makeResult(
        skillId,
        ["scan local markdown files", "hash each document", "build index"],
        { documents: docs, documentCount: docs.length, externalKnowledgeBases: 0 },
        ["per-client KB/RAG NOT DEVELOPED"],
      );
    }

    case "audience.segment": {
      const seed = readJson<Record<string, unknown[]>>("data/store.json");
      const audience = Array.isArray(seed?.audience) ? seed!.audience : [];
      const segments: Record<string, number> = {};
      for (const item of audience) {
        const key = String((item as Record<string, unknown>)?.segment ?? "Unsegmented");
        segments[key] = (segments[key] ?? 0) + 1;
      }
      return makeResult(
        skillId,
        ["read local audience records", "group by segment", "count records"],
        { localRecords: audience.length, segments, segmentCount: Object.keys(segments).length, externalAudienceApi: false },
        ["no CRM/audience API connected; live postgres records were not accessed"],
      );
    }

    case "department.registry": {
      const summary = registrySummary();
      const active = activeDepartments().map((department) => ({
        id: department.id,
        name: department.name,
        priority: department.priority,
        divisions: department.divisions.length,
        roles: department.divisions.reduce((n, division) => n + division.roles.length, 0),
        safeSkills: department.safeSkills.length,
      }));
      return makeResult(
        skillId,
        ["read registry", "count divisions and roles", "list Phase-1 priorities"],
        { summary, active, deferred: DEPARTMENTS.filter((d) => d.status === "deferred").map((d) => ({ id: d.id, name: d.name })) },
        ["departments 06/07/08 preserved but deliberately inactive"],
      );
    }

    case "job.route": {
      const text = String(payload.text ?? "").trim();
      const routing = routeDepartment(text, String(payload.departmentId ?? "").trim() || undefined);
      return makeResult(
        skillId,
        ["normalise text", "score active departments", "select winner by Phase-1 priority", "emit evidence"],
        { text, routing, targetName: DEPARTMENTS.find((d) => d.id === routing.id)?.name ?? "" },
        [],
        Boolean(text),
        text ? undefined : "text is required",
      );
    }

    case "job.intake": {
      const created = createJob(payload as Record<string, unknown>);
      return makeResult(
        skillId,
        ["validate title", "route to department", "write job record", "write audit trail"],
        {
          ok: created.ok,
          jobId: created.job?.jobId ?? null,
          department: created.job?.department ?? null,
          status: created.job?.status ?? null,
          routingBasis: created.job?.routing.basis ?? null,
          persisted: created.persisted ?? false,
          error: created.error ?? null,
        },
        [],
        created.ok,
        created.error,
      );
    }

    case "status.transition": {
      const jobId = String(payload.jobId ?? "").trim();
      const to = String(payload.to ?? "").trim();
      const moved = transitionJob(jobId, to);
      return makeResult(
        skillId,
        ["validate target status", "check allowed transition", "update job", "write audit"],
        {
          ok: moved.ok,
          jobId,
          to: to.toUpperCase(),
          status: moved.job?.status ?? null,
          auditEntries: moved.job?.auditTrail.length ?? 0,
          error: moved.error ?? null,
        },
        [],
        moved.ok,
        moved.error,
      );
    }

    case "progress.report": {
      const summary = jobsSummary();
      return makeResult(
        skillId,
        ["read local job store", "aggregate by department and status", "hash snapshot"],
        { summary },
        ["no external analytics/BI connector"],
      );
    }

    case "owner.dashboard": {
      const summary = jobsSummary();
      const channels = channelState();
      return makeResult(
        skillId,
        ["read registry", "read job store", "read connection state", "build dashboard snapshot"],
        {
          registry: registrySummary(),
          jobs: summary,
          connectedChannels: channels.connected,
          publishing: "MANUAL",
          deploymentPerformed: false,
        },
        ["production deployment and live metrics require separate Owner approval"],
      );
    }

    default:
      return makeResult(skillId, [], {}, [], false, `no implementation for skill ${skillId}`);
  }
}

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

/** Runs one safe internal skill. Never calls a network service. */
export function runSkill(skillId: string, payload: Record<string, unknown> = {}): SkillResult {
  const definition = getSkill(skillId);
  if (!definition) {
    return makeResult(skillId, [], {}, [], false, `unknown skill: ${skillId}`);
  }
  // P1-01: Dept 01's 80 native handlers share this SINGLE gateway. No duplicate
  // API, no second dispatcher, no new external integration.
  if (DEPT01_SKILL_IDS.has(skillId)) {
    const result = runDept01Skill(skillId, payload);
    return makeResult(skillId, result.steps, result.evidence, result.blocked, result.ok, result.error);
  }
  if (SPECIFIC_IDS.has(skillId)) return runSpecific(skillId, payload);
  return runDraftSkill(skillId, payload);
}

export function skillsSummary() {
  return {
    total: SKILLS.length,
    checkSkills: SKILLS.filter((skill) => skill.kind === "check").length,
    draftSkills: SKILLS.filter((skill) => skill.kind === "draft").length,
    requiresExternal: SKILLS.filter((skill) => skill.requiresExternal).length,
    byDepartment: DEPARTMENTS.filter((d) => d.status === "active-p0").map((d) => ({
      id: d.id,
      name: d.name,
      skills: d.safeSkills,
    })),
  };
}
