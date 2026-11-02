/**
 * GIMMS P2-02 — PRODUCTION AI DEVELOPMENT TEAM (INITIAL SETUP / CONFIG ONLY).
 *
 * Source of truth: GIMMS_Master_Workflow_and_AI_Requirements.txt v1.3
 *   §1 (Owner + department structure), §2.1/2.8/2.10 (Production divisions),
 *   §3 (universal job model), §5 (central AI assistant + providers),
 *   §6 (skills must be executable, never prompt-only claims), §8 (approval gate).
 *
 * THIS MODULE IS CONFIGURATION / DATA. It does NOT:
 *  - call any AI model, API, plugin or MCP server;
 *  - start a software development project or generate a product;
 *  - install an SDK, request a credential, purchase a service or deploy;
 *  - modify any existing registry, skill, job, page or database module.
 *
 * HONESTY RULES (verified 2026-11-03):
 *  - 0 AI model APIs connected. 0 AI SDKs installed. 0 plugins. 0 MCP servers.
 *  - 0 function-calling providers. `/api/connect` reports connected:0.
 *  - Vercel env names are SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL,
 *    HUB_STATE_TABLE only — no AI provider credential exists (names only, no values).
 *  - Arena-side connectors (Google Docs/Sheets/Slides/Drive/Gmail/Calendar, etc.)
 *    are AGENT WORKSPACE TOOLS, not GIMMS product model APIs. Google Workspace
 *    connectors are NOT Google AI Studio / Gemini. No Arena connector exists for
 *    OpenAI/Gemini/AI Studio (verified unsupported).
 *  - Exact model IDs, API availability, SDK names, auth methods, streaming,
 *    tool calling, multimodal support, pricing and quotas are UNVERIFIED —
 *    outbound access to provider docs is not available in this environment.
 *    Nothing is invented here.
 */

export type ModelKind = "NAMED_INITIAL" | "EXTENSIBLE_SLOT" | "FUTURE_CANDIDATE";

export type AIModelRecord = {
  id: string;
  label: string;
  provider: string;
  family: string;
  assignedRole: string;
  kind: ModelKind;
  status: "REQUIRES_API_ACCESS" | "FUTURE_SLOT_READY" | "CANDIDATE_NOT_REGISTERED";
  connected: false;
  authenticatedTest: "NOT_PERFORMED";
  connectionTestResult: null;
  exactModelIds: string[];
  modelIdNote: string;
  apiAvailability: "UNVERIFIED";
  sdk: "NOT_INSTALLED";
  sdkInstalled: false;
  authMethod: "NOT_CONFIGURED";
  streaming: "UNVERIFIED";
  toolFunctionCalling: "UNVERIFIED";
  multimodal: "UNVERIFIED";
  pricing: "UNVERIFIED";
  quotas: "UNVERIFIED";
  officialDocs: "NOT VERIFIED — provider documentation not accessible from this environment";
  credentialName: string;
  credentialConfigured: false;
  pluginRegistered: false;
  mcpServerRegistered: false;
  requiresApiAccess: boolean;
  requiresOwnerApproval: true;
  factsVerified: false;
  blockers: string[];
  note: string;
};

const COMMON_BLOCKERS = [
  "No provider account / API access approved by the Owner",
  "No credential configured (server-side env required)",
  "No SDK installed and no HTTP adapter implemented",
  "No authenticated connection test performed",
  "Exact model IDs, pricing, quotas and capability facts UNVERIFIED",
];

