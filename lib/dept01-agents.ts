/**
 * GIMMS P1-01 — 10 ROLE-BASED AGENTS + proposed EMP-0001 Owner account.
 *
 * HONESTY: these are DETERMINISTIC LOCAL AGENT RECORDS (function/input/output/
 * skill/permission/approval contracts), NOT autonomous AI models. No LLM, no
 * function-calling provider, no AI SDK and no MCP server is connected in this
 * repository. `modelConnected: false` on every agent is intentional.
 *
 * The 6 existing production `hub_state.agents` persona records are NOT modified
 * or duplicated here — this is Dept 01's own role structure, stored locally.
 */

import { DEPT01_SKILL_IDS_LIST } from "@/lib/dept01-catalog";

export type Dept01Agent = {
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
  modelConnected: false;
  status: "CONFIGURED_LOCAL_NO_MODEL";
  department: "01";
};

const A = (
  id: string,
  name: string,
  division: string,
  jobRole: string,
  functions: string[],
  inputs: string[],
  outputs: string[],
  skills: string[],
  permissions: string[],
  approvalRequirements: string[],
): Dept01Agent => ({
  id,
  name,
  division,
  jobRole,
  functions,
  inputs,
  outputs,
  skills,
  permissions,
  approvalRequirements,
  modelConnected: false,
  status: "CONFIGURED_LOCAL_NO_MODEL",
  department: "01",
});

export const DEPT01_AGENTS: Dept01Agent[] = [
  A(
    "agent-hr-manager",
    "HR Manager",
    "Human Resources",
    "HR Manager",
    ["Maintain employee master records", "Approve HR policy rollout", "Review HR reports", "Authorise role/permission changes"],
    ["Employee registration payload", "HR report request", "Role change request"],
    ["Employee record", "HR report", "Permission matrix"],
    ["hr.employee.register", "hr.report.generate", "hr.roles.permissions", "hr.document.register"],
    ["hr.records.read", "hr.records.write", "hr.reports.read", "hr.permissions.review"],
    ["Role/permission changes require explicit Owner decision", "No real personal data without Owner-authorised secure registration"],
  ),
  A(
    "agent-recruitment",
    "Recruitment Agent",
    "Recruitment & Talent",
    "Recruitment Specialist",
    ["Open vacancies", "Register applications", "Deterministic CV keyword screening", "Schedule interviews with conflict checks"],
    ["Vacancy payload", "Application/CV text", "Interview slot"],
    ["Vacancy record", "Screening score", "Interview record"],
    ["hr.recruitment.vacancy", "hr.application.screen", "hr.interview.schedule"],
    ["recruitment.read", "recruitment.write", "cv.text.read"],
    ["No hiring decision is made automatically", "No candidate outreach — no email/ATS service connected", "Screening is keyword matching, not an AI hiring model"],
  ),
  A(
    "agent-employee-admin",
    "Employee Administration Agent",
    "Employee Administration",
    "Employee Administration Officer",
    ["Employee IDs", "Attendance", "Leave balances", "Onboarding/offboarding checklists", "Training records"],
    ["Employee ID request", "Attendance times", "Leave dates", "Training payload"],
    ["Employee ID allocation", "Attendance record", "Leave record", "Checklists"],
    ["hr.employee.id", "hr.attendance.record", "hr.leave.record", "hr.onboarding.plan", "hr.offboarding.plan", "hr.training.record", "hr.performance.review"],
    ["employee.read", "employee.write", "attendance.read", "leave.read"],
    ["Final leave approval requires a human HR Manager / Owner decision"],
  ),
  A(
    "agent-payroll",
    "Payroll Agent",
    "Payroll",
    "Payroll Officer",
    ["Compute payroll arithmetic from supplied numbers", "Prepare payroll sheets in .xlsx", "Flag statutory-rate gaps"],
    ["Basic salary", "Allowances", "Deductions", "Pay period"],
    ["Payroll calculation record", "Payroll .xlsx"],
    ["hr.payroll.calculate", "doc.financial.report", "office.excel.create"],
    ["payroll.read", "payroll.calculate", "payroll.document.write"],
    ["NO payment execution — moneyMovement is always false", "Statutory EPF/ETF/tax rates are NOT invented; qualified accountant review required", "Payroll run requires explicit Owner authorisation before any LIVE execution"],
  ),
  A(
    "agent-finance-accounting",
    "Finance & Accounting Agent",
    "Finance & Accounting",
    "Finance & Accounting Officer",
    ["Record income/expenses", "Draft invoices/quotations", "Generate P&L, cash flow and financial reports", "Tax documentation checklist"],
    ["Income/expense payload", "Invoice lines", "Report period"],
    ["Income/expense records", "Invoice DRAFT", "P&L / cash flow / financial report"],
    ["finance.income.record", "finance.expense.record", "finance.invoice.draft", "finance.quotation.draft", "finance.report.generate", "finance.cashflow.statement", "finance.pl.statement", "finance.document.generate", "finance.tax.support", "doc.financial.report"],
    ["finance.records.read", "finance.records.write", "finance.reports.read"],
    ["Every financial transaction requires appropriate authorisation", "No live financial account, no accounting API, no payment", "No tax advice — qualified accountant required"],
  ),
  A(
    "agent-budgeting",
    "Budgeting Agent",
    "Budgeting",
    "Budget Analyst",
    ["Create budgets", "Compute budget-vs-actual variance from real local records"],
    ["Budget amount", "Cost centre", "Period"],
    ["Budget record", "Variance report"],
    ["finance.budget.create", "finance.budget.variance"],
    ["budget.read", "budget.write", "budget.variance.read"],
    ["Budget release requires Owner authorisation", "No funds are committed or spent"],
  ),
  A(
    "agent-outstanding-invoicing",
    "Outstanding & Invoicing Agent",
    "Outstanding & Invoicing",
    "Receivables Officer",
    ["Register receivables/payables", "Age receivables", "Draft payment reminders (never sent)"],
    ["Invoice amount", "Due date", "Customer reference"],
    ["Receivable/payable record", "Aging buckets", "Reminder DRAFT"],
    ["finance.receivable.register", "finance.ar.aging", "finance.payable.register", "finance.reminder.draft", "finance.payment.request"],
    ["receivables.read", "receivables.write", "reminder.draft"],
    ["Reminders are DRAFTS — no email/SMTP connected", "Payment requests stay PENDING_OWNER_AUTHORIZATION", "No dunning, no payment collection, no money movement"],
  ),
  A(
    "agent-office-administrator",
    "Office Administrator",
    "Office Administration",
    "Office Administrator",
    ["Office records", "Company documents", "Meetings", "Tasks", "Assets", "Branches", "Policies", "Internal comms", "Approval workflow"],
    ["Office/admin payload", "Meeting slot", "Asset details"],
    ["Office records", "Meeting .ics", "Approval request"],
    ["admin.office.record", "admin.document.register", "admin.communication.draft", "admin.meeting.schedule", "admin.task.create", "admin.asset.register", "admin.branch.register", "admin.policy.register", "admin.approval.workflow", "admin.template.register"],
    ["admin.read", "admin.write", "meeting.draft", "approval.request"],
    ["Communications are DRAFTS, never sent", "Owner approval for policy publication", "No external chat/email service"],
  ),
  A(
    "agent-document-pdf",
    "Document & PDF Agent",
    "Document Management",
    "Document Controller",
    ["Create .docx/.xlsx/.pptx/.pdf/.eml/.ics", "PDF edit/convert/merge/split/form-fill/extract/summarise", "Letters, proposals, minutes, reports, templates, file index"],
    ["Document template payload", "Source artifact names", "Field/value map"],
    ["Real local files with SHA-256", "Extraction text", "Deterministic summary"],
    DEPT01_SKILL_IDS_LIST.filter((id) => /^(office|pdf|doc)\./.test(id)),
    ["documents.read", "documents.write", "artifacts.read"],
    ["No document is emailed, uploaded, signed or published", "Microsoft Office / Google Workspace / Outlook / Gmail / Drive NOT connected", "Third-party/scanned PDF, OCR and AcroForm handling are MISSING"],
  ),
  A(
    "agent-legal-documentation",
    "Legal Documentation Coordinator",
    "Legal Documentation",
    "Legal Documentation Coordinator",
    ["Register legal documents", "Coordinate contract records", "Prepare agreement DRAFTS", "Route qualified review"],
    ["Contract payload", "Agreement parties", "Review request"],
    ["Legal coordination record", "Agreement DRAFT", "Review checklist"],
    ["admin.legal.coordinate", "admin.contract.register", "admin.letter.draft", "hr.contract.draft", "doc.agreement.draft"],
    ["legal.read", "legal.draft", "legal.coordinate"],
    ["NO legal advice is given", "No e-signature service connected", "Qualified legal professional review required before execution", "No contract is executed or sent"],
  ),
];

