/**
 * GIMMS Phase 0 — Department Registry.
 *
 * Source of truth: GIMMS_Master_Workflow_and_AI_Requirements.txt (v1.3), section 1 and 2.
 * Exactly TEN departments. Seven are Phase-1 priorities (status "active-p0"); the other
 * three are defined but deliberately inactive so the full architecture is preserved.
 *
 * This is DATA + routing, not an AI model and not a "connected" integration. A department
 * is not functional just because it appears here or in a menu (Master Doc section 3).
 */

import { DEPT01_SKILL_IDS_LIST } from "@/lib/dept01-catalog";

export type DepartmentStatus = "active-p0" | "deferred";

export type Division = {
  name: string;
  roles: string[];
};

export type Department = {
  id: string;
  name: string;
  mission: string;
  /** 1..7 = Phase-1 priority order from the Owner's command; null = deferred. */
  priority: number | null;
  status: DepartmentStatus;
  divisions: Division[];
  owns: string[];
  mustNot: string[];
  /** Deterministic local skills only. Never a prompt-only claim. */
  safeSkills: string[];
  /** Names only. All NOT CONNECTED until a real credential is tested. */
  externalNeeds: string[];
  routeKeywords: string[];
};

export const DEPARTMENTS: Department[] = [
  {
    id: "01",
    name: "HR, Finance & Administration",
    mission: "Company financial management, human resources, administration, contracts and legal coordination.",
    priority: 1,
    status: "active-p0",
    divisions: [
      { name: "Finance & Accounting", roles: ["Finance Manager", "Accountant", "Accounts Assistant", "Finance AI Agent"] },
      { name: "Budgeting & Planning", roles: ["Budget Manager", "Financial Analyst", "Budget Controller"] },
      { name: "Outstanding & Receivables", roles: ["AR Officer", "Invoice Manager", "Collection Follow-up Agent"] },
      { name: "Payments, Payouts & Payables", roles: ["Payment Manager", "AP Officer", "Payout Coordinator"] },
      { name: "Human Resources", roles: ["HR Manager", "Recruiter", "Employee Relations Officer", "HR Agent"] },
      { name: "Payroll & Benefits", roles: ["Payroll Officer"] },
      { name: "Legal & Documentation", roles: ["Contract Administrator", "Legal Liaison", "Document Controller"] },
      { name: "Administration", roles: ["Administrator", "Office/Branch Coordinator"] },
    ],
    owns: ["employee records", "budgets", "expense drafts", "invoice drafts", "receivables register", "document register"],
    mustNot: ["execute payments", "run payroll", "move money", "give legal advice", "sign agreements"],
    // P1-01: 80 native, credential-free Dept 01 handlers behind the SAME skills gateway.
    // Names only — none of the external services below is connected or tested.
    safeSkills: ["invoice.draft", "expense.draft", "document.register", ...DEPT01_SKILL_IDS_LIST],
    externalNeeds: [
      "payment gateway API",
      "accounting API",
      "e-signature service",
      "Microsoft 365 / Graph API (Word, Excel, PowerPoint, Outlook, SharePoint)",
      "Google Workspace APIs (Docs, Sheets, Slides, Drive, Gmail, Calendar)",
      "general-purpose PDF library (AcroForm, arbitrary PDFs)",
      "OCR / scanned PDF text extraction",
      "SMTP / email delivery API",
      "approved auth provider (Supabase Auth) for EMP-0001 secure login",
      "qualified accountant / statutory tax rate source",
      "qualified legal professional review",
      "LLM / AI SDK / MCP server for the 10 role-based agents",
    ],
    routeKeywords: ["invoice", "expense", "payroll", "employee", "budget", "payment", "contract", "agreement", "receivable", "hr", "salary"],
  },
  {
    id: "02",
    name: "Production",
    mission: "Deliver software, digital/physical production, design, content and client products, split by job type.",
    priority: 2,
    status: "active-p0",
    divisions: [
      { name: "Software Development", roles: ["Software Architect", "Frontend Developer", "Backend Developer", "Full-Stack Engineer", "Database Engineer", "API Engineer"] },
      { name: "Websites & Web Portals", roles: ["Web Developer", "WordPress/E-commerce Developer", "Web QA"] },
      { name: "UI/UX & Product Design", roles: ["UI Designer", "UX Designer", "Product Designer", "UX Researcher"] },
      { name: "Graphic Design & Branding", roles: ["Graphic Designer", "Brand Designer", "Advertising Designer", "Print Designer"] },
      { name: "Video, Audio & Media", roles: ["Video Editor", "Motion Designer", "Animator", "Audio Editor", "Producer", "AI Media Specialist"] },
      { name: "Content & Editorial", roles: ["Copywriter", "Content Writer", "Article Writer", "Scriptwriter", "Editor"] },
      { name: "AI Solutions Implementation", roles: ["AI Developer", "Chatbot Developer", "Voice AI Engineer", "Automation Engineer"] },
      { name: "Quality Assurance & Quality Control", roles: ["QA Lead", "Software Tester", "Design Reviewer", "Content Reviewer", "Release Tester"] },
      { name: "Delivery & Maintenance", roles: ["Service Delivery Lead", "Support Technician"] },
    ],
    owns: ["design briefs", "content drafts", "code changes", "QA evidence", "delivery checklists", "technical SEO checks"],
    mustNot: ["claim AI image/video generation without a provider", "auto-publish", "claim output was delivered without evidence"],
    safeSkills: ["design.brief", "content.draft", "code.scaffold", "qa.check", "delivery.checklist", "seo.audit.local"],
    externalNeeds: ["image generation API", "video generation API", "video render/encode tooling", "TTS/STT API", "LLM content API"],
    routeKeywords: ["design", "graphic", "image", "video", "render", "content", "website", "code", "build", "qa", "delivery", "edit", "prototype"],
  },
  {
    id: "03",
    name: "Sales & Marketing",
    mission: "Three commercial streams — Sales, Marketing and Advertising — plus business consulting services.",
    priority: 4,
    status: "active-p0",
    divisions: [
      { name: "Sales", roles: ["Sales Manager", "Sales Executive", "Business Development Representative"] },
      { name: "Buyers, Sellers, Resellers & Brokers", roles: ["Channel Manager", "Reseller Manager", "Broker Coordinator"] },
      { name: "General Marketing", roles: ["Marketing Manager", "Field/Event Marketer"] },
      { name: "Digital Marketing", roles: ["Digital Marketing Manager", "Growth Specialist", "Email Marketer"] },
      { name: "Advertising", roles: ["Meta Ads Specialist", "Google Ads Specialist", "Media Buyer", "Analyst"] },
      { name: "SEO & Organic Growth", roles: ["SEO Specialist", "Technical SEO Analyst", "Local SEO Specialist"] },
      { name: "Social Media & Promotions", roles: ["Social Media Manager", "Campaign Coordinator"] },
      { name: "Business Consulting & Advisory", roles: ["Business Consultant", "Strategy Advisor", "Business Analyst"] },
      { name: "Business Registration & Documentation", roles: ["Registration Coordinator", "Proposal Writer", "Business Documentation Specialist"] },
    ],
    owns: ["lead records", "quotation drafts", "campaign plans", "proposal drafts", "local SEO audits"],
    mustNot: ["publish ads", "schedule posts", "send email", "spend budget without approval"],
    safeSkills: ["lead.record", "quotation.draft", "campaign.plan", "proposal.draft", "seo.audit.local"],
    externalNeeds: ["Meta Marketing API + app review", "Google Ads API + developer token", "SEO/SERP data API", "email/SMTP"],
    routeKeywords: ["ads", "advertising", "campaign", "seo", "social", "lead", "quotation", "proposal", "sales", "marketing", "promotion"],
  },
  {
    id: "04",
    name: "Research & Development",
    // Master Doc section 2: "Do not call this department 'Intelligence'".
    mission: "Evidence-based research supporting businesses, products, clients and future investments.",
    priority: 3,
    status: "active-p0",
    divisions: [
      { name: "AI & Technology Research", roles: ["AI Researcher", "Technology Analyst"] },
      { name: "Market Research", roles: ["Market Research Analyst"] },
      { name: "Competitor Research", roles: ["Competitive Analyst"] },
      { name: "Product & Service Research", roles: ["Product Researcher"] },
      { name: "Client & Customer Research", roles: ["Client Researcher"] },
      { name: "Marketing & SEO Research", roles: ["SEO Researcher", "Audience Analyst"] },
      { name: "Business Research", roles: ["Business Research Analyst"] },
      { name: "Research Knowledge Management", roles: ["Research Librarian", "Documentation Analyst"] },
    ],
    owns: ["research reports", "source registers", "knowledge index", "versioned handoffs"],
    mustNot: ["invent sources", "present unverified claims as fact", "call the department 'Intelligence'"],
    safeSkills: ["research.report", "source.verify", "knowledge.index", "report.version"],
    externalNeeds: ["web search API", "Perplexity API", "LLM synthesis API", "SERP/keyword data API"],
    routeKeywords: ["research", "competitor", "market study", "technology research", "knowledge", "analysis", "feasibility", "report"],
  },
  {
    id: "05",
    name: "CRM, Supply Chain & Audience Management",
    mission: "Customer relationships, clients, suppliers, leads, orders, audiences and operation of customer-facing AI channels.",
    priority: 5,
    status: "active-p0",
    divisions: [
      { name: "CRM", roles: ["CRM Manager", "Account Manager", "Relationship Officer"] },
      { name: "Lead Management", roles: ["Lead Manager", "Qualification Agent"] },
      { name: "Order Management", roles: ["Order Coordinator", "Order Fulfillment Agent"] },
      { name: "AI Chatbot Operations", roles: ["Chatbot Operations Manager", "Conversation QA"] },
      { name: "AI Voice & Call Center Operations", roles: ["Voice Operations Manager", "Call QA"] },
      { name: "Supplier Management", roles: ["Supplier Coordinator"] },
      { name: "Audience & Customer Support", roles: ["Audience Analyst", "Support Officer"] },
    ],
    owns: ["client records", "lead records", "order records", "supplier records", "audience segments", "support tickets"],
    mustNot: ["answer live calls", "transfer calls", "claim a chatbot is connected", "mix one client's data into another"],
    safeSkills: ["client.record", "lead.capture", "order.record", "supplier.record", "audience.segment", "support.ticket"],
    externalNeeds: ["chatbot LLM API", "per-client RLS", "telephony API", "STT/TTS API", "WhatsApp/Telegram channel API"],
    routeKeywords: ["client", "crm", "order", "supplier", "audience", "support", "chatbot", "voice", "call center", "customer"],
  },
  {
    id: "06",
    name: "Innovation & New Product Development",
    mission: "Create and test new AI models, AI skills, plugins, MCP systems and experimental products.",
    priority: null,
    status: "deferred",
    divisions: [
      { name: "AI Model Development", roles: ["ML Engineer", "AI Model Architect"] },
      { name: "AI Skill Engineering", roles: ["AI Skill Developer", "Agent Engineer"] },
      { name: "Plugin & MCP Development", roles: ["Plugin Developer", "MCP Engineer"] },
      { name: "AI API & Model Testing Lab", roles: ["Integration Tester", "Model Evaluation Specialist"] },
    ],
    owns: [],
    mustNot: ["activate before Phase 1 priorities are functional"],
    safeSkills: [],
    externalNeeds: ["model training compute", "MCP runtime"],
    routeKeywords: [],
  },
  {
    id: "07",
    name: "Learning & Career Development",
    mission: "Separate education/career business with student, trainer, employer and admin portals.",
    priority: null,
    status: "deferred",
    divisions: [
      { name: "Courses", roles: ["Curriculum Designer", "Instructor"] },
      { name: "LMS Operations", roles: ["LMS Administrator"] },
      { name: "Certification", roles: ["Assessment Manager"] },
      { name: "Jobs & Careers", roles: ["Placement Officer", "Employer Relations Manager"] },
    ],
    owns: [],
    mustNot: ["imply government or academic accreditation without approval", "activate before Phase 1 priorities are functional"],
    safeSkills: [],
    externalNeeds: ["LMS platform", "payment gateway"],
    routeKeywords: [],
  },
  {
    id: "08",
    name: "Community Welfare & Social Development",
    mission: "Community support, children's education, social programs, free training, volunteering and donations.",
    priority: null,
    status: "deferred",
    divisions: [
      { name: "Community Projects", roles: ["Community Coordinator"] },
      { name: "Child & Youth Welfare", roles: ["Child Safeguarding Officer", "Youth Coordinator"] },
      { name: "Donations & Sponsorships", roles: ["Fundraising Officer"] },
      { name: "Social Impact", roles: ["Impact Analyst"] },
    ],
    owns: [],
    mustNot: ["disburse funds without authorized approval", "activate before Phase 1 priorities are functional"],
    safeSkills: [],
    externalNeeds: ["donation/payment gateway", "safeguarding review process"],
    routeKeywords: [],
  },
  {
    id: "09",
    name: "Security, Reliability & System Operations",
    mission: "Platform-wide cybersecurity, hosting, cloud, reliability, bug fixing, preventative alerts and maintenance.",
    priority: 6,
    status: "active-p0",
    divisions: [
      { name: "Cybersecurity", roles: ["Security Manager", "Security Analyst", "Security Engineer"] },
      { name: "Hosting & Domains", roles: ["Hosting Admin", "Domain/DNS Specialist"] },
      { name: "Cloud & Servers", roles: ["Cloud/DevOps Engineer", "Server Admin"] },
      { name: "Bug Detection & Fixing", roles: ["Debug Engineer", "Maintenance Developer"] },
      { name: "System Health", roles: ["Reliability Engineer", "Monitoring Agent"] },
      { name: "API/Credits/Quotas", roles: ["API Operations Agent"] },
      { name: "Backup & Recovery", roles: ["Backup Engineer", "Disaster Recovery Lead"] },
      { name: "Incidents & Early Warnings", roles: ["Incident Manager"] },
    ],
    owns: ["system audits", "env hygiene checks", "integration inventory", "error reports", "dependency checks"],
    mustNot: ["auto-delete logs", "change financial settings", "perform destructive production operations", "auto-remediate outside approved low-risk boundaries"],
    safeSkills: ["system.audit", "env.hygiene", "integration.inventory", "error.report", "dependency.check"],
    externalNeeds: ["uptime/cloud monitoring", "alert channel (SMTP/Slack)", "log storage", "credit/usage metering API"],
    routeKeywords: ["security", "monitoring", "uptime", "error", "incident", "backup", "credits", "quota", "alert", "reliability", "bug"],
  },
  {
    id: "10",
    name: "Project Management & Operations",
    mission: "Central coordination of all departments, projects, jobs, deadlines, resources, approvals and reporting.",
    priority: 7,
    status: "active-p0",
    divisions: [
      { name: "PMO", roles: ["Project Manager", "Portfolio Manager"] },
      { name: "Job/Task Management", roles: ["Task Coordinator"] },
      { name: "Department Coordination", roles: ["Operations Coordinator"] },
      { name: "Resource Management", roles: ["Resource Manager"] },
      { name: "Workflow Automation", roles: ["Workflow Engineer"] },
      { name: "Quality & Delivery", roles: ["Delivery Manager"] },
      { name: "Performance & Reporting", roles: ["Operations Analyst"] },
      { name: "Owner Operations Control", roles: ["Chief Operations Manager"] },
    ],
    owns: ["department registry", "job intake", "job routing", "status transitions", "progress reports", "owner dashboard"],
    mustNot: ["mark a department functional because a UI exists", "skip QA or approval gates"],
    safeSkills: ["department.registry", "job.intake", "job.route", "status.transition", "progress.report", "owner.dashboard"],
    externalNeeds: ["AI assignee model", "workflow scheduler"],
    routeKeywords: ["task", "project", "workflow", "assign", "deadline", "progress", "coordination", "dashboard", "milestone"],
  },
];

