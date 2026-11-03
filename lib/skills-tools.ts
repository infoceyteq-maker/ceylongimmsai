/**
 * GIMMS — CENTRALIZED SKILLS & TOOLS REGISTRY (Step 5).
 *
 * Aggregates, without duplicating:
 *  - the 114 EXISTING verified local skills behind POST /api/skills (lib/skills.ts),
 *  - the 29 development-skill SPECIFICATIONS from PR #7 (lib/prod-ai-team.ts),
 *  - real locally detected development tools (Node built-ins only),
 *  - the 8 essential skill groups requested by the Owner, mapped to REAL
 *    executable handlers or honestly marked SPEC_ONLY.
 *
 * NO handler here generates a product or starts a software development project.
 * NO AI SDK is installed, NO external tool is called, NO tool is invented.
 */

import { runAllowedProbe, isAllowedCommand, EXEC_POLICY } from "@/lib/exec-guard";
import fs from "node:fs";
import path from "node:path";
import { SKILLS, skillsSummary } from "@/lib/skills";
import { REQUIRED_DEVELOPMENT_SKILLS, EXISTING_REUSABLE_SKILLS } from "@/lib/prod-ai-team";
import { CONNECTION_REGISTRY, connectionsSummary } from "@/lib/connections-registry";

export type LocalTool = {
  id: string;
  command: string;
  available: boolean;
  version: string;
  verifiedAt: string;
  note: string;
};

/**
 * Version probe through the single exec guard. A command that is not allowlisted is
 * reported as BLOCKED_BY_POLICY and is NEVER executed — this closes the previous
 * `npx tsc --version` path, which could download and run a package off the registry.
 */
function detect(id: string, command: string, args: string[], note: string): LocalTool {
  const rendered = `${command} ${args.join(" ")}`.trim();
  if (!isAllowedCommand(command, args)) {
    return {
      id,
      command: rendered,
      available: false,
      version: "BLOCKED_BY_POLICY",
      verifiedAt: new Date().toISOString(),
      note: `${note} — not executed: only ${EXEC_POLICY.allowlist.join(", ")} are allowlisted.`,
    };
  }
  const result = runAllowedProbe(command, args);
  return {
    id,
    command: rendered,
    available: result.executed && result.ok,
    version: result.executed ? result.output : `BLOCKED: ${result.reason}`,
    verifiedAt: new Date().toISOString(),
    note,
  };
}

export function detectLocalTools(): LocalTool[] {
  return [
    detect("node", "node", ["-v"], "Runtime used by the local chat engine"),
    detect("npm", "npm", ["-v"], "Existing package manager; NO new package installed in this task"),
    detect("git", "git", ["--version"], "Real repository status checks in chat execution"),
    detect("gh", "gh", ["--version"], "Existing authorized GitHub CLI (repository ops only)"),
    detect("python3", "python3", ["-V"], "Used for local ZIP/XML byte validation"),
    detect("tsc", "npx", ["tsc", "--version"], "Existing local TypeScript typecheck"),
    detect("unzip", "unzip", ["-v"], "Used for OOXML structure validation"),
  ];
}

export type EssentialSkillGroup = {
  id: string;
  name: string;
  status: "EXECUTABLE_LOCAL" | "PARTIAL_LOCAL" | "FRAMEWORK_ONLY";
  readySkills: string[];
  specOnlySkills: number;
  realExecutionInChat: string[];
  aiModelUsed: false;
  externalNeeded: string[];
  note: string;
};