/** EMP-0001 — PROPOSAL ONLY. No real Owner name/email/credentials stored. */
export const OWNER_ACCOUNT_PROPOSAL = {
  employeeId: "EMP-0001",
  status: "PENDING_SECURE_REGISTRATION",
  title: "Founder / Owner / Super Admin",
  department: "01",
  profile: {
    displayName: "[NOT SET — requires Owner-authorised secure registration]",
    email: "[NOT SET — no real Owner details stored]",
    phone: "[NOT SET]",
    realDetailsStored: false,
  },
  secureLogin: {
    implemented: false,
    status: "BLOCKED — needs Owner-approved auth provider + credentials",
    candidate: "Supabase Auth (existing project) OR Vercel Password Protection (Pro plan, paid)",
    credentialsRequested: false,
    mfaRequired: true,
    sessionSecretsStored: false,
  },
  departmentAccess: ["01", "02", "03", "04", "05", "09", "10"],
  ownerDashboard: "app/departments/01 (local, credential-free, no production access)",
  approvalPermissions: ["approve.record.version", "reject.record.version", "authorise.workflow.final", "request.integration"],
  aiCommandInterface: "owner.command.execute — deterministic local parser, NOT an AI model",
  guardrails: [
    "no real personal data until authorised secure registration",
    "no live financial accounts, no payments, no payroll execution",
    "no production deploy, no permission changes on live systems",
    "every financial/legal action requires explicit, versioned Owner decision",
  ],
};

export function agentsSummary() {
  return {
    total: DEPT01_AGENTS.length,
    configured: DEPT01_AGENTS.length,
    modelConnected: DEPT01_AGENTS.filter((a) => a.modelConnected).length,
    ids: DEPT01_AGENTS.map((a) => a.id),
    note: "Deterministic local role contracts only — 0 AI models connected",
  };
}
