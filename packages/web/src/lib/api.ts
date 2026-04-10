import type {
  Agent,
  AgentCreateParams,
  AgentUpdateParams,
  AgentListParams,
  Session,
  SessionCreateParams,
  SessionListParams,
  Environment,
  EnvironmentCreateParams,
  EnvironmentListParams,
  Vault,
  VaultCreateParams,
  VaultListParams,
  SessionEvent,
  EventListParams,
  EventSendParams,
  PageCursor,
} from "@open-managed-agents/types";

const BASE = "/v1";

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(`API ${res.status}: ${body}`);
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
}

function toSearchParams(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const str = sp.toString();
  return str ? `?${str}` : "";
}

// ── Agents ──────────────────────────────────────────────────────────────

export function listAgents(params?: AgentListParams) {
  return request<PageCursor<Agent>>(
    `/agents${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

export function getAgent(id: string) {
  return request<Agent>(`/agents/${id}`);
}

export function createAgent(params: AgentCreateParams) {
  return request<Agent>("/agents", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function updateAgent(id: string, params: AgentUpdateParams) {
  // NB: the server uses POST /v1/agents/:id for partial updates, NOT
  // PUT. Keeping this wrong would 404 every Save click from the UI.
  return request<Agent>(`/agents/${id}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function archiveAgent(id: string) {
  // The archive route is POST /v1/agents/:id/archive (soft archive
  // that sets archived_at). There is NO DELETE route — the previous
  // client used DELETE which silently 404'd every Archive click.
  return request<Agent>(`/agents/${id}/archive`, { method: "POST" });
}

// ── Sessions ────────────────────────────────────────────────────────────

export function listSessions(params?: SessionListParams) {
  return request<PageCursor<Session>>(
    `/sessions${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

export function getSession(id: string) {
  return request<Session>(`/sessions/${id}`);
}

export function createSession(params: SessionCreateParams) {
  return request<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function stopSession(id: string) {
  return request<Session>(`/sessions/${id}/stop`, { method: "POST" });
}

export function archiveSession(id: string) {
  // POST /v1/sessions/:id/archive is the SOFT archive (sets archived_at).
  // The DELETE route hard-deletes — keep them distinct on the client.
  return request<Session>(`/sessions/${id}/archive`, { method: "POST" });
}

// ── Session Events ──────────────────────────────────────────────────────

export function listSessionEvents(
  sessionId: string,
  params?: EventListParams,
) {
  return request<PageCursor<SessionEvent>>(
    `/sessions/${sessionId}/events${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

export function sendSessionEvents(
  sessionId: string,
  params: EventSendParams,
) {
  return request<{ data: SessionEvent[] }>(
    `/sessions/${sessionId}/events`,
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

/**
 * Stream session events via SSE.
 * Returns an EventSource-like interface that calls onEvent for each event.
 */
export function streamSessionEvents(
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
  onError?: (error: Event) => void,
): { close: () => void } {
  // withCredentials ensures the oma_session cookie flows on cross-
  // origin deployments (same-origin already works by default). The
  // server's SSE endpoint is auth-gated, so without this the stream
  // 401s whenever the web app is hosted on a different origin than
  // the API.
  const evtSource = new EventSource(
    `${BASE}/sessions/${sessionId}/events/stream`,
    { withCredentials: true },
  );

  evtSource.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as SessionEvent;
      onEvent(parsed);
    } catch {
      // skip unparseable events
    }
  };

  evtSource.onerror = (err) => {
    onError?.(err);
  };

  return {
    close: () => evtSource.close(),
  };
}

// ── Environments ────────────────────────────────────────────────────────

export function listEnvironments(params?: EnvironmentListParams) {
  return request<PageCursor<Environment>>(
    `/environments${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

export function getEnvironment(id: string) {
  return request<Environment>(`/environments/${id}`);
}

export function createEnvironment(params: EnvironmentCreateParams) {
  return request<Environment>("/environments", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function archiveEnvironment(id: string) {
  // POST /v1/environments/:id/archive is the SOFT archive (sets
  // archived_at). DELETE /v1/environments/:id is the HARD delete
  // path — previously the UI used DELETE which meant clicking
  // "Archive" actually dropped the row permanently.
  return request<Environment>(`/environments/${id}/archive`, {
    method: "POST",
  });
}

// ── Vaults ──────────────────────────────────────────────────────────────

export function listVaults(params?: VaultListParams) {
  return request<PageCursor<Vault>>(
    `/vaults${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

export function getVault(id: string) {
  return request<Vault>(`/vaults/${id}`);
}

export function createVault(params: VaultCreateParams) {
  return request<Vault>("/vaults", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function archiveVault(id: string) {
  // Same shape as archiveEnvironment — POST /archive is soft, DELETE
  // is hard. The UI means soft.
  return request<Vault>(`/vaults/${id}/archive`, { method: "POST" });
}

// ── Vault credentials ──────────────────────────────────────────────────

export interface VaultCredential {
  id: string;
  vault_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function listVaultCredentials(vaultId: string) {
  return request<{ data: VaultCredential[] }>(
    `/vaults/${vaultId}/credentials`,
  );
}

export function createVaultCredential(
  vaultId: string,
  params: { name: string; value: string },
) {
  return request<VaultCredential>(`/vaults/${vaultId}/credentials`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function deleteVaultCredential(vaultId: string, credentialId: string) {
  return request<{ deleted: boolean }>(
    `/vaults/${vaultId}/credentials/${credentialId}`,
    { method: "DELETE" },
  );
}

// ── Providers ──────────────────────────────────────────────────────────────

export interface LLMProvider {
  id: string;
  name: string;
  type: "anthropic" | "openai" | "openai-compatible" | "ollama";
  base_url: string | null;
  default_model: string | null;
  is_default: boolean;
  has_api_key: boolean;
  created_at: string;
  updated_at: string;
}

export function listProviders() {
  return request<{ data: LLMProvider[] }>("/providers");
}

export function createProvider(params: {
  name: string;
  type: string;
  api_key?: string;
  base_url?: string;
  default_model?: string;
  is_default?: boolean;
}) {
  return request<LLMProvider>("/providers", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function deleteProvider(id: string) {
  return request<{ deleted: boolean }>(`/providers/${id}`, { method: "DELETE" });
}

export function listProviderModels(providerId: string) {
  return request<{ models: string[] }>(`/providers/${providerId}/models`);
}

// ── Agent builder chat ───────────────────────────────────────────────

export interface AgentBuilderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentBuilderDraft {
  name?: string;
  description?: string;
  system?: string;
  model?: string;
  mcp_servers?: Array<{ name: string; url?: string; type?: string }>;
  tools?: Array<Record<string, unknown>>;
  skills?: Array<{ type: string; skill_id: string }>;
}

export interface AgentBuilderChatResponse {
  reply: string;
  draft: AgentBuilderDraft;
  done: boolean;
  provider: { id: string; name: string };
}

export function agentBuilderChat(params: {
  messages: AgentBuilderMessage[];
  draft?: AgentBuilderDraft;
  provider_id?: string;
  model?: string;
}) {
  return request<AgentBuilderChatResponse>("/agent-builder/chat", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ── MCP Discovery ──────────────────────────────────────────────────────────

export interface MCPConnector {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  category: string;
  auth_type: "oauth" | "token" | "none";
  connected?: boolean;
}

export function listMCPConnectors(params?: {
  search?: string;
  category?: string;
}) {
  return request<{ data: MCPConnector[] }>(
    `/mcp/connectors${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

export function getMCPConnector(id: string) {
  return request<MCPConnector>(`/mcp/connectors/${id}`);
}

export function connectMCPConnector(id: string, token: string) {
  return request<{ id: string; connector_id: string; auth_type: string; created_at: string }>(
    `/mcp/connectors/${id}/connect`,
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  );
}

export function disconnectMCPConnector(id: string) {
  return request<{ deleted: boolean }>(`/mcp/connectors/${id}/connect`, {
    method: "DELETE",
  });
}

// ── Governance (orgs / teams / users / policies) ───────────────────────
// Previously Settings hit these endpoints with raw `fetch(...).then(r =>
// r.json())`, which silently swallowed 401s — the error body landed as
// "data" and the page showed empty lists. Route everything through the
// error-throwing request() helper so the QueryCache 401 hook fires.

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string | null;
  created_at: string;
}

export function listOrganizations() {
  return request<{ data: Organization[] }>("/organizations");
}

export function listUsers() {
  return request<{ data: User[] }>("/users");
}

export function listTeams(orgId: string) {
  return request<{ data: Team[] }>(`/organizations/${orgId}/teams`);
}

export function createTeam(
  orgId: string,
  params: { name: string; slug: string; description?: string },
) {
  return request<Team>(`/organizations/${orgId}/teams`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function createUser(params: {
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  organization_id: string;
  password?: string;
}) {
  return request<User>("/users", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface TeamProviderAccess {
  team_id: string;
  provider_id: string;
  enabled: boolean;
  rate_limit_rpm: number | null;
  monthly_budget_usd: number | null;
}

export function listTeamProviderAccess(teamId: string) {
  return request<{ data: TeamProviderAccess[] }>(
    `/teams/${teamId}/provider-access`,
  );
}

export function setTeamProviderAccess(
  teamId: string,
  params: {
    provider_id: string;
    enabled: boolean;
    rate_limit_rpm?: number | null;
    monthly_budget_usd?: number | null;
  },
) {
  return request<TeamProviderAccess>(`/teams/${teamId}/provider-access`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export type McpPolicyKind = "allowed" | "blocked" | "requires_approval";

export interface TeamMcpPolicy {
  team_id: string;
  connector_id: string;
  policy: McpPolicyKind;
}

export function listTeamMcpPolicies(teamId: string) {
  return request<{ data: TeamMcpPolicy[] }>(`/teams/${teamId}/mcp-policies`);
}

export function setTeamMcpPolicy(
  teamId: string,
  params: { connector_id: string; policy: McpPolicyKind },
) {
  return request<TeamMcpPolicy>(`/teams/${teamId}/mcp-policies`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ── Audit log ──────────────────────────────────────────────────────────
export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function listAuditLog(params?: {
  limit?: number;
  resource_type?: string;
}) {
  return request<{ data: AuditLogEntry[] }>(
    `/audit-log${toSearchParams(params as Record<string, string | number | boolean | undefined> ?? {})}`,
  );
}

// ── Usage summary ─────────────────────────────────────────────────────
export interface UsageSummary {
  total_sessions: number;
  total_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  by_agent: Array<{
    agent_id: string;
    agent_name: string;
    session_count: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  }>;
  by_provider: Array<{
    provider_id: string;
    provider_name: string;
    provider_type: string;
    session_count: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  }>;
}

export function getUsageSummary() {
  return request<UsageSummary>("/usage/summary");
}