/** The 3 initially included model entries requested by the Owner. */
export const AI_MODEL_REGISTRY: AIModelRecord[] = [
  {
    id: "model-chatgpt-openai-gpt",
    label: "ChatGPT / OpenAI GPT",
    provider: "OpenAI",
    family: "GPT",
    assignedRole: "Coding & Development AI",
    kind: "NAMED_INITIAL",
    status: "REQUIRES_API_ACCESS",
    connected: false,
    authenticatedTest: "NOT_PERFORMED",
    connectionTestResult: null,
    exactModelIds: [],
    modelIdNote: "UNVERIFIED — Owner/provider must supply exact model IDs before any registration",
    apiAvailability: "UNVERIFIED",
    sdk: "NOT_INSTALLED",
    sdkInstalled: false,
    authMethod: "NOT_CONFIGURED",
    streaming: "UNVERIFIED",
    toolFunctionCalling: "UNVERIFIED",
    multimodal: "UNVERIFIED",
    pricing: "UNVERIFIED",
    quotas: "UNVERIFIED",
    officialDocs: "NOT VERIFIED — provider documentation not accessible from this environment",
    credentialName: "OPENAI_API_KEY (proposed server-side name; NOT configured, value never requested)",
    credentialConfigured: false,
    pluginRegistered: false,
    mcpServerRegistered: false,
    requiresApiAccess: true,
    requiresOwnerApproval: true,
    factsVerified: false,
    blockers: COMMON_BLOCKERS,
    note: "ChatGPT the product and the OpenAI API are different access paths; neither is connected. Name only — no claim of availability or capability.",
  },
  {
    id: "model-google-ai-studio-gemini",
    label: "Google AI Studio / Gemini",
    provider: "Google",
    family: "Gemini",
    assignedRole: "Coding & Technical AI",
    kind: "NAMED_INITIAL",
    status: "REQUIRES_API_ACCESS",
    connected: false,
    authenticatedTest: "NOT_PERFORMED",
    connectionTestResult: null,
    exactModelIds: [],
    modelIdNote: "UNVERIFIED — Owner/provider must supply exact model IDs before any registration",
    apiAvailability: "UNVERIFIED",
    sdk: "NOT_INSTALLED",
    sdkInstalled: false,
    authMethod: "NOT_CONFIGURED",
    streaming: "UNVERIFIED",
    toolFunctionCalling: "UNVERIFIED",
    multimodal: "UNVERIFIED",
    pricing: "UNVERIFIED",
    quotas: "UNVERIFIED",
    officialDocs: "NOT VERIFIED — provider documentation not accessible from this environment",
    credentialName: "GOOGLE_AI_STUDIO_API_KEY (proposed server-side name; NOT configured, value never requested)",
    credentialConfigured: false,
    pluginRegistered: false,
    mcpServerRegistered: false,
    requiresApiAccess: true,
    requiresOwnerApproval: true,
    factsVerified: false,
    blockers: [
      ...COMMON_BLOCKERS,
      "Google Workspace connectors enabled in Arena (Docs/Sheets/Slides/Drive/Gmail/Calendar) are NOT Gemini/AI Studio model access",
    ],
    note: "AI Studio / Gemini is a model/API platform, distinct from Google Workspace productivity connectors. Neither is connected to the GIMMS app.",
  },
  {
    id: "model-additional-ai-slot",
    label: "Additional AI Models — extensible slot",
    provider: "UNDECIDED",
    family: "OPEN",
    assignedRole: "Future integrations",
    kind: "EXTENSIBLE_SLOT",
    status: "FUTURE_SLOT_READY",
    connected: false,
    authenticatedTest: "NOT_PERFORMED",
    connectionTestResult: null,
    exactModelIds: [],
    modelIdNote: "No model registered — architecture slot only",
    apiAvailability: "UNVERIFIED",
    sdk: "NOT_INSTALLED",
    sdkInstalled: false,
    authMethod: "NOT_CONFIGURED",
    streaming: "UNVERIFIED",
    toolFunctionCalling: "UNVERIFIED",
    multimodal: "UNVERIFIED",
    pricing: "UNVERIFIED",
    quotas: "UNVERIFIED",
    officialDocs: "NOT VERIFIED — provider documentation not accessible from this environment",
    credentialName: "NOT_DEFINED (name to be assigned when Owner approves a provider)",
    credentialConfigured: false,
    pluginRegistered: false,
    mcpServerRegistered: false,
    requiresApiAccess: true,
    requiresOwnerApproval: true,
    factsVerified: false,
    blockers: ["No provider selected", ...COMMON_BLOCKERS],
    note: "Open slot: add a new AIModelRecord + adapter + authenticated test. No provider, model or credential is assumed.",
  },
];

