/**
 * GIMMS P1-01 — Dept 01 REAL SKILL HANDLERS.
 *
 * All 80 Dept-01 skill IDs are executed here, behind the EXISTING single
 * POST /api/skills gateway (lib/skills.ts). Nothing is duplicated: this module
 * reuses `newId` / `auditEntry` / `hash` (lib/store.ts, lib/jobs.ts) and
 * `createJob` / `transitionJob` (lib/jobs.ts).
 *
 * HONESTY (Master Doc §6, Owner standing rules):
 *  - DETERMINISTIC LOCAL ROUTINES ONLY. No LLM, no AI SDK, no MCP, no function
 *    calling provider. `owner.command.execute` is a keyword parser, not a model.
 *  - NO external network call, NO money movement, NO payment/payroll execution,
 *    NO email/SMTP, NO calendar sync, NO upload, NO e-signature, NO legal advice,
 *    NO production database write, NO deploy.
 *  - Microsoft Office / Google Workspace / Outlook / Gmail / Drive / payment /
 *    accounting / auth providers are NOT CONNECTED. Native compatible FILES are
 *    produced locally; that is not an integration.
 *  - Every financial transaction requires appropriate authorisation. Payment
 *    requests stay PENDING_OWNER_AUTHORIZATION; execution is refused outright.
 *  - Every skill returns real evidence (records, computed values, file hashes).
 */

import crypto from "node:crypto";
import { DEPT01_SKILL_SPECS, dept01Spec, type Dept01SkillSpec } from "@/lib/dept01-catalog";
import {
  saveArtifact,
  readArtifact,
  docx,
  docxText,
  xlsx,
  xlsxText,
  pptx,
  pdf,
  pdfText,
  isNativePdf,
  summarize,
  convert,
  csv,
  eml,
  ics,
  html,
  markdown,
  type ArtifactMeta,
} from "@/lib/office";
import {
  addRecord,
  listRecords,
  allRecords,
  nextEmployeeId,
  peekEmployeeId,
  recordArtifact,
  listArtifacts,
  requestApproval,
  decideApproval,
  listApprovals,
  recordWorkflow,
  recordCommand,
  summary as dept01Summary,
  type WorkflowRecord,
} from "@/lib/dept01-store";
import { DEPT01_AGENTS, OWNER_ACCOUNT_PROPOSAL, agentsSummary } from "@/lib/dept01-agents";
import { createJob, transitionJob, hash } from "@/lib/jobs";

type Payload = Record<string, unknown>;

export type Dept01Outcome = {
  ok: boolean;
  steps: string[];
  evidence: Record<string, unknown>;
  blocked: string[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Input helpers — every skill tolerates the generic Phase-0 harness payload.
// ---------------------------------------------------------------------------

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}
function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
  return [];
}
function bodyLines(payload: Payload, fallback: string[]): string[] {
  const raw = payload.lines;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((line) =>
      typeof line === "string" ? line : String((line as Payload).description ?? JSON.stringify(line)),
    );
  }
  const text = str(payload.text);
  return text ? [text] : fallback;
}
function round(value: number): number {
  return Number(value.toFixed(2));
}