/** Phase-1 priority order as given by the Owner (not the Master Doc IDs). */
export const P0_IDS = ["01", "02", "04", "03", "05", "09", "10"] as const;
export const DEFERRED_IDS = ["06", "07", "08"] as const;

export function getDepartment(id: string): Department | undefined {
  return DEPARTMENTS.find((department) => department.id === id);
}

export function activeDepartments(): Department[] {
  return DEPARTMENTS.filter((department) => department.status === "active-p0");
}

export type RoutingResult = {
  id: string;
  basis: "explicit" | "keyword" | "fallback";
  matchedKeywords: string[];
  scores: Record<string, number>;
  role: string;
};

/**
 * Deterministic routing. Explicit departmentId always wins; otherwise score active
 * departments by keyword hits, tie-break by Phase-1 priority order, then fall back to
 * the central PMO (10). No model call, no guessing from invented data.
 */
export function routeDepartment(
  text: string,
  explicitId?: string,
): RoutingResult {
  if (explicitId && getDepartment(explicitId)) {
    const department = getDepartment(explicitId)!;
    return {
      id: department.id,
      basis: "explicit",
      matchedKeywords: [],
      scores: {},
      role: department.divisions[0]?.roles[0] ?? "Unassigned",
    };
  }

  const lower = (text || "").toLowerCase();
  const scores: Record<string, number> = {};
  const matched: Record<string, string[]> = {};

  for (const department of activeDepartments()) {
    let score = 0;
    const hits: string[] = [];
    for (const keyword of department.routeKeywords) {
      if (lower.includes(keyword)) {
        score += 1;
        hits.push(keyword);
      }
    }
    scores[department.id] = score;
    matched[department.id] = hits;
  }

  let winner: Department | undefined;
  for (const id of P0_IDS) {
    const score = scores[id] ?? 0;
    if (score > 0 && (!winner || score > (scores[winner.id] ?? 0))) {
      winner = getDepartment(id);
    }
  }

  if (!winner) {
    winner = getDepartment("10")!;
    return {
      id: winner.id,
      basis: "fallback",
      matchedKeywords: [],
      scores,
      role: winner.divisions[1]?.roles[0] ?? "Task Coordinator",
    };
  }

  return {
    id: winner.id,
    basis: "keyword",
    matchedKeywords: matched[winner.id] ?? [],
    scores,
    role: winner.divisions[0]?.roles[0] ?? "Unassigned",
  };
}

export function registrySummary() {
  return {
    total: DEPARTMENTS.length,
    active: activeDepartments().length,
    deferred: DEPARTMENTS.length - activeDepartments().length,
    priorityOrder: P0_IDS,
    deferredIds: DEFERRED_IDS,
    divisions: DEPARTMENTS.reduce((sum, department) => sum + department.divisions.length, 0),
    roles: DEPARTMENTS.reduce(
      (sum, department) => sum + department.divisions.reduce((n, division) => n + division.roles.length, 0),
      0,
    ),
  };
}
