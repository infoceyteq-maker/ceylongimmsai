/**
 * GIMMS P1-01 — Dept 01 (HR, Finance & Administration) skill catalogue.
 *
 * Pure DATA. No imports, so lib/departments.ts and lib/skills.ts can both reuse
 * this single source of truth without a circular dependency.
 *
 * HONESTY: every id below is a NATIVE, deterministic, credential-free local routine.
 * None is a Microsoft Office / Google Workspace / AI-model connection. External
 * services are named only in `external` as NOT CONNECTED requirements.
 */

export type Dept01SkillSpec = {
  id: string;
  module: string;
  kind: "check" | "draft";
  description: string;
  collection: string;
  blocked: string[];
  external: string;
};

type Row = [id: string, module: string, kind: "check" | "draft", description: string, collection: string, external?: string];

const DEFAULT_EXTERNAL = "none — native local routine";

const ROWS: Row[] = [
  // ---- 1. HUMAN RESOURCES -------------------------------------------------
  ["hr.employee.register", "Human Resources", "draft", "Employee registration and profile record", "employees"],
  ["hr.recruitment.vacancy", "Human Resources", "draft", "Recruitment and job vacancy record", "vacancies"],
  ["hr.application.screen", "Human Resources", "check", "Job application and deterministic CV keyword screening (no AI model)", "applications"],
  ["hr.interview.schedule", "Human Resources", "draft", "Interview scheduling with real conflict detection", "interviews"],
  ["hr.onboarding.plan", "Human Resources", "draft", "Employee onboarding checklist", "onboarding"],
  ["hr.offboarding.plan", "Human Resources", "draft", "Employee offboarding checklist", "offboarding"],
  ["hr.employee.id", "Human Resources", "check", "Employee ID allocation and sequence check (EMP-0001 reserved)", "employeeIds"],
  ["hr.attendance.record", "Human Resources", "draft", "Attendance record with computed hours", "attendance"],
  ["hr.leave.record", "Human Resources", "draft", "Leave record with computed day balance", "leave"],
  ["hr.payroll.calculate", "Human Resources", "check", "Payroll arithmetic on supplied numbers only; no payment, no statutory rates invented", "payroll"],
  ["hr.performance.review", "Human Resources", "draft", "Employee performance review record", "performance"],
  ["hr.training.record", "Human Resources", "draft", "Staff training and skills record", "training"],
  ["hr.contract.draft", "Human Resources", "draft", "Employment agreement DRAFT (no signing, no legal advice)", "contracts", "e-signature service — NOT CONNECTED"],
  ["hr.roles.permissions", "Human Resources", "check", "Staff roles and least-privilege permission matrix", "permissions"],
  ["hr.document.register", "Human Resources", "draft", "Employee document register entry", "hrDocuments"],
  ["hr.report.generate", "Human Resources", "check", "HR report from real local record counts", "hrReports"],

  // ---- 2. FINANCE & ACCOUNTING -------------------------------------------
  ["finance.income.record", "Finance & Accounting", "draft", "Income / revenue record", "income", "accounting API — NOT CONNECTED"],
  ["finance.expense.record", "Finance & Accounting", "draft", "Expense / cost record with explicit approval scope", "expenses", "accounting API — NOT CONNECTED"],
  ["finance.budget.create", "Finance & Accounting", "draft", "Company or department budget record", "budgets"],
  ["finance.budget.variance", "Finance & Accounting", "check", "Budget-versus-actual variance from real local records", "budgets"],
  ["finance.receivable.register", "Finance & Accounting", "draft", "Outstanding payment / receivable register", "receivables"],
  ["finance.ar.aging", "Finance & Accounting", "check", "Receivables aging buckets from due dates", "receivables"],
  ["finance.payable.register", "Finance & Accounting", "draft", "Accounts payable record", "payables"],
  ["finance.invoice.draft", "Finance & Accounting", "draft", "Invoice DRAFT with computed line totals", "invoices", "accounting API — NOT CONNECTED"],
  ["finance.quotation.draft", "Finance & Accounting", "draft", "Quotation DRAFT with computed line totals", "quotations"],
  ["finance.payment.request", "Finance & Accounting", "draft", "Payment / payout REQUEST only — execution blocked", "paymentRequests", "payment gateway API — NOT CONNECTED"],
  ["finance.report.generate", "Finance & Accounting", "check", "Financial report from real local income/expense records", "financialReports"],
  ["finance.cashflow.statement", "Finance & Accounting", "check", "Cash flow statement from real local records", "financialReports"],
  ["finance.pl.statement", "Finance & Accounting", "check", "Profit and loss statement from real local records", "financialReports"],
  ["finance.reminder.draft", "Finance & Accounting", "draft", "Payment reminder DRAFT — never sent", "reminders", "SMTP / email API — NOT CONNECTED"],
  ["finance.document.generate", "Finance & Accounting", "draft", "Financial document generation (native PDF)", "financialDocuments"],
  ["finance.tax.support", "Finance & Accounting", "check", "Tax/accounting documentation checklist only — no tax advice", "taxDocuments", "qualified accountant review — NOT CONNECTED"],

  // ---- 3. ADMINISTRATION & OFFICE MANAGEMENT ------------------------------
  ["admin.office.record", "Administration", "draft", "Office administration record", "officeAdmin"],
  ["admin.document.register", "Administration", "draft", "Company document management register", "companyDocuments"],
  ["admin.communication.draft", "Administration", "draft", "Internal communication DRAFT — never sent", "communications", "SMTP / chat API — NOT CONNECTED"],
  ["admin.meeting.schedule", "Administration", "draft", "Meeting and scheduling record with conflict detection", "meetings"],
  ["admin.task.create", "Administration", "draft", "Office task record", "officeTasks"],
  ["admin.asset.register", "Administration", "draft", "Asset and equipment register", "assets"],
  ["admin.branch.register", "Administration", "draft", "Branch administration record", "branches"],
  ["admin.policy.register", "Administration", "draft", "Company policy version record", "policies"],
  ["admin.legal.coordinate", "Administration", "draft", "Legal document coordination — qualified review required", "legalDocuments", "qualified legal professional — NOT CONNECTED"],
  ["admin.contract.register", "Administration", "draft", "Company contract / agreement register", "contracts"],
  ["admin.letter.draft", "Administration", "draft", "Official letter and report DRAFT", "letters"],
  ["admin.template.register", "Administration", "draft", "Document template register entry", "templates"],
  ["admin.approval.workflow", "Administration", "check", "Approval workflow request — owner approval stays PENDING", "approvals"],

  // ---- 4. MICROSOFT OFF-STYLE NATIVE FILE GENERATION ----------------------
  ["office.word.create", "Office Software", "draft", "Native .docx (OOXML) creation — Microsoft Word NOT connected", "documents", "Microsoft Word / Microsoft 365 — NOT CONNECTED"],
  ["office.word.edit", "Office Software", "draft", "Native .docx regeneration from edited GIMMS-owned content", "documents", "Microsoft Word — NOT CONNECTED"],
  ["office.excel.create", "Office Software", "draft", "Native .xlsx (OOXML) with real formulas and cached values", "documents", "Microsoft Excel — NOT CONNECTED"],
  ["office.powerpoint.create", "Office Software", "draft", "Native .pptx (OOXML) package — Microsoft PowerPoint NOT connected", "documents", "Microsoft PowerPoint — NOT CONNECTED"],
  ["office.outlook.email.draft", "Office Software", "draft", "Native .eml email DRAFT — Outlook NOT connected, never sent", "documents", "Microsoft Outlook / Graph API — NOT CONNECTED"],
  ["office.outlook.calendar.draft", "Office Software", "draft", "Native .ics calendar DRAFT — Outlook NOT connected", "documents", "Microsoft Outlook / Graph API — NOT CONNECTED"],
  ["office.google.docs.draft", "Google Workspace", "draft", "Native .md + .docx-equivalent DRAFT — Google Docs NOT connected", "documents", "Google Docs API — NOT CONNECTED"],
  ["office.google.sheets.draft", "Google Workspace", "draft", "Native .csv / .xlsx DRAFT — Google Sheets NOT connected", "documents", "Google Sheets API — NOT CONNECTED"],
  ["office.google.slides.draft", "Google Workspace", "draft", "Native .pptx DRAFT — Google Slides NOT connected", "documents", "Google Slides API — NOT CONNECTED"],
  ["office.google.drive.draft", "Google Workspace", "draft", "Local file-organisation index DRAFT — Google Drive NOT connected", "documents", "Google Drive API — NOT CONNECTED"],
  ["office.google.gmail.draft", "Google Workspace", "draft", "Native .eml DRAFT — Gmail NOT connected, never sent", "documents", "Gmail API — NOT CONNECTED"],
  ["office.google.calendar.draft", "Google Workspace", "draft", "Native .ics DRAFT — Google Calendar NOT connected", "documents", "Google Calendar API — NOT CONNECTED"],

  // ---- 4b. PDF MANAGEMENT ------------------------------------------------
  ["pdf.create", "PDF Management", "draft", "Native PDF creation with real xref table", "documents"],
  ["pdf.edit", "PDF Management", "draft", "Native PDF editing for GIMMS-generated PDFs", "documents", "arbitrary third-party PDF parsing — MISSING"],
  ["pdf.convert", "PDF Management", "draft", "Native conversion between GIMMS-owned docx/xlsx/pdf/txt", "documents", "general document conversion library — MISSING"],
  ["pdf.merge", "PDF Management", "draft", "Native merge of GIMMS-generated PDFs only", "documents", "general PDF library — MISSING"],
  ["pdf.split", "PDF Management", "draft", "Native split of GIMMS-generated PDFs only", "documents", "general PDF library — MISSING"],
  ["pdf.form.fill", "PDF Management", "draft", "Flat PDF form fill from a field/value map (not AcroForm)", "documents", "AcroForm / PDF library — MISSING"],
  ["pdf.text.extract", "PDF Management", "check", "Text extraction from GIMMS-generated PDFs", "documents", "OCR / scanned PDF — MISSING"],
  ["pdf.summarize", "PDF Management", "check", "Deterministic extractive summary (NOT an AI model)", "documents", "LLM summarisation model — NOT CONNECTED"],

  // ---- 4c. AI WRITING & OFFICE AUTOMATION (deterministic templates) ------
  ["doc.letter.draft", "Document Automation", "draft", "Professional letter template DRAFT", "documents"],
  ["doc.proposal.draft", "Document Automation", "draft", "Business proposal template DRAFT", "documents"],
  ["doc.agreement.draft", "Document Automation", "draft", "Employment agreement template DRAFT (no legal advice)", "documents"],
  ["doc.hr.report", "Document Automation", "draft", "HR report document from real local counts", "documents"],
  ["doc.financial.report", "Document Automation", "draft", "Financial report document from real local records", "documents"],
  ["doc.minutes.draft", "Document Automation", "draft", "Meeting minutes template DRAFT", "documents"],
  ["doc.email.draft", "Document Automation", "draft", "Business email DRAFT — never sent", "documents"],
  ["doc.format", "Document Automation", "draft", "Document formatting to .md / .html", "documents"],
  ["doc.template", "Document Automation", "draft", "Document template instance generation", "documents"],
  ["doc.file.organize", "Document Automation", "check", "SHA-256 file organisation index of real artifacts", "documents"],

  // ---- 5/6/7. AGENTS, ACCOUNT, WORKFLOW, INTEGRATIONS --------------------
  ["agent.roster.configure", "Department AI Agents", "check", "Configure 10 role-based agent records (no AI model connected)", "agents"],
  ["account.owner.propose", "Owner & Employee Account", "draft", "Proposed EMP-0001 account — secure registration PENDING, no real details stored", "accounts", "approved auth provider (Supabase Auth) — NOT CONNECTED"],
  ["workflow.hr.to.production", "Cross-department Workflow", "draft", "Real HR→Management→Production job chain with QA and PENDING owner approval", "workflows"],
  ["owner.command.execute", "Owner Command Interface", "draft", "Deterministic local Owner command parser (NOT an AI model)", "commands"],
  ["integration.request.list", "Integration Requests", "check", "List missing integrations and credential NAME lists for Owner review", "integrationRequests"],
];