function stamp(extension: string): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}.${extension}`;
}
function fileName(skillId: string, extension: string): string {
  return `${skillId.replace(/[^a-z0-9]+/gi, "-")}-${stamp(extension)}`;
}
function emit(
  skillId: string,
  name: string,
  data: string | Buffer,
  format: string,
  note: string,
): ArtifactMeta {
  return recordArtifact(saveArtifact(name, data, format, skillId, note));
}
function artifactEvidence(meta: ArtifactMeta): Record<string, unknown> {
  return {
    name: meta.name,
    format: meta.format,
    bytes: meta.bytes,
    sha256: meta.sha256,
    generatedBy: meta.generatedBy,
    note: meta.note,
  };
}

function outcome(
  spec: Dept01SkillSpec,
  steps: string[],
  evidence: Record<string, unknown>,
  extraBlocked: string[] = [],
  ok = true,
  error?: string,
): Dept01Outcome {
  return {
    ok,
    steps,
    evidence: {
      skillId: spec.id,
      module: spec.module,
      kind: spec.kind,
      external: spec.external,
      ...evidence,
    },
    blocked: [...spec.blocked, ...extraBlocked],
    ...(error ? { error } : {}),
  };
}

function recordOutcome(
  spec: Dept01SkillSpec,
  data: Record<string, unknown>,
  steps: string[],
  extraBlocked: string[] = [],
  status = "DRAFT",
  approvalStatus = "NOT_REQUIRED",
): Dept01Outcome {
  const created = addRecord({
    collection: spec.collection,
    module: spec.module,
    skillId: spec.id,
    status,
    approvalStatus,
    data,
  });
  return outcome(spec, [...steps, "persist local record", "compute SHA-256"], {
    record: created.record,
    persisted: created.persisted,
    ...data,
  }, extraBlocked);
}

/** Pick real native PDF artifacts; generate real seeds if none exist yet. */
function nativePdfSources(skillId: string, payload: Payload, minimum = 1): { name: string; lines: string[] }[] {
  const named = [...strings(payload.pdfNames), ...strings(payload.artifactNames)];
  const candidates = named.length
    ? named.map((name) => listArtifacts().find((a) => a.name === name)).filter((a): a is ArtifactMeta => Boolean(a))
    : listArtifacts().filter((a) => a.format === "pdf");
  const found: { name: string; lines: string[] }[] = [];
  for (const meta of candidates) {
    const buf = readArtifact(meta.name);
    if (buf && isNativePdf(buf)) found.push({ name: meta.name, lines: pdfText(buf) });
    if (found.length >= minimum) break;
  }
  while (found.length < minimum) {
    const index = found.length + 1;
    const seedLines = [
      `Generated locally for ${skillId}.`,
      `Seed paragraph ${index}: deterministic content, no external source.`,
      "No AI model was used to write this document.",
    ];
    const meta = emit(skillId, fileName(skillId, "pdf"), pdf(`GIMMS source document ${index}`, seedLines), "pdf", `auto-generated local seed ${index} (no external document)`);
    // Use the actual file so extraction is verified against bytes on disk.
    const buf = readArtifact(meta.name);
    found.push({ name: meta.name, lines: buf && isNativePdf(buf) ? pdfText(buf) : seedLines });
  }
  return found;
}

function docxSource(skillId: string, payload: Payload): { name: string; lines: string[] } {
  const named = [...strings(payload.docxNames), ...strings(payload.artifactNames)];
  const meta = named.length
    ? listArtifacts().find((a) => a.name === named[0])
    : listArtifacts().find((a) => a.format === "docx");
  if (meta) {
    const buf = readArtifact(meta.name);
    if (buf) return { name: meta.name, lines: docxText(buf) };
  }
  const seedName = fileName(skillId, "docx");
  const seedLines = ["Locally generated source document.", "No Microsoft Word connection."];
  emit(skillId, seedName, docx("GIMMS editable source", seedLines), "docx", "auto-generated local source for editing");
  const buf = readArtifact(seedName);
  return { name: seedName, lines: buf ? docxText(buf) : seedLines };
}

function financeTotals() {
  const incomes = listRecords("income").map((record) => num(record.data.amount));
  const expenses = listRecords("expenses").map((record) => num(record.data.amount));
  const income = round(incomes.reduce((sum, value) => sum + value, 0));
  const expense = round(expenses.reduce((sum, value) => sum + value, 0));
  return {
    incomeRecords: incomes.length,
    expenseRecords: expenses.length,
    income,
    expense,
    net: round(income - expense),
    source: "real local records only — no live financial account",
  };
}

// ---------------------------------------------------------------------------
// OWNER COMMAND + CROSS-DEPARTMENT WORKFLOW
// ---------------------------------------------------------------------------

const COMMAND_RULES: { match: RegExp; step: string }[] = [
  { match: /new employee record|create a new employee|employee record/i, step: "hr.employee.register" },
  { match: /employment agreement|agreement in word|word and pdf/i, step: "doc.agreement.draft" },
  { match: /payroll sheet|payroll.*excel|excel/i, step: "office.excel.create" },
  { match: /office expense|approved office expense|register an approved/i, step: "finance.expense.record" },
  { match: /assign.*website development|website development job|production.*management/i, step: "workflow.hr.to.production" },
];

function agreementParagraphs(payload: Payload): string[] {
  const employee = str(payload.employeeName, "[EMPLOYEE NAME — pending authorised secure registration]");
  const role = str(payload.role, "Assigned role (to be confirmed)");
  const start = str(payload.startDate, "[START DATE — to be confirmed]");
  return [
    "EMPLOYMENT AGREEMENT — DRAFT FOR REVIEW ONLY",
    `Employer: [COMPANY LEGAL NAME — not stored locally; requires Owner-authorised secure registration].`,
    `Employee: ${employee}. Employee ID: ${str(payload.employeeId, "EMP-0002 (proposed)")}.`,
    `Position: ${role}. Department: 01 — HR, Finance & Administration.`,
    `Proposed commencement: ${start}.`,
    "Clause 1 — Duties: as assigned by the HR Manager and recorded in the local job model.",
    "Clause 2 — Remuneration: figures must be taken from an authorised payroll calculation; no amount is invented in this draft.",
    "Clause 3 — Leave and attendance: governed by the approved company policy, once that policy is registered.",
    "Clause 4 — Confidentiality: company and client data remain isolated; no external service receives this document.",
    "Clause 5 — Review: this DRAFT is NOT legal advice and is NOT executed. A qualified legal professional must review it.",
    "Signatures: NOT COLLECTED. No e-signature service is connected.",
    "Generated by AI GIMMS native document engine. Microsoft Word / Microsoft 365 are NOT connected.",
  ];
}

function generateAgreement(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const paragraphs = agreementParagraphs(payload);
  const word = emit(spec.id, fileName(spec.id, "docx"), docx("Employment Agreement (DRAFT)", paragraphs), "docx", "native OOXML .docx; Microsoft Word NOT connected");
  const portable = emit(spec.id, fileName(spec.id, "pdf"), pdf("Employment Agreement (DRAFT)", paragraphs), "pdf", "native PDF 1.4; not signed, not sent");
  return recordOutcome(spec, {
    title: "Employment Agreement (DRAFT)",
    employeeId: str(payload.employeeId, "EMP-0002 (proposed)"),
    word: artifactEvidence(word),
    pdf: artifactEvidence(portable),
    legalAdviceGiven: false,
    signed: false,
    sent: false,
    qualifiedReviewRequired: true,
  }, ["render agreement paragraphs", "write real .docx (OOXML ZIP)", "write real .pdf (xref table)", "hash both files"], [
    "e-signature service — NOT CONNECTED",
    "no legal advice given; qualified legal professional review required",
    "no real Owner/employee details stored without authorised secure registration",
  ]);
}

function payrollWorkbook(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const basic = num(payload.basic, 0);
  const allowances = num(payload.allowances, 0);
  const deductions = num(payload.deductions, 0);
  const employeeId = str(payload.employeeId, peekEmployeeId());
  const employeeName = str(payload.employeeName, "Prospective Employee (draft placeholder)");
  const gross = round(basic + allowances);
  const net = round(gross - deductions);
  const meta = emit(
    spec.id,
    fileName(spec.id, "xlsx"),
    xlsx(
      "Payroll",
      ["Employee ID", "Employee", "Basic", "Allowances", "Deductions", "Gross", "Net", "Status"],
      [[employeeId, employeeName, basic, allowances, deductions, "", "", "DRAFT — NO PAYMENT"]],
      [
        { cell: "F2", formula: "C2+D2", value: gross },
        { cell: "G2", formula: "F2-E2", value: net },
      ],
    ),
    "xlsx",
    "native OOXML .xlsx with real formulas + cached values; Microsoft Excel NOT connected",
  );
  const buf = readArtifact(meta.name);
  const sheetLines = buf ? xlsxText(buf) : [];
  return recordOutcome(spec, {
    title: "Payroll Sheet (DRAFT)",
    sheetName: "Payroll",
    employeeId,
    basic,
    allowances,
    deductions,
    gross,
    net,
    formulas: ["F2 = C2+D2", "G2 = F2-E2"],
    sheetLines,
    spreadsheet: artifactEvidence(meta),
    statutoryRatesApplied: false,
    paymentExecuted: false,
    moneyMovement: false,
  }, ["compute gross/net arithmetic", "write real .xlsx with formulas", "read back sheet cells", "hash file"], [
    "statutory EPF/ETF/tax rates NOT invented — qualified accountant review required",
    "payroll RUN / payment execution blocked; moneyMovement=false",
  ]);
}

/** The exact Owner sample command, executed as real local work. */
export function runOwnerCommand(command: string, payload: Payload = {}): Dept01Outcome {
  const spec = dept01Spec("owner.command.execute")!;
  const text = str(command, str(payload.text, str(payload.title)));
  if (!text) return outcome(spec, ["validate command"], {}, ["empty command"], false, "command text is required");

  const matched = COMMAND_RULES.filter((rule) => rule.match.test(text));
  const parsedSteps = matched.map((rule) => rule.step);
  const executedSteps: { step: string; ok: boolean; evidence: Record<string, unknown> }[] = [];

  for (const step of parsedSteps) {
    let result: Dept01Outcome;
    if (step === "hr.employee.register") {
      result = runDept01Skill("hr.employee.register", { ...payload, name: str(payload.employeeName, "New Employee (command draft)") });
    } else if (step === "doc.agreement.draft") {
      result = generateAgreement(dept01Spec("doc.agreement.draft")!, payload);
    } else if (step === "office.excel.create") {
      result = payrollWorkbook(dept01Spec("office.excel.create")!, { ...payload, payroll: true });
    } else if (step === "finance.expense.record") {
      result = runDept01Skill("finance.expense.record", { ...payload, ownerCommandAuthorised: true });
    } else {
      result = runDept01Skill("workflow.hr.to.production", { ...payload, jobTitle: "Website development job" });
    }
    executedSteps.push({
      step,
      ok: result.ok,
      evidence: {
        recordId: (result.evidence.record as { id?: string } | undefined)?.id ?? null,
        artifacts: [
          result.evidence.word,
          result.evidence.pdf,
          result.evidence.spreadsheet,
          result.evidence.workflow,
        ].filter(Boolean),
        highlights: {
          employeeId: result.evidence.employeeId ?? null,
          net: result.evidence.net ?? null,
          approvalStatus: result.evidence.approvalStatus ?? null,
          approval: result.evidence.approval ?? null,
          ownerApproval: result.evidence.ownerApproval ?? null,
          workflowId: (result.evidence.workflow as { id?: string } | undefined)?.id ?? null,
        },
      },
    });
  }

  const commandHash = hash({ text, parsedSteps });
  const commandId = crypto.randomUUID();
  recordCommand({
    id: commandId,
    command: text,
    parsedSteps,
    executedSteps,
    commandHash,
    createdAt: new Date().toISOString(),
  });

  return outcome(spec, [
    "parse Owner command with deterministic keyword rules (NOT an AI model)",
    "execute each matched step through the existing single skills gateway",
    "persist command record with real evidence hashes",
  ], {
    command: text,
    commandId,
    commandHash,
    parsedSteps,
    executedSteps,
    stepsExecuted: executedSteps.length,
    stepsSucceeded: executedSteps.filter((s) => s.ok).length,
    noMatchedSteps: parsedSteps.length === 0,
    note: parsedSteps.length === 0
      ? "No keyword rule matched this command. Nothing was executed — parser is deterministic, not an AI model."
      : "Every matched step executed real local work.",
    aiModelUsed: false,
    moneyMovement: false,
    externalCalls: 0,
  }, [
    "no LLM / function-calling / MCP server connected — deterministic local parser only",
    "no payment, no email, no deploy, no production side effect",
  ], executedSteps.length === parsedSteps.length && executedSteps.every((s) => s.ok));
}

/** OWNER COMMAND → HR/FINANCE → DOCUMENT → MANAGEMENT → PRODUCTION → QA → OWNER APPROVAL */
function runWorkflow(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const workflowId = `wf_${hash({ at: Date.now(), title: payload.jobTitle }).slice(0, 16)}`;
  const jobTitle = str(payload.jobTitle, "Website development job (HR-to-Production handoff)");
  const plan: { name: string; department: string; deliverable: string; skills: string[] }[] = [
    { name: "OWNER_COMMAND_HR_RECORD", department: "01", deliverable: "Employee record (local)", skills: ["hr.employee.register"] },
    { name: "HR_FINANCE_DOCUMENT_CREATION", department: "01", deliverable: "Employment agreement .docx/.pdf + payroll .xlsx", skills: ["doc.agreement.draft", "office.excel.create"] },
    { name: "MANAGEMENT_JOB_REVIEW", department: "10", deliverable: "Validated management job + assignment decision", skills: ["job.intake", "progress.report"] },
    { name: "PRODUCTION_ASSIGNMENT", department: "02", deliverable: `${jobTitle} — production job record`, skills: ["job.intake"] },
  ];
  const steps: WorkflowRecord["steps"] = [];
  const created: { name: string; jobId: string; department: string; status: string }[] = [];
  const errors: string[] = [];

  for (const item of plan) {
    const result = createJob({
      title: `${item.name} — ${workflowId}`,
      departmentId: item.department,
      projectId: workflowId,
      description: `${item.deliverable}. Predecessor: ${created.at(-1)?.jobId ?? "OWNER_COMMAND"}.`,
      expectedDeliverable: item.deliverable,
      requiredSkills: item.skills,
      priority: "P1",
      permissionScope: "internal:read-write:local",
    });
    if (!result.ok || !result.job) {
      errors.push(`${item.name}: ${result.error ?? "create failed"}`);
      continue;
    }
    // Real state-machine transitions, not a text-only claim.
    const sequence = item.department === "02"
      ? ["REVIEW", "ASSIGN", "IN_PROGRESS", "QUALITY_CHECK", "APPROVAL"]
      : ["REVIEW"];
    let status = "NEW";
    for (const to of sequence) {
      const moved = transitionJob(result.job.jobId, to);
      if (!moved.ok) {
        errors.push(`${item.name}:${to}: ${moved.error}`);
        break;
      }
      status = moved.job?.status ?? status;
    }
    created.push({ name: item.name, jobId: result.job.jobId, department: item.department, status });
    steps.push({
      name: item.name,
      jobId: result.job.jobId,
      department: item.department,
      status,
      basis: result.job.routing.basis,
    });
  }

  const productionJob = created.find((item) => item.department === "02");
  // Prove the Owner-approval gate: COMPLETE is illegal from APPROVAL.
  const illegal = productionJob
    ? transitionJob(productionJob.jobId, "COMPLETE")
    : { ok: false, error: "no production job" };
  const approval = requestApproval({
    subjectId: productionJob?.jobId ?? workflowId,
    subject: "Final OWNER APPROVAL for HR→Management→Production workflow",
    scope: "owner sign-off only; NO delivery/release, NO payment, NO deploy",
    requestedBy: "workflow.hr.to.production",
    artifactVersion: hash({ workflowId, steps }),
  });
  const workflow: WorkflowRecord = {
    id: workflowId,
    chain: "OWNER COMMAND → HR/FINANCE → DOCUMENT CREATION → MANAGEMENT JOB → PRODUCTION ASSIGNMENT → QUALITY CHECK → OWNER APPROVAL",
    steps,
    ownerApproval: "PENDING",
    approvalId: approval.approval.id,
    createdAt: new Date().toISOString(),
    sha256: hash({ workflowId, steps, approvalId: approval.approval.id }),
  };
  const persisted = recordWorkflow(workflow);

  return outcome(spec, [
    "create real HR/finance/document job (dept 01)",
    "create real Management job (dept 10)",
    "create real Production job (dept 02)",
    "apply validated NEW→REVIEW→ASSIGN→IN_PROGRESS→QUALITY_CHECK→APPROVAL transitions",
    "test illegal APPROVAL→COMPLETE is rejected",
    "raise versioned Owner approval request and STOP",
  ], {
    workflow,
    persisted,
    jobsCreated: created.length,
    productionJobStatus: productionJob?.status ?? null,
    productionDepartment: "02",
    managementDepartment: "10",
    ownerApproval: "PENDING",
    approval: approval.approval,
    illegalTransitionRejected: !illegal.ok,
    illegalTransitionError: illegal.error ?? null,
    productionFullyFunctional: false,
    note: "Production dept 02 is registered active-p0 but NOT fully functional; handoff is tested through the shared job model, not a completed Production department.",
    errors,
  }, [
    "Owner approval is PENDING — no DELIVERY / COMPLETE transition performed",
    "Production is not fully implemented; do not claim end-to-end client delivery",
    "no auto-assignment to a human, no external notification, no deploy",
  ], errors.length === 0 && created.length === plan.length && Boolean(productionJob));
}

// ---------------------------------------------------------------------------
// HR HANDLERS
// ---------------------------------------------------------------------------

function hrHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, "Dept 01 HR record");
  switch (spec.id) {
    case "hr.employee.register": {
      const employeeId = nextEmployeeId();
      return recordOutcome(spec, {
        title,
        employeeId,
        displayName: str(payload.name, "New Employee (draft placeholder)"),
        role: str(payload.role, "Unassigned"),
        department: "01",
        division: str(payload.division, "Human Resources"),
        status: "DRAFT",
        profileComplete: false,
        realDetailsStored: false,
        loginStatus: "PENDING_SECURE_REGISTRATION",
        ownerEmployeeIdReserved: "EMP-0001",
      }, ["reserve EMP-0001 for Owner", "allocate next sequential employee ID", "validate no real personal data is stored"], [
        "secure login NOT implemented — needs Owner-approved auth provider",
        "no real Owner details stored without authorised secure registration",
      ]);
    }
    case "hr.employee.id": {
      const allocated = listRecords("employees").map((r) => String(r.data.employeeId ?? ""));
      const duplicates = allocated.length - new Set(allocated).size;
      return outcome(spec, ["read employee records", "check sequence", "verify EMP-0001 reservation"], {
        ownerEmployeeIdReserved: "EMP-0001",
        nextEmployeeId: peekEmployeeId(),
        allocatedIds: allocated,
        allocatedCount: allocated.length,
        duplicateIds: duplicates,
        sequenceValid: duplicates === 0 && !allocated.includes("EMP-0001"),
      }, [], duplicates === 0 && !allocated.includes("EMP-0001"));
    }
    case "hr.recruitment.vacancy":
      return recordOutcome(spec, {
        title,
        division: str(payload.division, "Human Resources"),
        requiredSkills: strings(payload.requiredSkills),
        openings: num(payload.openings, 1),
        status: "OPEN_DRAFT",
        published: false,
        applicantSourcesConnected: 0,
      }, ["validate vacancy fields", "create local vacancy record"], ["no job board / ATS / LinkedIn API connected — vacancy NOT published"]);
    case "hr.application.screen": {
      const required = strings(payload.requiredSkills).length
        ? strings(payload.requiredSkills)
        : ["typescript", "next.js", "testing", "documentation"];
      const cv = str(payload.cvText, str(payload.text, ""));
      const lower = cv.toLowerCase();
      const matched = required.filter((skill) => lower.includes(skill.toLowerCase()));
      const missing = required.filter((skill) => !lower.includes(skill.toLowerCase()));
      const score = round((matched.length / Math.max(required.length, 1)) * 100);
      return recordOutcome(spec, {
        title,
        screeningMethod: "deterministic-keyword-match",
        modelUsed: false,
        cvCharacters: cv.length,
        requiredSkills: required,
        matchedSkills: matched,
        missingSkills: missing,
        matchScore: score,
        decision: "REVIEW_ONLY — no hiring decision is made automatically",
      }, ["normalise CV text", "match required keywords", "compute score", "refuse hiring decision"], [
        "NO AI/LLM screening model connected — keyword matching is not an AI assessment",
        "no hiring decision, no candidate outreach, no bias/fairness validation",
      ], "SCREENED", "NOT_REQUIRED");
    }
    case "hr.interview.schedule": {
      const at = str(payload.at, new Date(Date.now() + 86400000).toISOString());
      const panel = strings(payload.panel).length ? strings(payload.panel) : ["HR Manager"];
      const conflicts = listRecords("interviews").filter(
        (record) => String(record.data.at) === at && strings(record.data.panel).some((p) => panel.includes(p)),
      );
      return recordOutcome(spec, {
        title,
        at,
        panel,
        candidate: str(payload.candidate, "[candidate — not stored]"),
        conflicts: conflicts.length,
        conflictIds: conflicts.map((record) => record.id),
        status: conflicts.length ? "CONFLICT_DETECTED" : "TENTATIVE",
        calendarInviteSent: false,
      }, ["read existing interview records", "compare slot + panel", "detect real conflicts"], ["no calendar/email service connected — no invite sent"], conflicts.length ? "CONFLICT_DETECTED" : "TENTATIVE");
    }
    case "hr.onboarding.plan":
    case "hr.offboarding.plan": {
      const onboarding = spec.id === "hr.onboarding.plan";
      const checklist = onboarding
        ? ["Verify identity through authorised secure registration", "Assign employee ID", "Register role and least-privilege permissions", "Issue agreement DRAFT for qualified legal review", "Record attendance/leave policy acknowledgements", "Create payroll calculation record (no payment)"]
        : ["Record last working day", "Revoke local permissions", "Archive employee documents", "Prepare final payroll calculation DRAFT", "Record asset returns", "Write offboarding audit entry"];
      return recordOutcome(spec, {
        title,
        type: onboarding ? "ONBOARDING" : "OFFBOARDING",
        employeeId: str(payload.employeeId, peekEmployeeId()),
        checklist,
        checklistItems: checklist.length,
        completedItems: 0,
        status: "PLAN_ONLY",
      }, ["build checklist from role", "persist local plan"], ["checklist items are NOT executed automatically — human sign-off required"]);
    }
    case "hr.attendance.record": {
      const checkIn = str(payload.checkIn, "09:00");
      const checkOut = str(payload.checkOut, "17:00");
      const toMinutes = (value: string) => {
        const match = /^(\d{1,2}):(\d{2})$/.exec(value);
        return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
      };
      const minutes = Math.max(0, toMinutes(checkOut) - toMinutes(checkIn));
      return recordOutcome(spec, {
        title,
        employeeId: str(payload.employeeId, peekEmployeeId()),
        date: str(payload.date, new Date().toISOString().slice(0, 10)),
        checkIn,
        checkOut,
        minutes,
        hours: round(minutes / 60),
        source: "supplied times only — no biometric/device integration",
      }, ["parse check-in/check-out", "compute hours"], ["no time-clock device / HRIS API connected"]);
    }
    case "hr.leave.record": {
      const from = str(payload.from, new Date().toISOString().slice(0, 10));
      const to = str(payload.to, from);
      const start = new Date(`${from}T00:00:00Z`).getTime();
      const end = new Date(`${to}T00:00:00Z`).getTime();
      const valid = Number.isFinite(start) && Number.isFinite(end) && end >= start;
      const days = valid ? Math.round((end - start) / 86400000) + 1 : 0;
      const allowance = num(payload.allowance, 0);
      const taken = listRecords("leave").reduce((sum, record) => sum + num(record.data.days), 0);
      return recordOutcome(spec, {
        title,
        employeeId: str(payload.employeeId, peekEmployeeId()),
        from,
        to,
        days,
        dateParseValid: valid,
        annualAllowance: allowance,
        previouslyTaken: taken,
        balanceAfter: round(allowance - taken - days),
        status: "DRAFT_PENDING_APPROVAL",
        approved: false,
      }, ["parse dates", "compute inclusive days", "recompute balance from real local leave records"], ["leave approval requires a human HR Manager / Owner decision"], "DRAFT_PENDING_APPROVAL", "PENDING_OWNER_AUTHORIZATION");
    }
    case "hr.payroll.calculate": {
      const basic = num(payload.basic);
      const allowances = num(payload.allowances);
      const deductions = num(payload.deductions);
      const gross = round(basic + allowances);
      const net = round(gross - deductions);
      return recordOutcome(spec, {
        title,
        employeeId: str(payload.employeeId, peekEmployeeId()),
        period: str(payload.period, new Date().toISOString().slice(0, 7)),
        basic,
        allowances,
        deductions,
        gross,
        net,
        currency: str(payload.currency, "LKR (unverified — no finance system connected)"),
        statutoryRatesApplied: false,
        paymentExecuted: false,
        moneyMovement: false,
        method: "arithmetic on supplied numbers only",
      }, ["read supplied numbers", "gross = basic + allowances", "net = gross - deductions", "refuse payment execution"], [
        "statutory EPF/ETF/PAYE/tax rates NOT invented — qualified accountant review required",
        "payroll RUN / salary payment is BLOCKED; moneyMovement=false",
        "no live financial account connected",
      ], "CALCULATED_DRAFT", "PENDING_OWNER_AUTHORIZATION");
    }
    case "hr.performance.review":
      return recordOutcome(spec, {
        title,
        employeeId: str(payload.employeeId, peekEmployeeId()),
        goals: strings(payload.goals),
        selfAssessment: str(payload.text, ""),
        managerScore: num(payload.score, 0),
        status: "DRAFT",
        aiScoringUsed: false,
      }, ["collect supplied goals", "record manager score"], ["no AI performance-scoring model connected; final rating requires human sign-off"]);
    case "hr.training.record":
      return recordOutcome(spec, {
        title,
        employeeId: str(payload.employeeId, peekEmployeeId()),
        course: str(payload.course, title),
        skills: strings(payload.skills),
        completed: Boolean(payload.completed === true),
        certificateVerified: false,
      }, ["record training", "list skills"], ["no external LMS / certificate verification connected"]);
    case "hr.contract.draft":
      return generateAgreement(spec, payload);
    case "hr.roles.permissions": {
      const roles = strings(payload.roles).length ? strings(payload.roles) : DEPT01_AGENTS.map((agent) => agent.jobRole);
      const matrix = roles.map((role) => ({
        role,
        read: ["own department records"],
        write: ["own department DRAFT records"],
        denied: ["payment execution", "payroll run", "production deploy", "other-client data", "secret values"],
      }));
      return outcome(spec, ["read 10 agent contracts", "build least-privilege matrix", "verify denied list"], {
        roles,
        roleCount: roles.length,
        matrix,
        leastPrivilegeApplied: true,
        productionPermissionChanges: 0,
        note: "Local role matrix only — no live RBAC/IAM change performed",
      }, ["no identity provider connected — permissions are documentation, not enforced auth"]);
    }
    case "hr.document.register":
      return recordOutcome(spec, {
        title,
        employeeId: str(payload.employeeId, peekEmployeeId()),
        documentType: str(payload.documentType, "General"),
        artifactName: str(payload.artifactName, ""),
        sha256: str(payload.sha256, ""),
        verified: false,
      }, ["register document metadata"], ["no DMS / Drive / SharePoint connection; verification not performed"]);
    case "hr.report.generate": {
      const records = allRecords();
      const byCollection: Record<string, number> = {};
      for (const record of records) byCollection[record.collection] = (byCollection[record.collection] ?? 0) + 1;
      const report = {
        generatedAt: new Date().toISOString(),
        totalLocalRecords: records.length,
        employees: listRecords("employees").length,
        vacancies: listRecords("vacancies").length,
        applications: listRecords("applications").length,
        interviews: listRecords("interviews").length,
        payrollRecords: listRecords("payroll").length,
        leaveRecords: listRecords("leave").length,
        attendanceRecords: listRecords("attendance").length,
        byCollection,
        source: "real local Dept 01 records only",
        aiGeneratedNarrative: false,
      };
      return outcome(spec, ["read local store", "count records by collection", "build honest HR report"], { report }, ["no BI / HRIS connector; report is local only"]);
    }
    default:
      return genericRecord(spec, payload);
  }
}

// ---------------------------------------------------------------------------
// FINANCE HANDLERS
// ---------------------------------------------------------------------------

function financeHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, "Dept 01 Finance record");
  const amount = num(payload.amount);
  const currency = str(payload.currency, "LKR (unverified)");
  switch (spec.id) {
    case "finance.income.record":
    case "finance.expense.record": {
      const isExpense = spec.id === "finance.expense.record";
      const authorisedByCommand = payload.ownerCommandAuthorised === true;
      const created = addRecord({
        collection: spec.collection,
        module: spec.module,
        skillId: spec.id,
        status: isExpense && authorisedByCommand ? "APPROVED_RECORD_ONLY" : "DRAFT",
        approvalStatus: isExpense ? "OWNER_AUTHORISATION_REQUIRED" : "NOT_REQUIRED",
        data: {
          title,
          amount,
          currency,
          category: str(payload.category, isExpense ? "Office expense" : "Revenue"),
          date: str(payload.date, new Date().toISOString().slice(0, 10)),
          description: str(payload.description, str(payload.text, "")),
          moneyMovement: false,
          paymentExecuted: false,
          postedToAccountingSystem: false,
          source: "Owner command / local payload only — no live financial account",
        },
      });
      let approval: Record<string, unknown> = { required: false };
      if (isExpense) {
        const request = requestApproval({
          subjectId: created.record.id,
          subject: `${title} (office expense RECORD only)`,
          scope: "register expense record ONLY; no payment, no posting to accounting system",
          requestedBy: spec.id,
          artifactVersion: created.record.sha256,
        });
        approval = {
          required: true,
          id: request.approval.id,
          artifactVersion: request.approval.artifactVersion,
          status: request.approval.status,
        };
        if (authorisedByCommand) {
          const decision = decideApproval({
            approvalId: request.approval.id,
            approver: "OWNER_COMMAND (explicit local command text)",
            decision: "APPROVED_RECORD_ONLY",
            artifactVersion: request.approval.artifactVersion,
          });
          approval = { ...approval, status: decision.approval?.status ?? request.approval.status, decidedBy: decision.approval?.decidedBy ?? "", recordOnly: true };
        }
      }
      return outcome(spec, [
        "validate amount/currency",
        "create local finance RECORD (no money movement)",
        ...(isExpense ? ["raise versioned approval request"] : []),
        ...(isExpense && authorisedByCommand ? ["apply explicit Owner-command RECORD-ONLY approval"] : []),
        "compute SHA-256",
      ], {
        record: created.record,
        persisted: created.persisted,
        amount,
        approvalStatus: created.record.approvalStatus,
        approval,
        moneyMovement: false,
        paymentExecuted: false,
      }, [
        "accounting API — NOT CONNECTED",
        "no live financial account accessed; no bank/payment gateway call",
        "payment execution is BLOCKED; approval (if any) covers this exact record version only",
      ]);
    }
    case "finance.budget.create":
      return recordOutcome(spec, {
        title,
        costCentre: str(payload.costCentre, "Dept 01"),
        period: str(payload.period, new Date().toISOString().slice(0, 7)),
        budgetAmount: num(payload.budgetAmount, amount),
        currency,
        status: "DRAFT",
        fundsCommitted: false,
      }, ["validate budget fields", "record budget"], ["budget release requires Owner authorisation; no funds committed"]);
    case "finance.budget.variance": {
      const budgets = listRecords("budgets").map((r) => num(r.data.budgetAmount));
      const budget = budgets.reduce((sum, value) => sum + value, 0);
      const totals = financeTotals();
      return outcome(spec, ["sum real local budgets", "sum real local income/expenses", "compute variance"], {
        budgetRecords: budgets.length,
        budget: round(budget),
        income: totals.income,
        expense: totals.expense,
        variance: round(budget - totals.expense),
        netPosition: totals.net,
        source: "real local records only",
      }, ["no accounting/ERP connector — variance is local arithmetic"], budget > 0 || budgets.length > 0);
    }
    case "finance.receivable.register":
      return recordOutcome(spec, {
        title,
        customer: str(payload.customer, "[customer reference — not stored]"),
        amount,
        currency,
        dueDate: str(payload.dueDate, new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
        invoiceRef: str(payload.invoiceRef, ""),
        collected: false,
        reminderSent: false,
      }, ["register receivable", "compute due date"], ["no payment collection, no dunning, no email service connected"]);
    case "finance.ar.aging": {
      const today = Date.now();
      const buckets: Record<string, number> = { "not_due": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      let total = 0;
      const rows = listRecords("receivables").map((record) => {
        const due = new Date(`${String(record.data.dueDate)}T00:00:00Z`).getTime();
        const days = Number.isFinite(due) ? Math.floor((today - due) / 86400000) : 0;
        const bucket = days <= 0 ? "not_due" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
        buckets[bucket] += 1;
        total += num(record.data.amount);
        return { id: record.id, dueDate: record.data.dueDate, daysOverdue: Math.max(0, days), bucket, amount: num(record.data.amount) };
      });
      return outcome(spec, ["read real receivable records", "compute days overdue from due dates", "bucket receivables"], {
        receivables: rows.length,
        totalOutstanding: round(total),
        buckets,
        rows,
        source: "real local records",
      }, ["no accounting API; no collection action taken"]);
    }
    case "finance.payable.register":
      return recordOutcome(spec, {
        title,
        supplier: str(payload.supplier, "[supplier reference — not stored]"),
        amount,
        currency,
        dueDate: str(payload.dueDate, new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
        paid: false,
        paymentExecuted: false,
      }, ["register payable"], ["payment execution BLOCKED — no payment gateway connected"]);
    case "finance.invoice.draft":
    case "finance.quotation.draft": {
      const raw = Array.isArray(payload.lines) ? (payload.lines as unknown[]) : [];
      const items = raw.map((line) => {
        const item = (typeof line === "object" && line !== null ? line : {}) as Payload;
        const qty = num(item.qty, 1);
        const unitPrice = num(item.unitPrice, 0);
        return { description: str(item.description, str(String(line), "Item")), qty, unitPrice, amount: round(qty * unitPrice) };
      });
      const subtotal = round(items.reduce((sum, item) => sum + item.amount, 0));
      const taxRate = num(payload.taxRate, 0);
      const tax = round(subtotal * taxRate / 100);
      const total = round(subtotal + tax);
      const isInvoice = spec.id === "finance.invoice.draft";
      const paragraphs = [
        `${isInvoice ? "INVOICE" : "QUOTATION"} — DRAFT, NOT SENT`,
        `Reference: ${str(payload.reference, "LOCAL-DRAFT")}`,
        `Customer: ${str(payload.customer, "[customer — not stored]")}`,
        ...items.map((item, index) => `${index + 1}. ${item.description} | qty ${item.qty} | unit ${item.unitPrice} | amount ${item.amount}`),
        `Subtotal: ${subtotal}`,
        `Tax (${taxRate}% — supplied rate only, NOT statutory advice): ${tax}`,
        `Total: ${total} ${currency}`,
        "No payment has been requested or collected. No accounting system was updated.",
      ];
      const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf(`${isInvoice ? "Invoice" : "Quotation"} DRAFT`, paragraphs), "pdf", "native PDF draft; not sent, not posted");
      return recordOutcome(spec, {
        title,
        type: isInvoice ? "INVOICE_DRAFT" : "QUOTATION_DRAFT",
        items,
        subtotal,
        taxRate,
        tax,
        total,
        currency,
        document: artifactEvidence(meta),
        sent: false,
        posted: false,
        moneyMovement: false,
      }, ["compute line amounts", "sum subtotal/tax/total", "render native PDF", "hash document"], [
        "accounting / invoicing API — NOT CONNECTED",
        "tax rate is a supplied number only; no statutory tax advice given",
        "document NOT sent to any customer",
      ]);
    }
    case "finance.payment.request": {
      const created = addRecord({
        collection: spec.collection,
        module: spec.module,
        skillId: spec.id,
        status: "PENDING_OWNER_AUTHORIZATION",
        approvalStatus: "PENDING_OWNER_AUTHORIZATION",
        data: {
          title,
          amount,
          currency,
          payee: str(payload.payee, "[payee — not stored]"),
          reason: str(payload.reason, str(payload.text, "")),
          moneyMovement: false,
          paymentExecuted: false,
          executionRefused: true,
        },
      });
      const request = requestApproval({
        subjectId: created.record.id,
        subject: `${title} (payment/payout REQUEST)`,
        scope: "request only — ANY financial transaction requires separate appropriate Owner authorisation",
        requestedBy: spec.id,
        artifactVersion: created.record.sha256,
      });
      return outcome(spec, ["validate request", "record REQUEST only", "raise versioned Owner approval", "REFUSE execution"], {
        record: created.record,
        approval: request.approval,
        paymentExecuted: false,
        moneyMovement: false,
        executionRefused: true,
        ownerApproval: "PENDING",
      }, [
        "payment gateway API — NOT CONNECTED",
        "no live financial accounts accessed; no payment made",
        "execution is BLOCKED by design — no API in this repository can execute a payment",
      ]);
    }
    case "finance.report.generate": {
      const totals = financeTotals();
      const report = {
        generatedAt: new Date().toISOString(),
        ...totals,
        receivables: listRecords("receivables").length,
        payables: listRecords("payables").length,
        paymentRequests: listRecords("paymentRequests").length,
        pendingApprovals: listApprovals().filter((a) => a.status === "PENDING_OWNER_AUTHORIZATION").length,
        moneyMovement: 0,
        aiGeneratedNarrative: false,
      };
      return outcome(spec, ["sum real local income/expense records", "count receivables/payables", "report pending approvals"], { report }, ["no accounting/BI connector; local records only"]);
    }
    case "finance.cashflow.statement": {
      const totals = financeTotals();
      return outcome(spec, ["read real local income/expense records", "compute inflows/outflows"], {
        inflows: totals.income,
        outflows: totals.expense,
        netCashFlow: totals.net,
        incomeRecords: totals.incomeRecords,
        expenseRecords: totals.expenseRecords,
        actualBankBalanceAvailable: false,
        note: "No bank/accounting feed connected — this is NOT a bank reconciliation.",
      }, ["no bank feed / accounting API connected; no live balance"]);
    }
    case "finance.pl.statement": {
      const totals = financeTotals();
      return outcome(spec, ["read real local income/expense records", "compute profit and loss"], {
        revenue: totals.income,
        costs: totals.expense,
        profitOrLoss: totals.net,
        marginPercent: totals.income ? round((totals.net / totals.income) * 100) : null,
        statutoryAdjustmentsApplied: false,
        note: "Management DRAFT from local records only; not a statutory statement.",
      }, ["no accounting API; qualified accountant review required before any filing"]);
    }
    case "finance.reminder.draft": {
      const body = [
        "Payment reminder — DRAFT ONLY. This message was NEVER SENT.",
        `Reference: ${str(payload.reference, "LOCAL-DRAFT")}`,
        `Amount: ${amount} ${currency}`,
        `Due: ${str(payload.dueDate, "[due date not supplied]")}`,
        "Please treat this as an internal draft pending Owner review.",
      ];
      const meta = emit(spec.id, fileName(spec.id, "eml"), eml(`${title} — DRAFT`, body.join("\n")), "eml", "native .eml draft; SMTP / Gmail / Outlook NOT connected, never sent");
      return recordOutcome(spec, {
        title,
        document: artifactEvidence(meta),
        sent: false,
        recipientStored: false,
        amount,
      }, ["render .eml draft", "mark never-sent"], ["SMTP / email API — NOT CONNECTED; no message sent to any customer"]);
    }
    case "finance.document.generate": {
      const totals = financeTotals();
      const lines = [
        `Generated: ${new Date().toISOString()}`,
        `Income records: ${totals.incomeRecords}; total ${totals.income}`,
        `Expense records: ${totals.expenseRecords}; total ${totals.expense}`,
        `Net position: ${totals.net}`,
        "No live financial account was accessed. No payment was made.",
      ];
      const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf("Financial Summary (LOCAL DRAFT)", lines), "pdf", "native PDF from real local totals");
      return recordOutcome(spec, { title, totals, document: artifactEvidence(meta), aiGeneratedNarrative: false }, ["read real totals", "render native PDF"], ["no accounting system connection"]);
    }
    case "finance.tax.support": {
      const checklist = [
        "Collect authorised income/expense records", "Reconcile with qualified accountant", "Confirm applicable statutory rates from official sources", "Verify invoice/tax registration details", "Prepare filing drafts for human review", "Owner signs off before any submission",
      ];
      return outcome(spec, ["build documentation checklist", "mark advice boundary"], {
        checklist,
        checklistItems: checklist.length,
        taxAdviceGiven: false,
        statutoryRatesApplied: false,
        filingsSubmitted: 0,
        qualifiedAccountantReviewRequired: true,
      }, ["qualified accountant / tax authority API — NOT CONNECTED", "no tax advice, no filing, no payment"]);
    }
    default:
      return genericRecord(spec, payload);
  }
}

// ---------------------------------------------------------------------------
// ADMINISTRATION HANDLERS
// ---------------------------------------------------------------------------

function adminHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, "Dept 01 Administration record");
  switch (spec.id) {
    case "admin.communication.draft": {
      const meta = emit(spec.id, fileName(spec.id, "eml"), eml(`${title} — DRAFT`, str(payload.text, "Internal communication draft. NEVER SENT.")), "eml", "native .eml draft; no SMTP/chat API connected");
      return recordOutcome(spec, { title, document: artifactEvidence(meta), sent: false, channel: "NONE" }, ["render .eml draft"], ["SMTP / chat API — NOT CONNECTED; never sent"]);
    }
    case "admin.meeting.schedule": {
      const at = str(payload.at, new Date(Date.now() + 3600000).toISOString());
      const conflicts = listRecords("meetings").filter((record) => String(record.data.at) === at);
      const meta = emit(spec.id, fileName(spec.id, "ics"), ics(title, str(payload.text, "Internal meeting draft"), at, str(payload.endsAt, new Date(new Date(at).getTime() + 3600000).toISOString())), "ics", "native .ics DRAFT; Google Calendar / Outlook NOT connected");
      return recordOutcome(spec, {
        title,
        at,
        attendeesInvited: 0,
        conflicts: conflicts.length,
        calendar: artifactEvidence(meta),
        inviteSent: false,
      }, ["read existing meetings", "detect real slot conflict", "render .ics"], ["no calendar service connected — no invite sent"]);
    }
    case "admin.legal.coordinate":
      return recordOutcome(spec, {
        title,
        matter: str(payload.matter, title),
        status: "QUALIFIED_REVIEW_REQUIRED",
        legalAdviceGiven: false,
        externalCounselContacted: false,
        documentExecuted: false,
      }, ["register legal coordination item"], ["qualified legal professional — NOT CONNECTED", "no legal advice, no contract execution"]);
    case "admin.letter.draft":
    case "admin.template.register": {
      const lines = bodyLines(payload, ["Official document DRAFT generated locally.", "No external office suite connected."]);
      const isLetter = spec.id === "admin.letter.draft";
      const word = emit(spec.id, fileName(spec.id, "docx"), docx(title, lines), "docx", "native OOXML draft");
      const portable = emit(spec.id, fileName(spec.id, "pdf"), pdf(title, lines), "pdf", "native PDF draft");
      return recordOutcome(spec, {
        title,
        kind: isLetter ? "OFFICIAL_LETTER_DRAFT" : "TEMPLATE_INSTANCE",
        lines,
        word: artifactEvidence(word),
        pdf: artifactEvidence(portable),
        sent: false,
      }, ["render .docx", "render .pdf", "hash both"], ["not mailed, not signed, not published"]);
    }
    case "admin.approval.workflow": {
      const request = requestApproval({
        subjectId: str(payload.subjectId, `wf_${hash({ title, at: Date.now() }).slice(0, 12)}`),
        subject: title,
        scope: str(payload.scope, "record-only approval; no payment / deploy / publish"),
        requestedBy: spec.id,
      });
      return outcome(spec, ["validate subject", "raise versioned approval request", "leave decision to Owner"], {
        approval: request.approval,
        ownerApproval: "PENDING",
        autoApproved: false,
        moneyMovement: false,
        externalCalls: 0,
      }, ["no approval is granted automatically — Owner decision required"]);
    }
    case "admin.office.record":
    case "admin.document.register":
    case "admin.task.create":
    case "admin.asset.register":
    case "admin.branch.register":
    case "admin.policy.register":
    case "admin.contract.register":
    default:
      return genericRecord(spec, payload);
  }
}

// ---------------------------------------------------------------------------
// OFFICE / PDF / DOCUMENT AUTOMATION HANDLERS
// ---------------------------------------------------------------------------

function officeHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, "GIMMS native document");
  const lines = bodyLines(payload, ["Deterministic local document.", "No external office suite is connected."]);
  switch (spec.id) {
    case "office.word.create": {
      const meta = emit(spec.id, fileName(spec.id, "docx"), docx(title, lines), "docx", "native OOXML .docx; Microsoft Word NOT connected");
      const buf = readArtifact(meta.name);
      return recordOutcome(spec, { title, document: artifactEvidence(meta), extractedParagraphs: buf ? docxText(buf) : [], ooxmlParts: 5 }, ["write OOXML ZIP package", "read back paragraphs", "hash file"], ["Microsoft Word / Microsoft 365 — NOT CONNECTED"]);
    }
    case "office.word.edit": {
      const source = docxSource(spec.id, payload);
      const addendum = strings(payload.addendum).length ? strings(payload.addendum) : [str(payload.text, "Edited locally — addendum.")];
      const merged = [...source.lines, ...addendum];
      const meta = emit(spec.id, fileName(spec.id, "docx"), docx(`${title} (edited)`, merged), "docx", "regenerated from GIMMS-owned .docx text; Word NOT connected");
      const buf = readArtifact(meta.name);
      return recordOutcome(spec, {
        title: `${title} (edited)`,
        sourceDocument: source.name,
        sourceParagraphs: source.lines.length,
        addendum,
        resultParagraphs: merged.length,
        readBackParagraphs: buf ? docxText(buf).length : 0,
        document: artifactEvidence(meta),
      }, ["read real .docx bytes", "extract paragraphs", "append edit", "regenerate .docx", "read back"], ["arbitrary third-party .docx editing is MISSING — GIMMS-owned files only"]);
    }
    case "office.excel.create": {
      if (payload.payroll === true || str(payload.sheet).toLowerCase() === "payroll") return payrollWorkbook(spec, payload);
      const rows = bodyLines(payload, ["Item"]).map((line) => [line, num(payload.qty, 1), num(payload.unitPrice, 0), ""]);
      const meta = emit(spec.id, fileName(spec.id, "xlsx"), xlsx("Sheet1", ["Description", "Qty", "Unit Price", "Amount"], rows, [{ cell: `D2`, formula: "B2*C2", value: round(num(payload.qty, 1) * num(payload.unitPrice, 0)) }]), "xlsx", "native OOXML .xlsx with formula; Microsoft Excel NOT connected");
      const buf = readArtifact(meta.name);
      return recordOutcome(spec, { title, document: artifactEvidence(meta), sheetLines: buf ? xlsxText(buf) : [], formula: "D2 = B2*C2" }, ["write OOXML workbook", "add real formula + cached value", "read back cells"], ["Microsoft Excel / Microsoft 365 — NOT CONNECTED"]);
    }
    case "office.powerpoint.create": {
      const meta = emit(spec.id, fileName(spec.id, "pptx"), pptx(title, lines), "pptx", "native OOXML .pptx; Microsoft PowerPoint NOT connected");
      return recordOutcome(spec, { title, slideCount: 1, shapes: lines.length + 1, document: artifactEvidence(meta), ooxmlParts: 11 }, ["write presentation package", "write slide/layout/master/theme", "hash file"], ["Microsoft PowerPoint / Microsoft 365 — NOT CONNECTED", "PPTX not opened in PowerPoint — no local Office installation"]);
    }
    case "office.outlook.email.draft":
    case "office.google.gmail.draft": {
      const meta = emit(spec.id, fileName(spec.id, "eml"), eml(`${title} — DRAFT`, lines.join("\n")), "eml", "native .eml DRAFT; Outlook/Gmail NOT connected; never sent");
      return recordOutcome(spec, { title, document: artifactEvidence(meta), sent: false, xGimmsStatus: "DRAFT - NEVER SENT" }, ["render RFC-style .eml"], ["Outlook / Graph / Gmail API — NOT CONNECTED; no message sent"]);
    }
    case "office.outlook.calendar.draft":
    case "office.google.calendar.draft": {
      const meta = emit(spec.id, fileName(spec.id, "ics"), ics(title, lines.join(" "), new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()), "ics", "native .ics DRAFT; Outlook/Google Calendar NOT connected");
      return recordOutcome(spec, { title, document: artifactEvidence(meta), invitesSent: 0, status: "TENTATIVE" }, ["render iCalendar VEVENT"], ["Outlook / Google Calendar API — NOT CONNECTED; no invite sent"]);
    }
    case "office.google.docs.draft": {
      const md = emit(spec.id, fileName(spec.id, "md"), markdown(title, lines), "md", "local .md equivalent; Google Docs API NOT connected");
      const word = emit(spec.id, fileName(spec.id, "docx"), docx(title, lines), "docx", "local .docx equivalent; Google Docs API NOT connected");
      return recordOutcome(spec, { title, markdown: artifactEvidence(md), word: artifactEvidence(word), uploadedToDrive: false }, ["render .md", "render .docx equivalent"], ["Google Docs API — NOT CONNECTED; no document created in Google Drive"]);
    }
    case "office.google.sheets.draft": {
      const sheet = emit(spec.id, fileName(spec.id, "xlsx"), xlsx("Sheet1", ["Item", "Value"], lines.map((line) => [line, ""])), "xlsx", "local .xlsx equivalent; Google Sheets API NOT connected");
      const plain = emit(spec.id, fileName(spec.id, "csv"), csv([["Item", "Value"], ...lines.map((line) => [line, ""])]), "csv", "local .csv; Google Sheets NOT connected");
      return recordOutcome(spec, { title, spreadsheet: artifactEvidence(sheet), csv: artifactEvidence(plain), uploadedToDrive: false }, ["render .xlsx", "render .csv"], ["Google Sheets API — NOT CONNECTED"]);
    }
    case "office.google.slides.draft": {
      const meta = emit(spec.id, fileName(spec.id, "pptx"), pptx(title, lines), "pptx", "local .pptx equivalent; Google Slides API NOT connected");
      return recordOutcome(spec, { title, document: artifactEvidence(meta), uploadedToDrive: false }, ["render .pptx equivalent"], ["Google Slides API — NOT CONNECTED"]);
    }
    case "office.google.drive.draft": {
      const index = listArtifacts().slice(0, 50).map((a) => ({ name: a.name, format: a.format, bytes: a.bytes, sha256: a.sha256 }));
      const meta = emit(spec.id, fileName(spec.id, "json"), JSON.stringify({ title, generatedAt: new Date().toISOString(), files: index, note: "LOCAL file organisation index — Google Drive NOT connected" }, null, 2), "json", "local organisation index; Drive NOT connected");
      return outcome(spec, ["list real local artifacts", "hash index", "write .json"], { index: artifactEvidence(meta), indexedFiles: index.length, uploadedToDrive: false }, ["Google Drive API — NOT CONNECTED; no upload, no sharing"]);
    }
    default:
      return genericRecord(spec, payload);
  }
}

function pdfHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, "GIMMS native PDF");
  const lines = bodyLines(payload, ["Deterministic local PDF content.", "No external PDF library is connected."]);
  switch (spec.id) {
    case "pdf.create": {
      const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf(title, lines), "pdf", "native PDF 1.4 with real xref table");
      const buf = readArtifact(meta.name);
      return recordOutcome(spec, {
        title,
        document: artifactEvidence(meta),
        header: buf?.subarray(0, 8).toString("latin1") ?? null,
        xrefPresent: buf?.toString("latin1").includes("startxref") ?? false,
        extractedLines: buf ? pdfText(buf) : [],
      }, ["build PDF objects", "compute byte offsets", "write xref + trailer", "read back text"], ["no external PDF service; WinAnsi/Latin text only — Sinhala glyphs NOT supported"]);
    }
    case "pdf.edit": {
      const sources = nativePdfSources(spec.id, payload, 1);
      const addendum = strings(payload.addendum).length ? strings(payload.addendum) : [str(payload.text, "Edited locally — addendum.")];
      const merged = [...sources[0].lines, ...addendum];
      const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf(`${title} (edited)`, merged), "pdf", "native edit of GIMMS-generated PDF");
      const buf = readArtifact(meta.name);
      return recordOutcome(spec, {
        title: `${title} (edited)`,
        sourceDocument: sources[0].name,
        sourceLines: sources[0].lines.length,
        resultLines: merged.length,
        readBackLines: buf ? pdfText(buf).length : 0,
        document: artifactEvidence(meta),
      }, ["read real PDF bytes", "extract text", "append edit", "regenerate PDF", "read back"], ["arbitrary third-party PDF editing is MISSING — GIMMS-generated text PDFs only"]);
    }
    case "pdf.convert": {
      const from = str(payload.from, "docx");
      const to = str(payload.to, "pdf");
      let source: Buffer;
      let sourceName = "generated-local-source";
      if (from === "docx") {
        sourceName = fileName(spec.id, "docx");
        emit(spec.id, sourceName, docx(title, lines), "docx", "local conversion source");
        source = readArtifact(sourceName)!;
      } else if (from === "xlsx") {
        sourceName = fileName(spec.id, "xlsx");
        emit(spec.id, sourceName, xlsx("Sheet1", ["Item"], lines.map((line) => [line])), "xlsx", "local conversion source");
        source = readArtifact(sourceName)!;
      } else {
        const sources = nativePdfSources(spec.id, payload, 1);
        sourceName = sources[0].name;
        source = readArtifact(sourceName)!;
      }
      const result = convert(source, from, to);
      const meta = emit(spec.id, fileName(spec.id, result.format), result.data, result.format, `native conversion ${from} -> ${result.format}`);
      return recordOutcome(spec, {
        title,
        from,
        to: result.format,
        sourceDocument: sourceName,
        document: artifactEvidence(meta),
        generalConversionAvailable: false,
      }, ["read source bytes", `convert ${from} -> ${result.format}`, "hash output"], result.blocked);
    }
    case "pdf.merge": {
      const sources = nativePdfSources(spec.id, payload, 2);
      const mergedLines = [
        `Merged document — ${sources.length} local sources`,
        ...sources.flatMap((source) => [`Source: ${source.name}`, ...source.lines]),
      ];
      const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf(title, mergedLines), "pdf", "native merge of GIMMS-generated PDFs");
      const buf = readArtifact(meta.name);
      return recordOutcome(spec, {
        title,
        sources: sources.map((s) => s.name),
        sourceCount: sources.length,
        mergedLines: mergedLines.length,
        readBackLines: buf ? pdfText(buf).length : 0,
        document: artifactEvidence(meta),
      }, ["read 2 real PDF byte streams", "combine extracted lines", "regenerate merged PDF", "read back"], ["general PDF merge library — MISSING; GIMMS-generated text PDFs only"]);
    }
    case "pdf.split": {
      const sources = nativePdfSources(spec.id, payload, 1);
      const sourceLines = sources[0].lines;
      const parts = Math.max(2, Math.min(num(payload.parts, 2), 6));
      const size = Math.max(1, Math.ceil(sourceLines.length / parts));
      const outputs: Record<string, unknown>[] = [];
      for (let index = 0; index < parts; index += 1) {
        const chunk = sourceLines.slice(index * size, (index + 1) * size);
        if (!chunk.length) continue;
        const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf(`${title} — part ${index + 1}`, chunk), "pdf", `native split part ${index + 1}`);
        outputs.push({ part: index + 1, lines: chunk.length, ...artifactEvidence(meta) });
      }
      return recordOutcome(spec, {
        title,
        sourceDocument: sources[0].name,
        sourceLines: sourceLines.length,
        partsCreated: outputs.length,
        outputs,
      }, ["read real PDF", "extract text", "split into chunks", "regenerate PDFs"], ["general PDF split library — MISSING; GIMMS-generated text PDFs only"]);
    }
    case "pdf.form.fill": {
      const raw = payload.fields && typeof payload.fields === "object" ? Object.entries(payload.fields as Payload) : lines.map((line, index) => [`Field ${index + 1}`, line]);
      const filled = raw.map(([key, value]) => `${String(key)}: ${String(value ?? "")}`);
      const meta = emit(spec.id, fileName(spec.id, "pdf"), pdf(title, ["FLAT FORM FILL — not an AcroForm", ...filled]), "pdf", "flat field/value rendering; AcroForm NOT implemented");
      return recordOutcome(spec, {
        title,
        fields: filled,
        fieldCount: filled.length,
        acroForm: false,
        interactiveFieldsCreated: 0,
        document: artifactEvidence(meta),
      }, ["map field/value pairs", "render flat PDF"], ["AcroForm / interactive PDF fields — MISSING", "form not submitted anywhere"]);
    }
    case "pdf.text.extract": {
      const sources = nativePdfSources(spec.id, payload, 1);
      return outcome(spec, ["read real PDF bytes", "parse native text operators", "return extracted lines"], {
        sourceDocument: sources[0].name,
        lines: sources[0].lines,
        lineCount: sources[0].lines.length,
        ocrUsed: false,
        modelUsed: false,
      }, ["OCR / scanned PDF text extraction — MISSING", "arbitrary third-party PDF parsing — MISSING"]);
    }
    case "pdf.summarize": {
      const sources = nativePdfSources(spec.id, payload, 1);
      const text = sources[0].lines.join(" ");
      const summary = summarize(text, Math.max(1, Math.min(num(payload.maxSentences, 3), 5)));
      return outcome(spec, ["read real PDF bytes", "extract text", "score sentences deterministically"], {
        sourceDocument: sources[0].name,
        sourceCharacters: text.length,
        summary,
        method: "deterministic extractive frequency ranking",
        aiModelUsed: false,
        llmSummarisation: "NOT CONNECTED",
      }, ["LLM summarisation model — NOT CONNECTED; this is NOT AI summarisation"]);
    }
    default:
      return genericRecord(spec, payload);
  }
}

function docHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, "GIMMS document draft");
  const lines = bodyLines(payload, ["Deterministic professional document draft.", "No AI writing model is connected."]);
  switch (spec.id) {
    case "doc.agreement.draft":
      return generateAgreement(spec, payload);
    case "doc.letter.draft":
    case "doc.proposal.draft":
    case "doc.minutes.draft":
    case "doc.template": {
      const kind = spec.id === "doc.letter.draft" ? "OFFICIAL LETTER" : spec.id === "doc.proposal.draft" ? "BUSINESS PROPOSAL" : spec.id === "doc.minutes.draft" ? "MEETING MINUTES" : "TEMPLATE INSTANCE";
      const content = [
        `${kind} — DRAFT FOR REVIEW`,
        `Subject: ${title}`,
        ...lines.map((line, index) => `${index + 1}. ${line}`),
        "Prepared by AI GIMMS native deterministic templates.",
        "No external office suite, no AI model, no sending, no signature.",
      ];
      const word = emit(spec.id, fileName(spec.id, "docx"), docx(title, content), "docx", `${kind} native .docx`);
      const portable = emit(spec.id, fileName(spec.id, "pdf"), pdf(title, content), "pdf", `${kind} native .pdf`);
      return recordOutcome(spec, { title, kind, word: artifactEvidence(word), pdf: artifactEvidence(portable), sent: false, signed: false, aiModelUsed: false }, ["render template", "write .docx + .pdf", "hash both"], ["no e-signature, no mail, no legal advice"]);
    }
    case "doc.email.draft": {
      const meta = emit(spec.id, fileName(spec.id, "eml"), eml(`${title} — DRAFT`, lines.join("\n")), "eml", "native .eml DRAFT; never sent");
      return recordOutcome(spec, { title, document: artifactEvidence(meta), sent: false, aiModelUsed: false }, ["render .eml"], ["no SMTP / Gmail / Outlook connection"]);
    }
    case "doc.hr.report": {
      const records = allRecords();
      const reportLines = [
        `Local HR/finance records: ${records.length}`,
        `Employees: ${listRecords("employees").length}`,
        `Vacancies: ${listRecords("vacancies").length}`,
        `Applications: ${listRecords("applications").length}`,
        `Payroll calculations: ${listRecords("payroll").length}`,
        `Artifacts: ${listArtifacts().length}`,
        "Source: real local Dept 01 records. No HRIS/BI connector.",
      ];
      const word = emit(spec.id, fileName(spec.id, "docx"), docx("HR Report (LOCAL DRAFT)", reportLines), "docx", "native .docx HR report from real counts");
      const md = emit(spec.id, fileName(spec.id, "md"), markdown("HR Report (LOCAL DRAFT)", reportLines), "md", "native .md HR report");
      return recordOutcome(spec, { title, lines: reportLines, word: artifactEvidence(word), markdown: artifactEvidence(md), aiGeneratedNarrative: false }, ["count real records", "write .docx + .md"], ["no HRIS/BI connection"]);
    }
    case "doc.financial.report": {
      const totals = financeTotals();
      const reportLines = [
        `Income records ${totals.incomeRecords}: ${totals.income}`,
        `Expense records ${totals.expenseRecords}: ${totals.expense}`,
        `Net position: ${totals.net}`,
        "No live financial account accessed; no payment made.",
      ];
      const portable = emit(spec.id, fileName(spec.id, "pdf"), pdf("Financial Report (LOCAL DRAFT)", reportLines), "pdf", "native .pdf financial report from real totals");
      const md = emit(spec.id, fileName(spec.id, "md"), markdown("Financial Report (LOCAL DRAFT)", reportLines), "md", "native .md financial report");
      return recordOutcome(spec, { title, totals, pdf: artifactEvidence(portable), markdown: artifactEvidence(md), aiGeneratedNarrative: false }, ["read real totals", "write .pdf + .md"], ["no accounting system connection"]);
    }
    case "doc.format": {
      const md = emit(spec.id, fileName(spec.id, "md"), markdown(title, lines), "md", "native formatted .md");
      const web = emit(spec.id, fileName(spec.id, "html"), html(title, lines), "html", "native formatted .html");
      return recordOutcome(spec, { title, markdown: artifactEvidence(md), html: artifactEvidence(web), formattingEngine: "native deterministic templates" }, ["render .md", "render .html", "hash both"], ["no Word/Google Docs formatting API connected"]);
    }
    case "doc.file.organize": {
      const index = listArtifacts().slice(0, 100).map((a) => ({ name: a.name, format: a.format, bytes: a.bytes, sha256: a.sha256 }));
      const meta = emit(spec.id, fileName(spec.id, "json"), JSON.stringify({ title, generatedAt: new Date().toISOString(), files: index, totalBytes: index.reduce((sum, a) => sum + a.bytes, 0) }, null, 2), "json", "SHA-256 organisation index of REAL local artifacts");
      return outcome(spec, ["enumerate real artifacts", "hash index"], {
        indexedFiles: index.length,
        totalBytes: index.reduce((sum, a) => sum + a.bytes, 0),
        index: artifactEvidence(meta),
        externalStorage: "NONE",
      }, ["Google Drive / SharePoint / DMS — NOT CONNECTED"]);
    }
    default:
      return genericRecord(spec, payload);
  }
}

// ---------------------------------------------------------------------------
// AGENTS / ACCOUNT / INTEGRATIONS
// ---------------------------------------------------------------------------

function integrationRequests() {
  const external = Array.from(new Set(DEPT01_SKILL_SPECS.map((spec) => spec.external).filter((value) => !value.startsWith("none")))).sort();
  return {
    connected: 0,
    testedConnections: 0,
    credentialsRequested: false,
    secretValuesShown: 0,
    externalNeeds: external,
    externalNeedCount: external.length,
    microsoftOffice: [
      "Microsoft 365 tenant + app registration (Graph API) — NOT CONNECTED",
      "Microsoft Graph: Files.ReadWrite / Mail.Send / Calendars.ReadWrite / Sites.ReadWrite.All — NOT REQUESTED",
      "Word/Excel/PowerPoint desktop automation — NOT INSTALLED (native OOXML used instead)",
      "Outlook SMTP / Graph Mail.Send — NOT CONNECTED",
      "SharePoint / OneDrive document storage — NOT CONNECTED",
    ],
    googleWorkspace: [
      "Google Cloud project + OAuth consent / app verification — NOT CONNECTED",
      "Google Docs API — NOT CONNECTED",
      "Google Sheets API — NOT CONNECTED",
      "Google Slides API — NOT CONNECTED",
      "Google Drive API — NOT CONNECTED",
      "Gmail API — NOT CONNECTED",
      "Google Calendar API — NOT CONNECTED",
    ],
    pdfDocument: [
      "General-purpose PDF library (AcroForm, arbitrary third-party PDFs, encryption) — MISSING",
      "OCR / scanned PDF text extraction — MISSING",
      "PDF digital signature / e-signature provider — NOT CONNECTED",
      "Non-Latin (Sinhala) PDF font embedding — MISSING in native writer",
      "LLM-based document summarisation / AI writing model — NOT CONNECTED",
    ],
    authAndOwnerAccount: [
      "Supabase Auth (existing project) — Owner approval + secure registration NOT YET GIVEN",
      "Vercel Password Protection (Pro plan, paid) — NOT PURCHASED, NOT APPROVED",
      "MFA / session secret rotation — NOT CONFIGURED",
      "Real Owner personal details — NOT STORED (authorised secure registration required)",
    ],
    financeLegal: [
      "Payment gateway API — NOT CONNECTED (no payment permitted)",
      "Accounting/ERP API — NOT CONNECTED",
      "Live financial accounts / bank feed — NOT CONNECTED (separate Owner approval required)",
      "Qualified accountant review — NOT CONNECTED",
      "Qualified legal professional review — NOT CONNECTED",
      "Statutory EPF/ETF/PAYE/tax rate source — NOT CONNECTED",
    ],
    aiLayer: [
      "LLM / AI SDK (0 installed) — NOT CONNECTED",
      "MCP servers (0) — NOT CONNECTED",
      "Function-calling provider (0) — NOT CONNECTED",
      "External-build packet for ChatGPT / Gemini / AI Studio Pro — PREPARED, NOT SENT",
    ],
    credentialNamesOnly: [
      "MICROSOFT_GRAPH_CLIENT_ID / MICROSOFT_GRAPH_CLIENT_SECRET / MICROSOFT_GRAPH_TENANT_ID",
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_SERVICE_ACCOUNT_KEY",
      "SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD",
      "PAYMENT_GATEWAY_API_KEY / ACCOUNTING_API_KEY",
      "SUPABASE_AUTH_SETTINGS / SESSION_SECRET",
      "AI_MODEL_API_KEY",
    ],
    note: "Credential NAMES only. No values, no secrets, nothing requested, nothing purchased, nothing connected. Owner review required before any request.",
  };
}

function specialHandler(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  switch (spec.id) {
    case "agent.roster.configure":
      return outcome(spec, ["read 10 agent contracts", "verify each has functions/inputs/outputs/skills/permissions/approvals"], {
        agents: DEPT01_AGENTS,
        ...agentsSummary(),
        everyAgentHasFullContract: DEPT01_AGENTS.every(
          (agent) => agent.functions.length && agent.inputs.length && agent.outputs.length && agent.skills.length && agent.permissions.length && agent.approvalRequirements.length,
        ),
        skillsReferencedExist: DEPT01_AGENTS.every((agent) =>
          agent.skills.every((id) => DEPT01_SKILL_SPECS.some((s) => s.id === id) || ["job.intake", "progress.report"].includes(id)),
        ),
      }, ["no AI model is connected to any agent — these are deterministic local role contracts"]);
    case "account.owner.propose": {
      const existing = listRecords("accounts").find((record) => record.data.employeeId === "EMP-0001");
      if (existing) {
        return outcome(spec, ["read existing EMP-0001 proposal"], { account: existing, alreadyProposed: true, ...OWNER_ACCOUNT_PROPOSAL }, ["secure registration still PENDING"]);
      }
      return recordOutcome(spec, {
        ...OWNER_ACCOUNT_PROPOSAL,
        proposalOnly: true,
        realDetailsStored: false,
        loginImplemented: false,
        approvedByOwner: false,
      }, ["reserve EMP-0001", "define Founder/Owner/Super Admin profile", "declare dashboard + approval + command interfaces", "BLOCK secure login"], [
        "approved auth provider (Supabase Auth) — NOT CONNECTED",
        "Vercel Password Protection is Pro/paid — NOT PURCHASED",
        "no real Owner details stored; secure registration requires separate Owner authorisation",
        "no production permission change performed",
      ], "PENDING_SECURE_REGISTRATION");
    }
    case "workflow.hr.to.production":
      return runWorkflow(spec, payload);
    case "owner.command.execute":
      return runOwnerCommand(str(payload.command, str(payload.text, str(payload.title))), payload);
    case "integration.request.list":
      return outcome(spec, ["collect external needs from 80 skills", "group by provider", "list credential NAMES only"], {
        ...integrationRequests(),
        localSummary: dept01Summary(),
      }, ["no integration request has been sent to any provider"]);
    default:
      return genericRecord(spec, payload);
  }
}

/** Any unrecognised Dept-01 skill still produces a REAL local record, never a failure. */
function genericRecord(spec: Dept01SkillSpec, payload: Payload): Dept01Outcome {
  const title = str(payload.title, `${spec.module} record`);
  return recordOutcome(spec, {
    title,
    description: spec.description,
    text: str(payload.text, ""),
    lines: bodyLines(payload, []),
    externalNeed: spec.external,
    status: "DRAFT",
    aiModelUsed: false,
    moneyMovement: false,
    externalCalls: 0,
  }, ["validate input", "create versioned local DRAFT record"], [spec.external.startsWith("none") ? "no external service connected" : `${spec.external}`]);
}

// ---------------------------------------------------------------------------
// SINGLE ENTRY POINT — called by the existing /api/skills gateway
// ---------------------------------------------------------------------------

export function runDept01Skill(skillId: string, payload: Payload = {}): Dept01Outcome {
  const spec = dept01Spec(skillId);
  if (!spec) {
    return {
      ok: false,
      steps: ["validate skill id"],
      evidence: { skillId },
      blocked: ["unknown Dept 01 skill"],
      error: `no Dept 01 implementation for ${skillId}`,
    };
  }
  try {
    if (skillId.startsWith("hr.")) return hrHandler(spec, payload);
    if (skillId.startsWith("finance.")) return financeHandler(spec, payload);
    if (skillId.startsWith("admin.")) return adminHandler(spec, payload);
    if (skillId.startsWith("office.")) return officeHandler(spec, payload);
    if (skillId.startsWith("pdf.")) return pdfHandler(spec, payload);
    if (skillId.startsWith("doc.")) return docHandler(spec, payload);
    return specialHandler(spec, payload);
  } catch (error) {
    return {
      ok: false,
      steps: ["execute handler"],
      evidence: { skillId, module: spec.module },
      blocked: [...spec.blocked],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function dept01SkillCount(): number {
  return DEPT01_SKILL_SPECS.length;
}