/** Master Doc §5 families kept as CANDIDATES ONLY — architecture-ready, NOT registered. */
export const FUTURE_MODEL_FAMILIES: {
  id: string;
  label: string;
  provider: string;
  source: string;
  status: "CANDIDATE_NOT_REGISTERED";
  connected: false;
  factsVerified: false;
  note: string;
}[] = [
  { id: "candidate-anthropic-claude", label: "Anthropic Claude", provider: "Anthropic", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only — no API, SDK, model ID or credential verified." },
  { id: "candidate-xai-grok", label: "xAI Grok", provider: "xAI", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only." },
  { id: "candidate-deepseek", label: "DeepSeek", provider: "DeepSeek", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only." },
  { id: "candidate-mistral", label: "Mistral", provider: "Mistral", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only." },
  { id: "candidate-llama", label: "Llama (via supported inference provider)", provider: "UNDECIDED", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only — inference provider not selected." },
  { id: "candidate-perplexity", label: "Perplexity", provider: "Perplexity", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only." },
  { id: "candidate-cohere", label: "Cohere", provider: "Cohere", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only." },
  { id: "candidate-qwen", label: "Qwen (through suitable provider)", provider: "UNDECIDED", source: "Master Doc §5", status: "CANDIDATE_NOT_REGISTERED", connected: false, factsVerified: false, note: "Candidate only — provider not selected." },
];

/** 1. AI TEAM STRUCTURE — Department 02, Production. */
export const AI_TEAM = {
  id: "prod-ai-dev-team",
  name: "Production AI Development Team",
  department: "02",
  departmentName: "Production",
  primaryDivision: "AI Solutions Implementation",
  supportingDivisions: ["Software Development", "Quality Assurance & Quality Control"],
  coordinatorRoleId: "role-gimms-development-agent",
  status: "CONFIGURED_LOCAL_NO_MODEL" as const,
  modelConnected: 0,
  softwareProjectsStarted: 0,
  productsGenerated: 0,
  charter: [
    "Coordinate Production AI-assisted development work under the existing universal job model (Master Doc §3)",
    "Keep one GIMMS Development Agent as Team Coordinator; no autonomous AI authority",
    "Route model-selection requests deterministically and record an auditable plan",
    "Reuse existing verified local skills before proposing any new development",
    "Require Owner approval and an authenticated test before any provider is marked connected",
  ],
  boundaries: [
    "No software development project is started in this setup",
    "No product, code, image, video or client deliverable is generated",
    "No model call, API call, plugin call or MCP call",
    "No deploy, purchase, credential request or production change",
    "No change to Dept 01, dept registry, skills gateway, job model, pages or database",
  ],
} as const;

/** 3. AI AGENT ROLES — full contracts (functions/inputs/outputs/skills/permissions/approvals). */
export type AIAgentRole = {
  id: string;
  name: string;
  type: "NATIVE_DETERMINISTIC_COORDINATOR" | "EXTERNAL_MODEL_ROLE" | "OPEN_SLOT_ROLE";
  role: string;
  department: string;
  division: string;
  modelId: string;
  status: "CONFIGURED_LOCAL_DETERMINISTIC" | "REQUIRES_API_ACCESS" | "FUTURE_SLOT";
  modelConnected: false;
  functions: string[];
  inputs: string[];
  outputs: string[];
  skills: string[];
  permissions: string[];
  approvalRequirements: string[];
  guardrails: string[];
  note: string;
};

export const AI_AGENT_ROLES: AIAgentRole[] = [
  {
    id: "role-gimms-development-agent",
    name: "GIMMS Development Agent",
    type: "NATIVE_DETERMINISTIC_COORDINATOR",
    role: "Team Coordinator",
    department: "02",
    division: "AI Solutions Implementation",
    modelId: "NONE — local deterministic role contract",
    status: "CONFIGURED_LOCAL_DETERMINISTIC",
    modelConnected: false,
    functions: [
      "Intake Owner requests and validate scope",
      "Decompose requests into structured task records (specification only)",
      "Run deterministic model selection & routing (plan only, no model call)",
      "Assign roles and produce local communication envelopes",
      "Gate QA, evidence and Owner approval",
      "Escalate to a human Owner when no model is connected",
    ],
    inputs: ["Owner request text", "task type", "optional preferred model id", "existing local skill catalogue"],
    outputs: ["routing plan with evidence hash", "communication plan (DRAFT envelopes)", "readiness checklist", "Owner approval request"],
    skills: ["dev.requirements.decompose", "dev.architecture.review", "dev.qa.checklist", "dev.human.handoff", "job.intake", "job.route", "status.transition", "progress.report", "owner.dashboard"],
    permissions: ["ai-team.config.read", "routing.plan.write", "communication.draft.write", "qa.local.read"],
    approvalRequirements: [
      "Owner approval before any external model is enabled",
      "Owner approval before any software development project starts",
      "Owner approval before any permission or production change",
    ],
    guardrails: ["No autonomous execution", "No model call", "No external sending", "No invented capability claim"],
    note: "This is a ROLE CONTRACT, not an AI model and not an autonomous agent. It reuses existing local job/skills patterns.",
  },
  {
    id: "role-chatgpt-openai-gpt",
    name: "ChatGPT / OpenAI GPT",
    type: "EXTERNAL_MODEL_ROLE",
    role: "Coding & Development AI",
    department: "02",
    division: "Software Development",
    modelId: "model-chatgpt-openai-gpt",
    status: "REQUIRES_API_ACCESS",
    modelConnected: false,
    functions: ["Assist code generation tasks", "Assist code review and refactoring", "Assist unit test design", "Assist technical documentation"],
    inputs: ["scoped task specification", "repository context", "Owner-approved model ID", "tool/function-calling contract"],
    outputs: ["code-review notes (when connected)", "test plans (when connected)", "documentation drafts (when connected)"],
    skills: ["dev.code.generate", "dev.code.review", "dev.code.refactor", "dev.code.debug", "dev.test.unit.generate", "dev.docs.generate", "dev.code.scaffold"],
    permissions: ["repository.read (proposed, NOT granted)", "sandbox.write (proposed, NOT granted)"],
    approvalRequirements: ["Owner approval of provider account + API access", "Authenticated connection test", "Scoped tool permissions and RLS isolation", "Cost/quota budget approval"],
    guardrails: ["No auto-commit/push/deploy", "No production write", "No secret in prompts", "All output requires human review"],
    note: "ROLE ONLY — requires API access. 0 calls made. No exact model ID is asserted.",
  },
  {
    id: "role-google-ai-studio-gemini",
    name: "Google AI Studio / Gemini",
    type: "EXTERNAL_MODEL_ROLE",
    role: "Coding & Technical AI",
    department: "02",
    division: "Software Development",
    modelId: "model-google-ai-studio-gemini",
    status: "REQUIRES_API_ACCESS",
    modelConnected: false,
    functions: ["Assist technical/architecture analysis", "Assist API and database design", "Assist debugging and technical research", "Assist multimodal review (unverified capability)"],
    inputs: ["scoped technical question", "repository/architecture context", "Owner-approved model ID", "tool/function-calling contract"],
    outputs: ["architecture notes (when connected)", "API/schema proposals (when connected)", "debug analysis (when connected)"],
    skills: ["dev.architecture.review", "dev.api.contract.design", "dev.db.schema.design", "dev.code.debug", "dev.tech.stack.select", "dev.security.review", "dev.technical.research"],
    permissions: ["repository.read (proposed, NOT granted)", "sandbox.write (proposed, NOT granted)"],
    approvalRequirements: ["Owner approval of provider account + API access", "Authenticated connection test", "Scoped tool permissions and RLS isolation", "Cost/quota budget approval"],
    guardrails: ["No auto-commit/push/deploy", "No production write", "No secret in prompts", "All output requires human review", "Multimodal support UNVERIFIED"],
    note: "ROLE ONLY — requires API access. Google Workspace connectors are NOT this model access.",
  },
  {
    id: "role-additional-ai-models",
    name: "Additional AI Models",
    type: "OPEN_SLOT_ROLE",
    role: "Future integrations",
    department: "02",
    division: "AI Solutions Implementation",
    modelId: "model-additional-ai-slot",
    status: "FUTURE_SLOT",
    modelConnected: false,
    functions: ["Accept future provider registrations", "Preserve routing/ranking interface", "Preserve connection-test contract"],
    inputs: ["Owner-approved provider + model IDs", "credential name", "adapter + test"],
    outputs: ["registered model record (future)", "authenticated test evidence (future)"],
    skills: ["dev.model.eval", "dev.plugin.mcp.register", "dev.function.calling.map", "dev.integration.test"],
    permissions: ["ai-team.registry.write (proposed, NOT granted)"],
    approvalRequirements: ["Owner approval per provider", "Authenticated test before connected:true"],
    guardrails: ["No provider assumed", "No pricing/quota claim", "No auto-registration"],
    note: "Architecture-ready slot. Master Doc §5 candidate families are listed separately as NOT REGISTERED.",
  },
];

/** 4. REQUIRED DEVELOPMENT SKILLS — SPECIFICATION ONLY, none implemented. */
export type DevelopmentSkillSpec = {
  id: string;
  name: string;
  purpose: string;
  category: string;
  ownerRoleId: string;
  preferredModelId: string;
  inputs: string[];
  outputs: string[];
  executableSteps: string[];
  implementationStatus: "SPEC_ONLY_NOT_IMPLEMENTED";
  executable: false;
  recommendedArchitecture: "NATIVE" | "EXTERNAL" | "HYBRID";
  existingReusableSkills: string[];
  externalNeeded: string[];
  pluginOrMcp: "NOT_REGISTERED";
  approvalRequirements: string[];
  priority: "P1" | "P2" | "P3";
  note: string;
};

const SKILL_ROWS: Array<[
  id: string, name: string, purpose: string, category: string, ownerRoleId: string,
  preferredModelId: string, inputs: string[], outputs: string[], steps: string[],
  architecture: "NATIVE" | "EXTERNAL" | "HYBRID", reusable: string[], external: string[], priority: "P1" | "P2" | "P3",
]> = [
  ["dev.requirements.decompose", "Requirements decomposition", "Split an Owner request into scoped, auditable task records", "Planning", "role-gimms-development-agent", "NONE", ["Owner request", "job model fields"], ["structured task list"], ["validate scope", "extract deliverables", "map to job fields", "hash evidence"], "NATIVE", ["job.intake", "job.route"], [], "P1"],
  ["dev.architecture.review", "Architecture review", "Review proposed architecture against existing modules", "Architecture", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["architecture description", "repo context"], ["architecture review notes"], ["read modules", "identify boundaries", "flag risks", "record evidence"], "HYBRID", ["system.audit", "dependency.check"], ["Gemini API access"], "P1"],
  ["dev.tech.stack.select", "Tech stack selection", "Select technologies without adding unapproved dependencies", "Architecture", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["requirements", "existing package.json"], ["stack decision DRAFT"], ["read dependencies", "compare options", "flag approval need"], "HYBRID", ["dependency.check"], ["Gemini API access"], "P2"],
  ["dev.api.contract.design", "API contract design", "Define request/response contract for future endpoints", "Architecture", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["capability description"], ["API contract DRAFT"], ["name endpoints", "define payloads", "define errors", "define auth"], "HYBRID", ["integration.inventory"], ["Gemini API access"], "P2"],
  ["dev.db.schema.design", "Database schema design", "Design schema changes without writing to production", "Architecture", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["data requirements"], ["schema DRAFT"], ["model entities", "define RLS", "flag migration approval"], "HYBRID", ["env.hygiene"], ["Gemini API access", "RLS migration approval"], "P2"],
  ["dev.code.generate", "Code generation", "Generate source code for an approved development project", "Coding", "role-chatgpt-openai-gpt", "model-chatgpt-openai-gpt", ["approved spec", "repo context"], ["code DRAFT"], ["validate approval", "generate", "human review", "test"], "EXTERNAL", [], ["OpenAI API access", "Owner project approval"], "P2"],
  ["dev.code.scaffold", "Project scaffolding", "Scaffold files for an approved project", "Coding", "role-chatgpt-openai-gpt", "model-chatgpt-openai-gpt", ["approved spec"], ["file plan DRAFT"], ["validate approval", "plan files", "human review"], "HYBRID", ["code.scaffold"], ["OpenAI API access"], "P3"],
  ["dev.code.refactor", "Code refactoring", "Propose refactoring without auto-applying", "Coding", "role-chatgpt-openai-gpt", "model-chatgpt-openai-gpt", ["source files", "refactor goal"], ["refactor proposal"], ["read code", "propose changes", "hash diff", "human review"], "EXTERNAL", [], ["OpenAI API access"], "P3"],
  ["dev.code.review", "Code review", "Review code changes with human sign-off", "Coding", "role-chatgpt-openai-gpt", "model-chatgpt-openai-gpt", ["diff", "acceptance criteria"], ["review notes"], ["read diff", "check criteria", "list findings", "escalate"], "HYBRID", ["qa.check"], ["OpenAI API access"], "P2"],
  ["dev.code.debug", "Debugging analysis", "Analyse a reported defect without auto-fixing", "Coding", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["error report", "logs (redacted)"], ["debug analysis"], ["read report", "rank causes", "propose tests", "human review"], "HYBRID", ["error.report"], ["Gemini API access"], "P2"],
  ["dev.test.unit.generate", "Unit test generation", "Draft unit tests for approved code", "Testing", "role-chatgpt-openai-gpt", "model-chatgpt-openai-gpt", ["source", "spec"], ["test DRAFT"], ["identify cases", "draft tests", "run locally", "record evidence"], "EXTERNAL", [], ["OpenAI API access"], "P2"],
  ["dev.test.regression.plan", "Regression plan", "Build a regression test plan", "Testing", "role-gimms-development-agent", "NONE", ["change list"], ["regression plan"], ["list affected areas", "map to existing harness", "record plan"], "NATIVE", ["qa.check", "delivery.checklist"], [], "P1"],
  ["dev.qa.checklist", "QA checklist", "Production QA gate using verified local checks", "QA", "role-gimms-development-agent", "NONE", ["change list", "evidence"], ["QA checklist + evidence hash"], ["run local checks", "collect hashes", "flag failures"], "NATIVE", ["qa.check", "seo.audit.local"], [], "P1"],
  ["dev.delivery.checklist", "Delivery checklist", "Verify required files and evidence before delivery", "QA", "role-gimms-development-agent", "NONE", ["deliverable list"], ["checklist + hashes"], ["list files", "hash each", "report missing"], "NATIVE", ["delivery.checklist"], [], "P1"],
  ["dev.docs.generate", "Technical documentation", "Draft technical docs for approved work", "Documentation", "role-chatgpt-openai-gpt", "model-chatgpt-openai-gpt", ["source", "spec"], ["docs DRAFT"], ["read source", "draft", "human review"], "EXTERNAL", ["knowledge.index"], ["OpenAI API access"], "P3"],
  ["dev.readme.draft", "README / handoff draft", "Draft a handoff document", "Documentation", "role-gimms-development-agent", "NONE", ["change summary"], ["handoff DRAFT"], ["summarise", "list boundaries", "hash"], "NATIVE", ["knowledge.index"], [], "P2"],
  ["dev.knowledge.index", "Knowledge index", "Index local markdown with SHA-256", "Documentation", "role-gimms-development-agent", "NONE", ["local docs"], ["index"], ["scan", "hash", "report"], "NATIVE", ["knowledge.index"], [], "P1"],
  ["dev.security.review", "Security review", "Review security scope, secrets and isolation", "Security", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["change list", "env config"], ["security notes"], ["check scopes", "check secrets", "check RLS", "escalate"], "HYBRID", ["env.hygiene", "system.audit"], ["Gemini API access", "RLS review"], "P1"],
  ["dev.dependency.audit", "Dependency audit", "Audit installed dependencies and new-dependency requests", "Security", "role-gimms-development-agent", "NONE", ["package.json"], ["dependency report"], ["read deps", "detect new SDK", "flag approval"], "NATIVE", ["dependency.check"], [], "P1"],
  ["dev.env.hygiene", "Env hygiene", "Verify no local secret files and no credential leakage", "Security", "role-gimms-development-agent", "NONE", [".gitignore", ".env.example"], ["hygiene report"], ["check env files", "check gitignore", "report"], "NATIVE", ["env.hygiene"], [], "P1"],
  ["dev.cost.quota.tracking", "Cost / quota tracking", "Track token use, rate limits and budgets", "Operations", "role-additional-ai-models", "model-additional-ai-slot", ["usage telemetry"], ["usage report"], ["collect usage", "apply budgets", "alert"], "EXTERNAL", [], ["Provider telemetry API", "Owner budget approval"], "P2"],
  ["dev.prompt.engineering", "Prompt / skill engineering", "Version reusable prompts and skill specs", "AI Engineering", "role-additional-ai-models", "model-additional-ai-slot", ["skill spec", "test cases"], ["versioned skill spec"], ["define spec", "define test", "version", "review"], "HYBRID", [], ["Model access for evaluation"], "P2"],
  ["dev.skill.test.version", "Skill testing & versioning", "One executable handler + one test per skill", "AI Engineering", "role-gimms-development-agent", "NONE", ["handler", "test"], ["versioned evidence"], ["spec test", "run", "hash", "version"], "NATIVE", ["qa.check"], [], "P1"],
  ["dev.model.eval", "Model evaluation", "Benchmark model latency, quality, cost", "AI Engineering", "role-additional-ai-models", "model-additional-ai-slot", ["model id", "eval set"], ["eval report"], ["define metrics", "run authenticated test", "record evidence"], "EXTERNAL", [], ["Provider API access", "Owner-approved eval set"], "P2"],
  ["dev.plugin.mcp.register", "Plugin / MCP registration", "Register plugins and MCP servers with scoped tools", "AI Engineering", "role-additional-ai-models", "model-additional-ai-slot", ["tool contract", "scopes"], ["registration record"], ["define tool", "set scopes", "authenticate", "test"], "EXTERNAL", [], ["MCP runtime", "Owner approval"], "P2"],
  ["dev.function.calling.map", "Function-calling map", "Map model tool calls to the single skills gateway", "AI Engineering", "role-gimms-development-agent", "NONE", ["tool list", "skill ids"], ["mapping DRAFT"], ["list tools", "map to skills", "set allowlist"], "HYBRID", ["integration.inventory"], ["Function-calling provider"], "P2"],
  ["dev.integration.test", "Authenticated connection test", "Prove a provider works before connected:true", "AI Engineering", "role-additional-ai-models", "model-additional-ai-slot", ["credential", "endpoint"], ["raw test evidence"], ["authenticate", "call", "verify response", "store evidence"], "EXTERNAL", [], ["Credential + Owner approval"], "P1"],
  ["dev.technical.research", "Technical research", "Evidence-based technical research with named sources", "Research", "role-google-ai-studio-gemini", "model-google-ai-studio-gemini", ["sources"], ["research report"], ["validate sources", "reject invented facts", "hash report"], "HYBRID", ["research.report", "source.verify"], ["Gemini API access"], "P3"],
  ["dev.human.handoff", "Human handoff", "Escalate to Owner when no model is connected", "Workflow", "role-gimms-development-agent", "NONE", ["blocked plan"], ["handoff record"], ["detect blocker", "notify Owner locally", "record evidence"], "NATIVE", ["owner.dashboard", "progress.report"], [], "P1"],
];

export const REQUIRED_DEVELOPMENT_SKILLS: DevelopmentSkillSpec[] = SKILL_ROWS.map(
  ([id, name, purpose, category, ownerRoleId, preferredModelId, inputs, outputs, steps, architecture, reusable, external, priority]) => ({
    id,
    name,
    purpose,
    category,
    ownerRoleId,
    preferredModelId,
    inputs,
    outputs,
    executableSteps: steps,
    implementationStatus: "SPEC_ONLY_NOT_IMPLEMENTED",
    executable: false,
    recommendedArchitecture: architecture,
    existingReusableSkills: reusable,
    externalNeeded: external,
    pluginOrMcp: "NOT_REGISTERED",
    approvalRequirements: [
      "Owner approval before implementation",
      "An executable handler + one test per skill",
      architecture === "EXTERNAL" || architecture === "HYBRID"
        ? "Provider API access + authenticated test before connected:true"
        : "No external provider required",
    ],
    priority,
    note: "CONFIGURATION ONLY — a required-skill specification, NOT an implemented handler. No code/product was generated.",
  }),
);

/** Existing verified local skills REUSED as read-only references (no reimplementation). */
export const EXISTING_REUSABLE_SKILLS = [
  { id: "job.intake", location: "lib/skills.ts", verified: true, note: "Creates a real local job via shared job model" },
  { id: "job.route", location: "lib/skills.ts", verified: true, note: "Deterministic department routing (reused by model-selection plan)" },
  { id: "status.transition", location: "lib/skills.ts", verified: true, note: "Validated 13-state job transitions" },
  { id: "progress.report", location: "lib/skills.ts", verified: true, note: "Real local job counts" },
  { id: "owner.dashboard", location: "lib/skills.ts", verified: true, note: "Honest snapshot, connected:0" },
  { id: "qa.check", location: "lib/skills.ts", verified: true, note: "Real registry/job integrity checks" },
  { id: "delivery.checklist", location: "lib/skills.ts", verified: true, note: "Real file hashing" },
  { id: "dependency.check", location: "lib/skills.ts", verified: true, note: "Confirms 0 AI SDKs installed" },
  { id: "system.audit", location: "lib/skills.ts", verified: true, note: "Real local config counts" },
  { id: "env.hygiene", location: "lib/skills.ts", verified: true, note: "No .env.local / no secrets" },
  { id: "integration.inventory", location: "lib/skills.ts", verified: true, note: "connectedApis:0, plugins:0, mcpServers:0" },
  { id: "knowledge.index", location: "lib/skills.ts", verified: true, note: "SHA-256 index of local docs" },
  { id: "research.report", location: "lib/skills.ts", verified: true, note: "Named sources only, no invented facts" },
  { id: "code.scaffold", location: "lib/skills.ts", verified: true, note: "DRAFT routine ONLY — not a code generator" },
  { id: "error.report", location: "lib/skills.ts", verified: true, note: "Local failed-check collection" },
] as const;

/** 6. API / PLUGIN CONNECTION FRAMEWORK — contract only, zero connections. */
export const CONNECTION_FRAMEWORK = {
  version: "1.0-config-only",
  status: "FRAMEWORK_ONLY_NOT_CONNECTED" as const,
  gateway: "POST /api/skills (existing single gateway; any future adapter must route through it)",
  adapterContract: {
    required: ["provider", "exact model IDs", "server-side credential NAME", "authenticated test", "executable handler", "one test per skill", "raw evidence hash", "kill switch"],
    transport: "NOT_IMPLEMENTED — Owner must approve an SDK/HTTP adapter",
    endpoint: "UNVERIFIED — provider docs not accessible from this environment",
    streaming: "UNVERIFIED",
    toolFunctionCalling: "UNVERIFIED",
    multimodal: "UNVERIFIED",
  },
  credentialPolicy: {
    serverSideOnly: true,
    approvedSecretsManagerOnly: true,
    namesOnlyInChat: true,
    valuesNeverPrinted: true,
    configuredCount: 0,
    requestedCount: 0,
  },
  authenticatedTestContract: {
    requiredBeforeConnectedTrue: true,
    evidence: ["timestamp", "provider response id", "model id", "latency", "SHA-256 of raw response"],
    status: "NOT_PERFORMED",
  },
  plugin: { registered: 0, registry: "NONE", status: "NOT_REGISTERED" as const },
  mcp: { servers: 0, tools: 0, status: "NOT_REGISTERED" as const },
  functionCalling: { providers: 0, registeredTools: 0, status: "NOT_REGISTERED" as const },
  guardrails: [
    "connected:true ONLY after an authenticated test with raw evidence",
    "No secret value in chat, Git, logs or client code",
    "No auto-commit, auto-push, auto-deploy, auto-posting or auto-payment",
    "Client isolation via RLS, not prompt text",
    "Scoped tool allowlist; human review of every model output",
    "Cost/quota budgets and kill switch before any LIVE use",
    "MANUAL publishing until Owner approves otherwise",
  ],
} as const;

export type ConnectionSlot = {
  modelId: string;
  label: string;
  status: "NOT_REGISTERED";
  connected: false;
  credentialConfigured: false;
  sdkInstalled: false;
  adapterImplemented: false;
  pluginRegistered: false;
  mcpServerRegistered: false;
  authenticatedTest: "NOT_PERFORMED";
  connectedAt: null;
  readinessGates: { name: string; pass: false }[];
};

export const CONNECTION_SLOTS: ConnectionSlot[] = AI_MODEL_REGISTRY.map((model) => ({
  modelId: model.id,
  label: model.label,
  status: "NOT_REGISTERED",
  connected: false,
  credentialConfigured: false,
  sdkInstalled: false,
  adapterImplemented: false,
  pluginRegistered: false,
  mcpServerRegistered: false,
  authenticatedTest: "NOT_PERFORMED",
  connectedAt: null,
  readinessGates: [
    { name: "Owner approval of provider + API access", pass: false },
    { name: "Provider account / billing decision", pass: false },
    { name: "Exact model IDs confirmed from official docs", pass: false },
    { name: "Credential stored server-side in approved secrets manager", pass: false },
    { name: "SDK / HTTP adapter implemented + tested", pass: false },
    { name: "Scoped tool allowlist + RLS isolation", pass: false },
    { name: "Cost / quota budget + kill switch", pass: false },
    { name: "Authenticated connection test with raw evidence", pass: false },
    { name: "One executable handler + one test per skill", pass: false },
  ],
}));

/** 7. TEAM COMMUNICATION WORKFLOW — local structured envelopes, NEVER sent externally. */
export const COMMUNICATION_WORKFLOW = {
  id: "prod-ai-team-comm-v1",
  name: "Production AI Development Team — Communication Workflow",
  status: "CONFIGURED_LOCAL_NO_EXTERNAL_DELIVERY" as const,
  externalChannelsConnected: 0,
  externalMessagesSent: 0,
  delivery: "LOCAL_ONLY_NOT_SENT" as const,
  envelopeFields: ["envelopeId", "sequence", "stage", "from", "to", "kind", "payloadRef", "approvalRequired", "evidenceHash", "status", "delivery"],
  stages: [
    { sequence: 1, stage: "OWNER_REQUEST", from: "Owner", to: "GIMMS Development Agent", kind: "REQUEST", approvalRequired: false },
    { sequence: 2, stage: "COORDINATOR_INTAKE", from: "GIMMS Development Agent", to: "Local job model", kind: "INTAKE_DRAFT", approvalRequired: false },
    { sequence: 3, stage: "TASK_DECOMPOSITION", from: "GIMMS Development Agent", to: "GIMMS Development Agent", kind: "SPEC_DRAFT", approvalRequired: false },
    { sequence: 4, stage: "MODEL_ROUTING_PLAN", from: "GIMMS Development Agent", to: "Selected model role (PLAN ONLY)", kind: "ROUTING_PLAN", approvalRequired: true },
    { sequence: 5, stage: "ASSIGNMENT_REQUEST", from: "GIMMS Development Agent", to: "Model role", kind: "BLOCKED_NO_API", approvalRequired: true },
    { sequence: 6, stage: "DEVELOPMENT_WORK", from: "Model role", to: "GIMMS Development Agent", kind: "NOT_STARTED", approvalRequired: true },
    { sequence: 7, stage: "QUALITY_CHECK", from: "GIMMS Development Agent", to: "Production QA", kind: "LOCAL_CHECKS_ONLY", approvalRequired: true },
    { sequence: 8, stage: "HUMAN_HANDOFF", from: "GIMMS Development Agent", to: "Owner", kind: "ESCALATION", approvalRequired: true },
    { sequence: 9, stage: "OWNER_APPROVAL", from: "Owner", to: "GIMMS Development Agent", kind: "PENDING_DECISION", approvalRequired: true },
  ],
  rules: [
    "No envelope is delivered to Slack, email, Gmail, Google Chat, Teams or any external service",
    "No model is called; ASSIGNMENT_REQUEST stays BLOCKED_NO_API",
    "No software development project is started from a communication plan",
    "Every envelope is a local DRAFT with an evidence hash",
    "Owner approval is required before any stage can become executable",
    "Uses the existing universal job model fields (Master Doc §3) as the envelope contract",
  ],
} as const;

export function teamSummary() {
  const connectedModels = AI_MODEL_REGISTRY.filter((model) => Boolean(model.connected)).length;
  return {
    teamConfigured: true,
    department: AI_TEAM.department,
    coordinator: AI_TEAM.coordinatorRoleId,
    modelsRegistered: AI_MODEL_REGISTRY.length,
    modelsConnected: connectedModels,
    modelsRequiringApiAccess: AI_MODEL_REGISTRY.filter((model) => model.requiresApiAccess).length,
    namedInitialModels: AI_MODEL_REGISTRY.filter((model) => model.kind === "NAMED_INITIAL").length,
    extensibleSlots: AI_MODEL_REGISTRY.filter((model) => model.kind === "EXTENSIBLE_SLOT").length,
    futureCandidateFamilies: FUTURE_MODEL_FAMILIES.length,
    agentRoles: AI_AGENT_ROLES.length,
    agentRolesWithFullContract: AI_AGENT_ROLES.filter(
      (role) => role.functions.length && role.inputs.length && role.outputs.length && role.skills.length && role.permissions.length && role.approvalRequirements.length,
    ).length,
    requiredDevelopmentSkills: REQUIRED_DEVELOPMENT_SKILLS.length,
    developmentSkillsImplemented: REQUIRED_DEVELOPMENT_SKILLS.filter((skill) => skill.executable).length,
    existingReusableSkills: EXISTING_REUSABLE_SKILLS.length,
    connectionSlots: CONNECTION_SLOTS.length,
    registeredConnections: CONNECTION_SLOTS.filter((slot) => slot.connected).length,
    pluginsRegistered: CONNECTION_FRAMEWORK.plugin.registered,
    mcpServers: CONNECTION_FRAMEWORK.mcp.servers,
    sdkInstalled: AI_MODEL_REGISTRY.filter((model) => model.sdkInstalled).length,
    workflowStages: COMMUNICATION_WORKFLOW.stages.length,
    externalMessagesSent: COMMUNICATION_WORKFLOW.externalMessagesSent,
    softwareProjectsStarted: AI_TEAM.softwareProjectsStarted,
    productsGenerated: AI_TEAM.productsGenerated,
    authenticatedConnectionTests: 0,
    credentialsConfigured: 0,
    credentialsRequested: 0,
    deploymentPerformed: false,
  };
}

/** Fail-closed: every reference in every role must resolve to a known skill spec or existing skill. */
export function validateRoleSkillReferences() {
  const known = new Set([
    ...REQUIRED_DEVELOPMENT_SKILLS.map((skill) => skill.id),
    ...EXISTING_REUSABLE_SKILLS.map((skill) => skill.id),
    "HANDOFF.md",
  ]);
  const missing = AI_AGENT_ROLES.flatMap((role) =>
    role.skills.filter((skill) => !known.has(skill)).map((skill) => `${role.id}:${skill}`),
  );
  return { valid: missing.length === 0, missing };
}

export function connectionReadiness(slotId?: string) {
  const slots = slotId ? CONNECTION_SLOTS.filter((slot) => slot.modelId === slotId) : CONNECTION_SLOTS;
  return {
    frameworkStatus: CONNECTION_FRAMEWORK.status,
    slots: slots.map((slot) => ({
      modelId: slot.modelId,
      label: slot.label,
      status: slot.status,
      gatesTotal: slot.readinessGates.length,
      gatesPassed: slot.readinessGates.filter((gate) => gate.pass).length,
      ready: false,
      connected: false,
    })),
    allGatesPassing: false,
    registeredConnections: 0,
    note: "Readiness evaluation only. No credential, adapter, plugin, MCP server or connection was created.",
  };
}