const BASE_BLOCKED = "native local routine only — no external service is connected";

export const DEPT01_SKILL_SPECS: Dept01SkillSpec[] = ROWS.map(
  ([id, module, kind, description, collection, external]) => ({
    id,
    module,
    kind,
    description,
    collection,
    external: external ?? DEFAULT_EXTERNAL,
    blocked: [
      BASE_BLOCKED,
      "no payment / payroll execution / e-signature / legal advice / public posting / deploy",
    ],
  }),
);

export const DEPT01_SKILL_IDS_LIST: string[] = DEPT01_SKILL_SPECS.map((spec) => spec.id);
export const DEPT01_SKILL_IDS: Set<string> = new Set(DEPT01_SKILL_IDS_LIST);
export const DEPT01_CHECK_IDS: Set<string> = new Set(
  DEPT01_SKILL_SPECS.filter((spec) => spec.kind === "check").map((spec) => spec.id),
);
export const DEPT01_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  DEPT01_SKILL_SPECS.map((spec) => [spec.id, spec.description]),
);
export const DEPT01_MODULES: string[] = Array.from(new Set(DEPT01_SKILL_SPECS.map((spec) => spec.module)));
export function dept01Spec(id: string): Dept01SkillSpec | undefined {
  return DEPT01_SKILL_SPECS.find((spec) => spec.id === id);
}
