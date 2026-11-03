/**
 * GIMMS — CONNECTIONS / AUTHORIZATION REGISTRY (honest, no placeholder connections).
 *
 * This module records what IS and IS NOT wired into the GIMMS application.
 * It makes NO network call, reads NO personal mailbox/drive/calendar data,
 * sends NO email, creates NO OAuth connection, and does NOT mark anything
 * `connected:true` without an authenticated test.
 *
 * Verified 2026-11-03:
 *  - Arena connected-apps list for this conversation includes gmail,
 *    google_calendar, google_docs, google_drive, google_sheets, google_slides,
 *    linear, notion, supabase, vercel, dropbox. Those are AGENT-SIDE tools,
 *    NOT GIMMS product integrations.
 *  - A fresh list_connector_tools lookup in this turn returned `catalog_error`
 *    for gmail / google_drive / github / openai (transient catalog failure).
 *    Per tool rules those slugs were NOT retried in this turn.
 *  - Verified in the previous turn: `openai`, `gemini`, `google_ai_studio`
 *    Arena connectors are `unsupported` (none exists).
 *  - `gh` CLI is already authenticated for infoceyteq-maker/ceylongimmsai and
 *    is used only for local git/PR operations. NO new GitHub App/OAuth connection
 *    was created and NO personal account was connected.
 *  - Vercel project env has 4 NAMES only; no AI provider credential.
 *  - `/api/connect` reports connected:0.
 */

export type ConnectionStatus =
  | "CONNECTED_LOCAL_DETERMINISTIC"
  | "EXISTING_CLI_ACCESS_ONLY"
  | "NOT_CONNECTED_REQUIRES_API_ACCESS"
  | "NOT_WIRED_REQUIRES_OWNER_AUTHORIZATION";

export type ConnectionRecord = {
  id: string;
  name: string;
  category: "AI model" | "Local agent" | "Email / Workspace" | "Repository" | "Infrastructure";
  status: ConnectionStatus;
  connectedToGimms: boolean;
  arenaConnector: "enabled" | "unsupported" | "lookup_failed" | "not_applicable";
  authorizationRequired: boolean;
  scopesOrPermissions: string[];
  approvalGates: string[];
  officialApiTest: "NOT_PERFORMED" | "LOCAL_TEST_PASS";
  externalCallsMade: 0;
  emailsSent: 0;
  note: string;
};

const OWNER_GATES = [
  "Separate Owner approval for the account/API access",
  "Credential stored server-side in an approved secrets manager (no value in chat)",
  "Scoped permissions reviewed and accepted by the Owner",
  "Authenticated connection test with raw evidence before any connected:true",
  "Cost/quota budget + kill switch (for paid APIs)",
];