export const ESSENTIAL_SKILL_GROUPS: EssentialSkillGroup[] = [
  {
    id: "coding-software-development",
    name: "Coding and Software Development",
    status: "PARTIAL_LOCAL",
    readySkills: ["code.scaffold", "design.brief"],
    specOnlySkills: 5,
    realExecutionInChat: ["command.parse", "registry.snapshot"],
    aiModelUsed: false,
    externalNeeded: ["OpenAI GPT API access", "Owner-approved software development project"],
    note: "Existing `code.scaffold` is a DRAFT routine, NOT a code generator. NO code or product was generated. AI coding requires a connected model + separate project approval.",
  },
  {
    id: "code-review-debugging",
    name: "Code Review and Debugging",
    status: "PARTIAL_LOCAL",
    readySkills: ["qa.check", "dependency.check", "error.report", "system.audit"],
    specOnlySkills: 4,
    realExecutionInChat: ["registry.integrity", "dependency.audit", "env.hygiene", "git.status"],
    aiModelUsed: false,
    externalNeeded: ["OpenAI GPT / Gemini API access for AI-assisted review"],
    note: "Real local deterministic checks run; no AI code review exists.",
  },
  {
    id: "github-repository-management",
    name: "GitHub and Repository Management",
    status: "PARTIAL_LOCAL",
    readySkills: ["system.audit", "env.hygiene"],
    specOnlySkills: 2,
    realExecutionInChat: ["git.status"],
    aiModelUsed: false,
    externalNeeded: ["New GitHub App/OAuth integration with Owner approval"],
    note: "`git status --porcelain` is executed for real. NO new GitHub integration, no push/deploy/PR from the chat.",
  },
  {
    id: "file-document-processing",
    name: "File and Document Processing",
    status: "EXECUTABLE_LOCAL",
    readySkills: ["delivery.checklist", "qa.check", "knowledge.index", "doc.file.organize", "office.word.create", "office.excel.create"],
    specOnlySkills: 4,
    realExecutionInChat: ["file.sha256"],
    aiModelUsed: false,
    externalNeeded: ["Microsoft 365 / Google Workspace for interoperability (not connected)"],
    note: "Real OOXML/PDF generation exists in Dept 01 (PR #6); chat execution computes a real SHA-256 of package.json.",
  },
  {
    id: "api-integration",
    name: "API Integration",
    status: "FRAMEWORK_ONLY",
    readySkills: ["integration.inventory", "dependency.check"],
    specOnlySkills: 4,
    realExecutionInChat: ["connection.readiness"],
    aiModelUsed: false,
    externalNeeded: ["Provider accounts, credentials, SDK/HTTP adapters, authenticated tests"],
    note: "Connection framework from PR #7 is configured; 0 adapters implemented, 0 connections registered.",
  },
  {
    id: "local-testing",
    name: "Local Testing",
    status: "EXECUTABLE_LOCAL",
    readySkills: ["qa.check", "delivery.checklist", "dependency.check"],
    specOnlySkills: 3,
    realExecutionInChat: ["test.assertions", "result.hash.verify"],
    aiModelUsed: false,
    externalNeeded: [],
    note: "Chat engine runs real pass/fail assertions and recomputes the evidence hash.",
  },
  {
    id: "workflow-automation",
    name: "Workflow Automation",
    status: "EXECUTABLE_LOCAL",
    readySkills: ["status.transition", "job.route", "progress.report"],
    specOnlySkills: 2,
    realExecutionInChat: ["job.transition.NEW→REVIEW", "job.transition.REVIEW→ASSIGN", "job.transition.ASSIGN→IN_PROGRESS", "job.transition.IN_PROGRESS→QUALITY_CHECK", "job.transition.QUALITY_CHECK→APPROVAL"],
    aiModelUsed: false,
    externalNeeded: [],
    note: "Real 13-state job machine transitions with audit trail; illegal transitions are rejected.",
  },
  {
    id: "task-management",
    name: "Task Management",
    status: "EXECUTABLE_LOCAL",
    readySkills: ["job.intake", "job.route", "status.transition", "progress.report", "owner.dashboard"],
    specOnlySkills: 2,
    realExecutionInChat: ["job.create", "job.persist", "owner.review"],
    aiModelUsed: false,
    externalNeeded: [],
    note: "Real local jobs created, tracked and reviewed through the existing universal job model.",
  },
];

export function skillsToolsRegistry() {
  const localTools = detectLocalTools();
  const summary = skillsSummary();
  const packagePath = path.join(process.cwd(), "package.json");
  let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as typeof packageJson;
  } catch {
    /* empty */
  }
  const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  const aiSdkNames = Object.keys(deps).filter((name) => /openai|anthropic|gemini|genai|langchain|mcp|vercel\/ai|llamaindex/i.test(name));
  return {
    ok: true,
    version: "1.0-centralized",
    status: "LOCAL DETERMINISTIC — no AI SDK, no external tool connection",
    gateway: "POST /api/skills (existing single gateway; unchanged)",
    existingSkills: {
      total: SKILLS.length,
      checkSkills: summary.checkSkills,
      draftSkills: summary.draftSkills,
      requiresExternal: summary.requiresExternal,
      skills: SKILLS.map((skill) => ({ id: skill.id, departmentId: skill.departmentId, kind: skill.kind, description: skill.description })),
    },
    developmentSkillSpecifications: {
      total: REQUIRED_DEVELOPMENT_SKILLS.length,
      implemented: 0,
      categories: Array.from(new Set(REQUIRED_DEVELOPMENT_SKILLS.map((skill) => skill.category))),
      specs: REQUIRED_DEVELOPMENT_SKILLS.map((skill) => ({ id: skill.id, name: skill.name, category: skill.category, architecture: skill.recommendedArchitecture, status: skill.implementationStatus, priority: skill.priority })),
    },
    essentialSkillGroups: ESSENTIAL_SKILL_GROUPS,
    existingReusableSkills: EXISTING_REUSABLE_SKILLS,
    localTools,
    connections: CONNECTION_REGISTRY,
    connectionsSummary: connectionsSummary(),
    dependencyCheck: {
      dependencies: Object.keys(packageJson.dependencies ?? {}).length,
      devDependencies: Object.keys(packageJson.devDependencies ?? {}).length,
      aiSdkInstalled: aiSdkNames,
      newPackagesInstalled: 0,
      localSecretFilePresent: fs.existsSync(path.join(process.cwd(), ".env.local")),
    },
    summary: {
      executableLocalSkills: SKILLS.length,
      specOnlyDevelopmentSkills: REQUIRED_DEVELOPMENT_SKILLS.length,
      essentialGroups: ESSENTIAL_SKILL_GROUPS.length,
      executableLocalGroups: ESSENTIAL_SKILL_GROUPS.filter((group) => group.status === "EXECUTABLE_LOCAL").length,
      partialGroups: ESSENTIAL_SKILL_GROUPS.filter((group) => group.status === "PARTIAL_LOCAL").length,
      frameworkOnlyGroups: ESSENTIAL_SKILL_GROUPS.filter((group) => group.status === "FRAMEWORK_ONLY").length,
      localToolsAvailable: localTools.filter((tool) => tool.available).length,
      aiModelsConnected: 0,
      aiSdksInstalled: aiSdkNames.length,
      productsGenerated: 0,
    },
  };
}
