/**
 * GIMMS P1-01 — REAL LOCAL verification.
 *
 * Runs against a locally started dev server (BASE). No deploy, no external API,
 * no purchase, no production data change, no payment, no credentials.
 * Writes dept01-verification.txt with real evidence.
 *
 * Usage: node scripts/verify-dept01.mjs  (then the file is written)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const OUT = path.join(process.cwd(), "dept01-verification.txt");
const lines = [];
let PASS = 0;
let FAIL = 0;

function log(text = "") {
  lines.push(text);
  console.log(text);
}
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (ok) PASS += 1;
  else FAIL += 1;
  log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
}

async function req(target, options = {}) {
  const response = await fetch(BASE + target, options);
  const raw = await response.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    /* non-JSON response */
  }
  return { status: response.status, json, raw, headers: response.headers };
}
const get = (target) => req(target, { cache: "no-store" });
const post = (target, body) =>
  req(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const PY_ZIP = `
import sys, zipfile, json
import xml.etree.ElementTree as ET
p = sys.argv[1]
sel = sys.argv[2] if len(sys.argv) > 2 else ""
z = zipfile.ZipFile(p)
names = z.namelist()
bad = z.testzip()
parsed = []
for n in names:
    if n.endswith('.xml') or n.endswith('.rels'):
        ET.fromstring(z.read(n))
        parsed.append(n)
content = z.read(sel).decode('utf8') if sel in names else ''
print(json.dumps({'parts': len(names), 'bad': bad, 'parsed': len(parsed), 'names': names, 'selected': content[:6000]}))
`;

async function download(name) {
  const response = await fetch(`${BASE}/api/dept01/artifact?name=${encodeURIComponent(name)}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, contentType: response.headers.get("content-type") || "", buffer };
}
async function ooxml(name, part = "") {
  const file = await download(name);
  const temp = path.join(os.tmpdir(), `gimms-verify-${path.basename(name)}`);
  fs.writeFileSync(temp, file.buffer);
  const output = execFileSync("python3", ["-c", PY_ZIP, temp, part], { encoding: "utf8" });
  return { ...JSON.parse(output.trim()), http: file.status, contentType: file.contentType, bytes: file.buffer.length };
}

const OWNER_COMMAND =
  "GIMMS, create a new employee record, prepare an employment agreement in Word and PDF, create a payroll sheet in Excel, register an approved office expense, and assign a website development job to Production through Management.";

async function main() {
  log(`DEPT01_BASE=${BASE}`);
  log(`DEPT01_STAMP=${STAMP}`);
  log("SCOPE=local credential-free P1-01 implementation; no deploy, no credentials, no payments");
  log("");

  // ------------------------------------------------------------------ pages
  log("--- 15 pages (14 existing + /departments/01) ---");
  const PAGES = [
    "/", "/tasks", "/approvals", "/clients", "/agents", "/departments",
    "/departments/01", "/status", "/research", "/publishing", "/audience",
    "/connections", "/callcenter", "/memory", "/production",
  ];
  let pages200 = 0;
  for (const page of PAGES) {
    const result = await get(page);
    log(`${page} ${result.status}`);
    if (result.status === 200) pages200 += 1;
  }
  check("all 15 pages return HTTP 200", pages200 === 15, `pages200=${pages200}`);
  log("");

  // --------------------------------------------------------------- registry
  log("--- registry preserved ---");
  const deptRes = await get("/api/departments");
  const dept01 = (deptRes.json.departments || []).find((d) => d.id === "01");
  log(`registry_summary=${JSON.stringify(deptRes.json.summary)}`);
  check("10 departments / 7 active / 3 deferred", deptRes.json.summary?.total === 10 && deptRes.json.summary?.active === 7 && deptRes.json.summary?.deferred === 3);
  check("69 divisions / 156 roles unchanged", deptRes.json.summary?.divisions === 69 && deptRes.json.summary?.roles === 156);
  check("Dept 01 has 83 local skills (3 original + 80 new)", dept01?.safeSkills?.length === 83, `safeSkills=${dept01?.safeSkills?.length}`);
  check("Dept 01 external needs all NOT CONNECTED", dept01?.externalNeedsConnected === 0, `externalNeeds=${dept01?.externalNeeds?.length}`);
  log("");

  // ----------------------------------------------------------- skills catalogue
  log("--- single skills gateway ---");
  const skillsRes = await get("/api/skills");
  const allSkills = skillsRes.json.skills || [];
  const dept01Skills = allSkills.filter((s) => s.departmentId === "01");
  log(`skills_summary=${JSON.stringify(skillsRes.json.summary)}`);
  check("skill catalogue > 100 skills behind one gateway", allSkills.length >= 114, `total=${allSkills.length}`);
  const newSkillCount = dept01Skills.filter((s) => /^(hr|finance|admin|office|pdf|doc|agent|account|workflow|owner|integration)\./.test(s.id)).length;
  check("exactly 80 new P1-01 skills declared behind the same gateway", newSkillCount === 80, `newSkills=${newSkillCount}`);
  check("requiresExternal stays 0", skillsRes.json.summary?.requiresExternal === 0);
  log("");

  // ---------------------------------------------- execute EVERY declared skill
  log("--- execute EVERY declared skill with a generic payload (real work, evidence hashes) ---");
  const harness = await post("/api/jobs", { action: "create", title: `P1-01 skill harness ${STAMP}`, departmentId: "10" });
  const harnessJobId = harness.json.job?.jobId || "";
  log(`skill_harness_job_id=${harnessJobId}`);
  const genericPayload = {
    title: `P1-01 verification ${STAMP}`,
    text: "Market research report on competitor pricing",
    sources: [{ name: "Master Architecture v1.3", url: "" }],
    lines: [{ description: "QA item", qty: 2, unitPrice: 5 }],
    jobId: harnessJobId,
    to: "REVIEW",
  };
  let skillOk = 0;
  let skillFail = 0;
  const failures = [];
  for (const skill of allSkills) {
    const result = await post("/api/skills", { skillId: skill.id, payload: genericPayload });
    if (result.json.ok === true) skillOk += 1;
    else {
      skillFail += 1;
      failures.push(`${skill.id}:${result.status}:${result.json.error || "unknown"}`);
    }
    log(`skill ${skill.id} ok=${result.json.ok === true} sha=${String(result.json.sha256 || "").slice(0, 16)}`);
  }
  log(`skill_executed_ok=${skillOk}`);
  log(`skill_failed=${skillFail}`);
  if (failures.length) log(`failures=${JSON.stringify(failures)}`);
  check("every declared skill executed successfully", skillFail === 0, `ok=${skillOk} failed=${skillFail}`);
  log("");

  // ------------------------------------------------------------- HR deep tests
  log("--- HR: real records and computations ---");
  const employee = await post("/api/skills", { skillId: "hr.employee.register", payload: { title: "Synthetic employee", name: "Test Employee (synthetic)", role: "Officer" } });
  const employeeId = employee.json.evidence?.employeeId;
  log(`employee_id=${employeeId} persisted=${employee.json.evidence?.persisted}`);
  check("employee registered with sequential ID, EMP-0001 reserved", /^EMP-\d{4}$/.test(String(employeeId)) && employeeId !== "EMP-0001");
  const idCheck = await post("/api/skills", { skillId: "hr.employee.id", payload: { title: "id check" } });
  check("employee ID sequence is valid", idCheck.json.evidence?.sequenceValid === true, JSON.stringify(idCheck.json.evidence?.allocatedIds));

  const screening = await post("/api/skills", {
    skillId: "hr.application.screen",
    payload: { title: "CV screen", cvText: "Candidate has typescript, next.js, testing and documentation experience.", requiredSkills: ["typescript", "next.js", "testing", "documentation"] },
  });
  log(`cv_match_score=${screening.json.evidence?.matchScore} modelUsed=${screening.json.evidence?.modelUsed}`);
  check("CV screening is deterministic keyword matching (not an AI model)", screening.json.evidence?.matchScore === 100 && screening.json.evidence?.modelUsed === false);

  const slot = "2026-12-01T10:00:00.000Z";
  await post("/api/skills", { skillId: "hr.interview.schedule", payload: { title: "Interview A", at: slot, panel: ["HR Manager"] } });
  const second = await post("/api/skills", { skillId: "hr.interview.schedule", payload: { title: "Interview B", at: slot, panel: ["HR Manager"] } });
  check("interview conflict detection uses real stored records", second.json.evidence?.conflicts >= 1, `conflicts=${second.json.evidence?.conflicts}`);

  const leave = await post("/api/skills", { skillId: "hr.leave.record", payload: { title: "Leave", from: "2026-11-02", to: "2026-11-05", allowance: 20 } });
  log(`leave_days=${leave.json.evidence?.days} balanceAfter=${leave.json.evidence?.balanceAfter}`);
  check(
    "leave days and balance computed from real dates + prior records",
    leave.json.evidence?.days === 4 &&
      leave.json.evidence?.balanceAfter === leave.json.evidence?.annualAllowance - leave.json.evidence?.previouslyTaken - 4,
    `days=${leave.json.evidence?.days} prior=${leave.json.evidence?.previouslyTaken} balance=${leave.json.evidence?.balanceAfter}`,
  );

  const payroll = await post("/api/skills", { skillId: "hr.payroll.calculate", payload: { title: "Payroll", basic: 100000, allowances: 15000, deductions: 8000 } });
  log(`payroll gross=${payroll.json.evidence?.gross} net=${payroll.json.evidence?.net}`);
  check("payroll arithmetic is real (gross 115000, net 107000)", payroll.json.evidence?.gross === 115000 && payroll.json.evidence?.net === 107000);
  check("no payment / no invented statutory rates", payroll.json.evidence?.paymentExecuted === false && payroll.json.evidence?.statutoryRatesApplied === false);

  const hrReport = await post("/api/skills", { skillId: "hr.report.generate", payload: { title: "HR report" } });
  check("HR report counts real local records", hrReport.json.evidence?.report?.totalLocalRecords > 0, `records=${hrReport.json.evidence?.report?.totalLocalRecords}`);
  log("");

  // -------------------------------------------------------- Finance deep tests
  log("--- Finance: real records, reports and authorisation guards ---");
  await post("/api/skills", { skillId: "finance.income.record", payload: { title: "Test income", amount: 500000, category: "Test revenue" } });
  const expense = await post("/api/skills", { skillId: "finance.expense.record", payload: { title: "Approved office expense", amount: 125000, ownerCommandAuthorised: true } });
  log(`expense_approval=${JSON.stringify(expense.json.evidence?.approval)}`);
  check("expense approval is explicit + versioned + RECORD ONLY", expense.json.evidence?.approval?.status === "APPROVED_RECORD_ONLY" && expense.json.evidence?.approval?.recordOnly === true);
  check("expense did not move money or post to accounting", expense.json.evidence?.moneyMovement === false && expense.json.evidence?.paymentExecuted === false);

  const pl = await post("/api/skills", { skillId: "finance.pl.statement", payload: { title: "P&L" } });
  const cashflow = await post("/api/skills", { skillId: "finance.cashflow.statement", payload: { title: "Cash flow" } });
  log(`pl revenue=${pl.json.evidence?.revenue} costs=${pl.json.evidence?.costs} profitOrLoss=${pl.json.evidence?.profitOrLoss}`);
  log(`cashflow inflows=${cashflow.json.evidence?.inflows} outflows=${cashflow.json.evidence?.outflows} net=${cashflow.json.evidence?.netCashFlow}`);
  // Delta assertions: the harness is idempotent, so local state accumulates across runs.
  check("P&L equals real recorded revenue minus costs", pl.json.evidence?.profitOrLoss === pl.json.evidence?.revenue - pl.json.evidence?.costs && pl.json.evidence?.revenue >= 500000 && pl.json.evidence?.costs >= 125000);
  check("cash flow equals real recorded inflows minus outflows", cashflow.json.evidence?.netCashFlow === cashflow.json.evidence?.inflows - cashflow.json.evidence?.outflows);
  check("no bank reconciliation claimed", cashflow.json.evidence?.actualBankBalanceAvailable === false);

  await post("/api/skills", { skillId: "finance.budget.create", payload: { title: "Budget", budgetAmount: 200000 } });
  const variance = await post("/api/skills", { skillId: "finance.budget.variance", payload: { title: "Variance" } });
  log(`budget=${variance.json.evidence?.budget} expense=${variance.json.evidence?.expense} variance=${variance.json.evidence?.variance}`);
  check("budget variance = real stored budgets minus real expenses", variance.json.evidence?.variance === variance.json.evidence?.budget - variance.json.evidence?.expense && variance.json.evidence?.budgetRecords >= 1);

  await post("/api/skills", { skillId: "finance.receivable.register", payload: { title: "Receivable", amount: 50000, dueDate: "2026-09-01" } });
  const aging = await post("/api/skills", { skillId: "finance.ar.aging", payload: { title: "Aging" } });
  log(`ar_buckets=${JSON.stringify(aging.json.evidence?.buckets)} totalOutstanding=${aging.json.evidence?.totalOutstanding}`);
  check("receivables aging uses real due dates", aging.json.evidence?.receivables >= 1 && aging.json.evidence?.totalOutstanding >= 50000);

  const paymentRequest = await post("/api/skills", { skillId: "finance.payment.request", payload: { title: "Payment request", amount: 1000, payee: "[none]" } });
  check("payment REQUEST only, execution refused, Owner approval PENDING", paymentRequest.json.evidence?.paymentExecuted === false && paymentRequest.json.evidence?.executionRefused === true && paymentRequest.json.evidence?.ownerApproval === "PENDING");

  const guard = await post("/api/dept01", { action: "payment.execute", amount: 1000 });
  log(`payment.execute -> HTTP ${guard.status} ok=${guard.json.ok}`);
  check("payment.execute is refused with HTTP 403", guard.status === 403 && guard.json.ok === false);
  log("");

  // ----------------------------------------------------------- approval tests
  log("--- versioned approval workflow ---");
  const approvalRequest = await post("/api/skills", { skillId: "admin.approval.workflow", payload: { title: "Policy approval", scope: "record-only test" } });
  const approvalId = approvalRequest.json.evidence?.approval?.id;
  const version = approvalRequest.json.evidence?.approval?.artifactVersion;
  log(`approval_id=${approvalId} status=${approvalRequest.json.evidence?.ownerApproval}`);
  check("approval starts PENDING, never auto-approved", approvalRequest.json.evidence?.ownerApproval === "PENDING" && approvalRequest.json.evidence?.autoApproved === false);
  const wrongVersion = await post("/api/dept01", { action: "approve", approvalId, approver: "Test Approver", artifactVersion: "WRONG", decision: "APPROVED_RECORD_ONLY" });
  check("wrong artifactVersion is rejected", wrongVersion.status === 400 && wrongVersion.json.ok === false, wrongVersion.json.error || "");
  const missingApprover = await post("/api/dept01", { action: "approve", approvalId, approver: "", artifactVersion: version, decision: "APPROVED_RECORD_ONLY" });
  check("missing approver is rejected", missingApprover.status === 400 && missingApprover.json.ok === false);
  const decided = await post("/api/dept01", { action: "approve", approvalId, approver: "Test Approver (local)", artifactVersion: version, decision: "APPROVED_RECORD_ONLY" });
  check("correct versioned decision succeeds", decided.status === 200 && decided.json.ok === true && decided.json.approval?.status === "APPROVED_RECORD_ONLY");
  const duplicate = await post("/api/dept01", { action: "approve", approvalId, approver: "Test Approver (local)", artifactVersion: version, decision: "APPROVED_RECORD_ONLY" });
  check("duplicate decision is rejected", duplicate.status === 400 && duplicate.json.ok === false);
  log("");

  // -------------------------------------------------- real Office file tests
  log("--- real .docx / .xlsx / .pptx / .pdf / .eml / .ics files ---");
  const word = await post("/api/skills", { skillId: "office.word.create", payload: { title: "GIMMS Word test", lines: ["First paragraph", "Second paragraph"] } });
  const wordName = word.json.evidence?.document?.name;
  const wordCheck = await ooxml(wordName, "word/document.xml");
  log(`docx parts=${wordCheck.parts} parsed_xml=${wordCheck.parsed} bad=${wordCheck.bad} bytes=${wordCheck.bytes} http=${wordCheck.http}`);
  check("real .docx OOXML ZIP with valid XML", wordCheck.parts >= 5 && wordCheck.bad === null && wordCheck.parsed >= 4);
  check("docx contains the real generated text", wordCheck.selected.includes("First paragraph") && wordCheck.selected.includes("Second paragraph"));
  check("docx download has correct MIME type", wordCheck.contentType.includes("wordprocessingml"));

  const sheet = await post("/api/skills", { skillId: "office.excel.create", payload: { title: "Payroll", payroll: true, basic: 100000, allowances: 15000, deductions: 8000 } });
  const sheetName = sheet.json.evidence?.spreadsheet?.name;
  const sheetCheck = await ooxml(sheetName, "xl/worksheets/sheet1.xml");
  log(`xlsx parts=${sheetCheck.parts} parsed_xml=${sheetCheck.parsed} formula_present=${sheetCheck.selected.includes("<f>C2+D2</f>")}`);
  check("real .xlsx OOXML ZIP with valid XML", sheetCheck.parts >= 6 && sheetCheck.bad === null);
  check("xlsx contains real formulas AND cached values", sheetCheck.selected.includes("<f>C2+D2</f>") && sheetCheck.selected.includes("<v>115000</v>") && sheetCheck.selected.includes("<v>107000</v>"));
  check("xlsx read-back found sheet rows", (sheet.json.evidence?.sheetLines || []).length >= 2);

  const slides = await post("/api/skills", { skillId: "office.powerpoint.create", payload: { title: "GIMMS deck", lines: ["Slide bullet one", "Slide bullet two"] } });
  const slidesName = slides.json.evidence?.document?.name;
  const slidesCheck = await ooxml(slidesName, "ppt/slides/slide1.xml");
  log(`pptx parts=${slidesCheck.parts} parsed_xml=${slidesCheck.parsed} bad=${slidesCheck.bad}`);
  check("real .pptx OOXML package with slide/master/layout/theme", slidesCheck.parts >= 11 && slidesCheck.bad === null && slidesCheck.names.includes("ppt/theme/theme1.xml"));
  check("pptx slide contains the real bullet text", slidesCheck.selected.includes("Slide bullet one"));

  const pdfCreate = await post("/api/skills", { skillId: "pdf.create", payload: { title: "GIMMS PDF test", lines: ["Line one about payroll", "Line two about expenses"] } });
  const pdfName = pdfCreate.json.evidence?.document?.name;
  const pdfFile = await download(pdfName);
  const pdfRaw = pdfFile.buffer.toString("latin1");
  log(`pdf header=${pdfRaw.slice(0, 8)} startxref=${pdfRaw.includes("startxref")} eof=${pdfRaw.includes("%%EOF")} bytes=${pdfFile.buffer.length}`);
  check("real PDF 1.4 with xref table and trailer", pdfRaw.startsWith("%PDF-1.4") && pdfRaw.includes("startxref") && pdfRaw.includes("%%EOF"));
  check("PDF download MIME type is application/pdf", pdfFile.contentType.includes("application/pdf"));

  const extract = await post("/api/skills", { skillId: "pdf.text.extract", payload: { title: "extract" } });
  check("PDF text extraction returns real lines from bytes on disk", (extract.json.evidence?.lines || []).length > 0 && extract.json.evidence?.ocrUsed === false, `lines=${extract.json.evidence?.lineCount}`);
  const sum = await post("/api/skills", { skillId: "pdf.summarize", payload: { title: "sum" } });
  check("PDF summarisation is deterministic, NOT an AI model", sum.json.evidence?.aiModelUsed === false && String(sum.json.evidence?.summary || "").length > 10);
  const merge = await post("/api/skills", { skillId: "pdf.merge", payload: { title: "merged" } });
  check("PDF merge reads 2 real native PDFs and writes a new one", merge.json.evidence?.sourceCount === 2 && merge.json.evidence?.readBackLines > 0);
  const split = await post("/api/skills", { skillId: "pdf.split", payload: { title: "split", parts: 3 } });
  check("PDF split produces real part files", split.json.evidence?.partsCreated >= 2, `parts=${split.json.evidence?.partsCreated}`);
  const edit = await post("/api/skills", { skillId: "pdf.edit", payload: { title: "edit", addendum: ["Edited locally"] } });
  check("PDF edit reads back the edited file", edit.json.evidence?.readBackLines > 0 && edit.json.evidence?.sourceLines > 0);
  const conv = await post("/api/skills", { skillId: "pdf.convert", payload: { title: "convert", from: "docx", to: "pdf" } });
  check("native docx → pdf conversion produces a real PDF", conv.json.evidence?.to === "pdf" && conv.json.evidence?.document?.format === "pdf");
  const form = await post("/api/skills", { skillId: "pdf.form.fill", payload: { title: "form", fields: { Name: "Test", Amount: "500" } } });
  check("flat PDF form fill is honest about AcroForm being MISSING", form.json.evidence?.acroForm === false && form.json.evidence?.fieldCount === 2);

  const mail = await post("/api/skills", { skillId: "office.outlook.email.draft", payload: { title: "Mail draft", lines: ["Never sent"] } });
  const mailFile = await download(mail.json.evidence?.document?.name);
  check("real .eml DRAFT marked NEVER SENT", mailFile.buffer.toString("utf8").includes("NEVER SENT") && mail.json.evidence?.sent === false);
  const cal = await post("/api/skills", { skillId: "office.outlook.calendar.draft", payload: { title: "Meeting draft" } });
  const calFile = await download(cal.json.evidence?.document?.name);
  check("real .ics DRAFT with VEVENT, zero invites sent", calFile.buffer.toString("utf8").includes("BEGIN:VEVENT") && cal.json.evidence?.invitesSent === 0);
  log("");

  // ------------------------------------------------------------- agents/owner
  log("--- 10 agents + EMP-0001 proposal + integrations ---");
  const agents = await post("/api/skills", { skillId: "agent.roster.configure", payload: { title: "agents" } });
  log(`agents=${agents.json.evidence?.total} modelConnected=${agents.json.evidence?.modelConnected} fullContracts=${agents.json.evidence?.everyAgentHasFullContract}`);
  check("10 agents configured with full contracts", agents.json.evidence?.total === 10 && agents.json.evidence?.everyAgentHasFullContract === true);
  check("0 AI models connected to agents", agents.json.evidence?.modelConnected === 0);
  check("agent skill references resolve to real skills", agents.json.evidence?.skillsReferencedExist === true);

  const owner = await post("/api/skills", { skillId: "account.owner.propose", payload: { title: "EMP-0001" } });
  log(`EMP-0001 status=${owner.json.evidence?.status} secureLoginImplemented=${owner.json.evidence?.secureLogin?.implemented} alreadyProposed=${owner.json.evidence?.alreadyProposed}`);
  check("EMP-0001 is a PROPOSAL, no real details, no secure login", owner.json.evidence?.employeeId === "EMP-0001" || owner.json.evidence?.alreadyProposed === true);
  const ownerSnapshot = await get("/api/dept01");
  check("Owner account proposal is PENDING_SECURE_REGISTRATION", ownerSnapshot.json.ownerAccountProposal?.status === "PENDING_SECURE_REGISTRATION" && ownerSnapshot.json.ownerAccountProposal?.secureLogin?.implemented === false);
  check("no real Owner details stored", ownerSnapshot.json.ownerAccountProposal?.profile?.realDetailsStored === false);

  const integrations = await post("/api/skills", { skillId: "integration.request.list", payload: { title: "requests" } });
  check("integration requests list credential NAMES only", integrations.json.evidence?.connected === 0 && integrations.json.evidence?.secretValuesShown === 0 && (integrations.json.evidence?.credentialNamesOnly || []).length > 0);
  log("");

  // ---------------------------------------------- cross-department workflow
  log("--- HR → Management → Production → QA → OWNER APPROVAL ---");
  const workflow = await post("/api/skills", { skillId: "workflow.hr.to.production", payload: { title: "Workflow", jobTitle: "Website development job" } });
  log(`jobs=${workflow.json.evidence?.jobsCreated} productionStatus=${workflow.json.evidence?.productionJobStatus} ownerApproval=${workflow.json.evidence?.ownerApproval} illegalRejected=${workflow.json.evidence?.illegalTransitionRejected}`);
  check("4 real jobs created in the shared job model", workflow.json.evidence?.jobsCreated === 4, JSON.stringify(workflow.json.evidence?.errors));
  check("Production job reaches APPROVAL (not COMPLETE)", workflow.json.evidence?.productionJobStatus === "APPROVAL");
  check("illegal APPROVAL → COMPLETE transition is rejected", workflow.json.evidence?.illegalTransitionRejected === true);
  check("Owner approval stays PENDING", workflow.json.evidence?.ownerApproval === "PENDING");
  check("Production is NOT claimed fully functional", workflow.json.evidence?.productionFullyFunctional === false);
  const jobsAfter = await get("/api/jobs");
  const workflowJobs = (jobsAfter.json.jobs || []).filter((j) => String(j.title || "").includes("OWNER_COMMAND_HR_RECORD"));
  check("workflow jobs persist after reload", workflowJobs.length >= 1, `count=${workflowJobs.length}`);
  log("");

  // --------------------------------------------------------- EXACT Owner command
  log("--- EXACT Owner sample command (real execution, not a chatbot reply) ---");
  log(`COMMAND=${OWNER_COMMAND}`);
  const commandResult = await post("/api/dept01", {
    action: "command",
    command: OWNER_COMMAND,
    payload: {
      // Structured numbers supplied ONLY to make the arithmetic testable; no real employee data.
      basic: 100000,
      allowances: 15000,
      deductions: 8000,
      amount: 125000,
      employeeName: "New Employee (synthetic command draft)",
    },
  });
  const ev = commandResult.json.evidence || {};
  log(`ok=${commandResult.json.ok} parsedSteps=${JSON.stringify(ev.parsedSteps)} steps=${ev.stepsExecuted} succeeded=${ev.stepsSucceeded} aiModelUsed=${ev.aiModelUsed}`);
  log(`sha256=${commandResult.json.sha256}`);
  for (const step of ev.executedSteps || []) {
    log(`step ${step.step} ok=${step.ok} artifacts=${(step.evidence.artifacts || []).length}`);
  }
  check("Owner command HTTP 200 and ok=true", commandResult.status === 200 && commandResult.json.ok === true, commandResult.json.error || "");
  check("all 5 requested steps parsed", (ev.parsedSteps || []).length === 5, JSON.stringify(ev.parsedSteps));
  check("all 5 steps executed real local work", ev.stepsExecuted === 5 && ev.stepsSucceeded === 5);
  check("command parser is NOT an AI model", ev.aiModelUsed === false);
  check("agreement produced real .docx + .pdf", JSON.stringify(ev.executedSteps || []).includes('"format":"docx"') && JSON.stringify(ev.executedSteps || []).includes('"format":"pdf"'));
  check("payroll sheet produced real .xlsx", JSON.stringify(ev.executedSteps || []).includes('"format":"xlsx"'));
  check("expense registered with versioned approval", JSON.stringify(ev.executedSteps || []).includes("APPROVED_RECORD_ONLY"));
  check("website job handed to Management then Production", JSON.stringify(ev.executedSteps || []).includes("workflow.hr.to.production"));

  // Verify the command's own files at BYTE level, not just by their names.
  const commandArtifacts = (ev.executedSteps || [])
    .flatMap((step) => step.evidence.artifacts || [])
    .filter((artifact) => artifact && artifact.name && artifact.format);
  log(`command_artifacts=${commandArtifacts.map((a) => `${a.name}:${a.format}:${a.bytes}B`).join(" | ")}`);
  check("Owner command produced 3 downloadable files (.docx + .pdf + .xlsx)", commandArtifacts.length === 3, `count=${commandArtifacts.length}`);
  let byteVerified = 0;
  for (const artifact of commandArtifacts) {
    const file = await download(artifact.name);
    const digest = crypto.createHash("sha256").update(file.buffer).digest("hex");
    if (file.status === 200 && file.buffer.length === artifact.bytes && digest === artifact.sha256) byteVerified += 1;
    log(`artifact_verify ${artifact.name} http=${file.status} bytes=${file.buffer.length} sha256_match=${digest === artifact.sha256}`);
  }
  check("every command artifact matches its recorded byte count and SHA-256", byteVerified === commandArtifacts.length, `verified=${byteVerified}`);
  const agreementDocx = commandArtifacts.find((a) => a.format === "docx");
  const agreementPdf = commandArtifacts.find((a) => a.format === "pdf");
  const payrollXlsx = commandArtifacts.find((a) => a.format === "xlsx");
  if (agreementDocx) {
    const agreementCheck = await ooxml(agreementDocx.name, "word/document.xml");
    check("command agreement .docx contains the real DRAFT clauses", agreementCheck.selected.includes("EMPLOYMENT AGREEMENT") && agreementCheck.selected.includes("NOT legal advice"));
  } else check("command agreement .docx present", false);
  if (agreementPdf) {
    const agreementPdfFile = await download(agreementPdf.name);
    check("command agreement .pdf is a real PDF with xref", agreementPdfFile.buffer.toString("latin1").startsWith("%PDF-1.4") && agreementPdfFile.buffer.toString("latin1").includes("startxref"));
  } else check("command agreement .pdf present", false);
  if (payrollXlsx) {
    const payrollCheck = await ooxml(payrollXlsx.name, "xl/worksheets/sheet1.xml");
    check("command payroll .xlsx has real formulas and cached net pay", payrollCheck.selected.includes("<f>C2+D2</f>") && payrollCheck.selected.includes("<v>107000</v>"));
  } else check("command payroll .xlsx present", false);

  const commandsSnapshot = await get("/api/dept01");
  check("command record persisted locally", (commandsSnapshot.json.commands || []).length >= 1 && (commandsSnapshot.json.commands || [])[0].command === OWNER_COMMAND);
  log("");

  // ------------------------------------------------------------- honesty checks
  log("--- honesty / regression guards ---");
  const connect = await get("/api/connect");
  log(`connect connected=${connect.json.connected}`);
  check("external channels stay connected:0", connect.json.connected === 0);
  const bootstrap = await get("/api/bootstrap");
  log(`bootstrap provider=${bootstrap.json.provider} publishing=${bootstrap.json.publishing} connected=${bootstrap.json.connected}`);
  check("no AI provider / MANUAL publishing / 0 connected", bootstrap.json.provider === "demo" && bootstrap.json.publishing === "MANUAL" && bootstrap.json.connected === 0);
  const deferred = await post("/api/jobs", { action: "create", title: "deferred must fail", departmentId: "06" });
  check("deferred department 06 still rejected", deferred.status === 400, `status=${deferred.status}`);
  const legal = await post("/api/jobs", { action: "transition", jobId: harnessJobId, to: "COMPLETE" });
  check("illegal job transition still rejected", legal.status === 400 || legal.json.ok === false, `status=${legal.status}`);
  const honesty = await get("/api/dept01");
  check("Dept 01 API reports honest limits", honesty.json.honesty?.connectedServices === 0 && honesty.json.honesty?.paymentExecution === "BLOCKED" && honesty.json.honesty?.deploymentPerformed === false && honesty.json.honesty?.secureLoginImplemented === false);
  check("no .env.local committed/present", !fs.existsSync(path.join(process.cwd(), ".env.local")));
  check("no AI SDK / new npm dependency added", (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    return Object.keys(pkg.dependencies).length === 3 && Object.keys(pkg.devDependencies).length === 4;
  })());
  log("");

  // ------------------------------------------------------- Phase 0 regression
  log("--- Phase 0 regression (full harness with 114 skills) ---");
  let p0 = "";
  try {
    p0 = execFileSync("bash", ["scripts/verify-phase0.sh"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 240000 });
  } catch (error) {
    p0 = String(error.stdout || "") + String(error.stderr || "");
  }
  for (const line of p0.trim().split("\n").filter((line) => /^(phase0|PHASE0|skill_executed_ok|skill_failed|active_p0_count|deferred_count|created_job_id|job_present_after_reload|"connected"|skill_harness_job_id|VERIFY|PHASE0_)/.test(line.trim()) || line.includes("\"summary\":{"))) {
    log(`P0 ${line.trim()}`);
  }
  check("Phase 0 harness: 0 skill failures", /skill_failed=0(\D|$)/.test(p0), (p0.match(/skill_failed=\d+/) || ["?"])[0]);
  check("Phase 0 harness: registry still 10/7/3", /active_p0_count 7/.test(p0) && /deferred_count 3/.test(p0));
  check("Phase 0 harness: job persists after reload", /job_present_after_reload 1/.test(p0));
  check("Phase 0 harness: connected stays 0", /"connected":0/.test(p0));
  log("");

  log(`DEPT01_TESTS_PASS=${PASS}`);
  log(`DEPT01_TESTS_FAIL=${FAIL}`);
  log(`DEPT01_VERIFICATION_DONE=${STAMP}`);
  log("HONESTY=LOCAL TESTS ONLY. No deploy, no external integration, no payment, no production change, no 100% completion claim.");

  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = FAIL === 0 ? 0 : 1;
}

main().catch((error) => {
  log(`FATAL ${error instanceof Error ? error.stack || error.message : String(error)}`);
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  process.exitCode = 1;
});