export const CONNECTION_REGISTRY: ConnectionRecord[] = [
  {
    id: "gimms-development-agent",
    name: "GIMMS Development Agent (Team Coordinator)",
    category: "Local agent",
    status: "CONNECTED_LOCAL_DETERMINISTIC",
    connectedToGimms: true,
    arenaConnector: "not_applicable",
    authorizationRequired: false,
    scopesOrPermissions: ["ai-team.config.read", "routing.plan.write", "qa.local.read"],
    approvalGates: [],
    officialApiTest: "LOCAL_TEST_PASS",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "REAL and locally tested deterministic role contract (NOT an AI model). Configured in PR #7, exercised by /api/production/ai-team and this chat workflow.",
  },
  {
    id: "openai-gpt",
    name: "OpenAI GPT",
    category: "AI model",
    status: "NOT_CONNECTED_REQUIRES_API_ACCESS",
    connectedToGimms: false,
    arenaConnector: "unsupported",
    authorizationRequired: true,
    scopesOrPermissions: ["OPENAI_API_KEY (server-side name only)", "model inference scope"],
    approvalGates: OWNER_GATES,
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "No Arena connector exists (`unsupported`, verified previous turn; fresh lookup hit catalog_error). No SDK, no credential, no official API call. Exact model IDs/pricing/quotas UNVERIFIED.",
  },
  {
    id: "google-gemini",
    name: "Google Gemini / AI Studio",
    category: "AI model",
    status: "NOT_CONNECTED_REQUIRES_API_ACCESS",
    connectedToGimms: false,
    arenaConnector: "unsupported",
    authorizationRequired: true,
    scopesOrPermissions: ["GOOGLE_AI_STUDIO_API_KEY (server-side name only)", "model inference scope"],
    approvalGates: OWNER_GATES,
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "No Arena connector exists (`unsupported`). Google Workspace connectors are NOT Gemini model access. No SDK, no credential, no official API call.",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Email / Workspace",
    status: "NOT_WIRED_REQUIRES_OWNER_AUTHORIZATION",
    connectedToGimms: false,
    arenaConnector: "enabled",
    authorizationRequired: true,
    scopesOrPermissions: ["gmail.readonly (proposed)", "gmail.send (proposed, NOT granted)"],
    approvalGates: OWNER_GATES,
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "Arena connector enabled for this CONVERSATION (agent-side). Fresh lookup returned catalog_error; not retried. NO GIMMS integration wired, NO mailbox read, NO email sent. Owner approval required for new account access.",
  },
  {
    id: "google-workspace",
    name: "Google Workspace (Docs / Sheets / Slides)",
    category: "Email / Workspace",
    status: "NOT_WIRED_REQUIRES_OWNER_AUTHORIZATION",
    connectedToGimms: false,
    arenaConnector: "enabled",
    authorizationRequired: true,
    scopesOrPermissions: ["drive.file (proposed)", "documents / spreadsheets / presentations read-write (proposed, NOT granted)"],
    approvalGates: OWNER_GATES,
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "Arena-side agent tools only. NOT Google AI Studio / Gemini. No GIMMS integration wired, no personal data read.",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "Email / Workspace",
    status: "NOT_WIRED_REQUIRES_OWNER_AUTHORIZATION",
    connectedToGimms: false,
    arenaConnector: "lookup_failed",
    authorizationRequired: true,
    scopesOrPermissions: ["drive.readonly (proposed)", "drive.file (proposed, NOT granted)"],
    approvalGates: OWNER_GATES,
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "Enabled per conversation settings; fresh list_connector_tools lookup hit `catalog_error` this turn (not retried). No Drive data read, no files uploaded, no connection created.",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "Email / Workspace",
    status: "NOT_WIRED_REQUIRES_OWNER_AUTHORIZATION",
    connectedToGimms: false,
    arenaConnector: "enabled",
    authorizationRequired: true,
    scopesOrPermissions: ["calendar.readonly (proposed)", "calendar.events (proposed, NOT granted)"],
    approvalGates: OWNER_GATES,
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "Arena-side agent tool enabled per settings. No GIMMS integration wired, no events read or created.",
  },
  {
    id: "github",
    name: "GitHub (existing repository CLI access)",
    category: "Repository",
    status: "EXISTING_CLI_ACCESS_ONLY",
    connectedToGimms: false,
    arenaConnector: "lookup_failed",
    authorizationRequired: true,
    scopesOrPermissions: ["existing `gh` CLI auth for infoceyteq-maker/ceylongimmsai (read/write repo ops)", "new GitHub App / OAuth (proposed, NOT created)"],
    approvalGates: ["Separate Owner approval before any NEW GitHub account/app/scopes"],
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "Existing `gh` authorization was used only for local git/PR operations (verified read-only with gh repo view). NO new GitHub integration, NO personal account connected. Fresh connector lookup hit catalog_error.",
  },
  {
    id: "supabase-vercel",
    name: "Supabase / Vercel (existing infrastructure)",
    category: "Infrastructure",
    status: "EXISTING_CLI_ACCESS_ONLY",
    connectedToGimms: false,
    arenaConnector: "enabled",
    authorizationRequired: true,
    scopesOrPermissions: ["4 Vercel env NAMES only", "read-only hub_state inspection (no production write in this task)"],
    approvalGates: ["Separate Owner approval before any production write, deploy or AI-provider credential"],
    officialApiTest: "NOT_PERFORMED",
    externalCallsMade: 0,
    emailsSent: 0,
    note: "Used read-only to audit env names / hub_state. No AI provider credential exists. No deploy in this task.",
  },
];

/** Prepared, NOT SENT. Names/scopes only — no values and no request made. */
export const AUTHORIZATION_REQUESTS = {
  status: "PREPARED_NOT_SENT",
  requestedCredentials: 0,
  emailsSent: 0,
  personalAccountsConnected: 0,
  items: [
    { name: "OPENAI_API_KEY", purpose: "OpenAI GPT official API access", ownerApprovalRequired: true },
    { name: "GOOGLE_AI_STUDIO_API_KEY", purpose: "Gemini official API access", ownerApprovalRequired: true },
    { name: "Gmail OAuth scopes", purpose: "Email & account connection", ownerApprovalRequired: true },
    { name: "Google Workspace / Drive / Calendar OAuth scopes", purpose: "Workspace connections", ownerApprovalRequired: true },
    { name: "GitHub App or OAuth installation", purpose: "Repository management integration", ownerApprovalRequired: true },
    { name: "Supabase Auth / SSO for production Owner identity", purpose: "Replace local dev login before real use", ownerApprovalRequired: true },
  ],
};

export function connectionsSummary() {
  return {
    total: CONNECTION_REGISTRY.length,
    connectedToGimms: CONNECTION_REGISTRY.filter((record) => record.connectedToGimms).length,
    aiModelsConnected: CONNECTION_REGISTRY.filter((record) => record.category === "AI model" && record.connectedToGimms).length,
    requiresAuthorization: CONNECTION_REGISTRY.filter((record) => record.authorizationRequired).length,
    officialApiTestsPassed: CONNECTION_REGISTRY.filter((record) => record.officialApiTest === "LOCAL_TEST_PASS").length,
    officialApiTestsNotPerformed: CONNECTION_REGISTRY.filter((record) => record.officialApiTest === "NOT_PERFORMED").length,
    emailsSent: 0,
    externalCallsMade: 0,
    authorizationRequestsSent: 0,
    note: "0 AI model connections. Nothing was marked connected:true without an authenticated test.",
  };
}
