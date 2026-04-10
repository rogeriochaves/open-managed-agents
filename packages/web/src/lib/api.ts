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

/** Get the API key from localStorage if set */
function getApiKeyHeader(): Record<string, string> {
  const key = typeof window !== "undefined"
    ? localStorage.getItem("oma_api_key")
    : null;
  return key ? { "x-api-key": key } : {};
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getApiKeyHeader(),
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
  return request<Agent>(`/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

export function archiveAgent(id: string) {
  return request<void>(`/agents/${id}`, { method: "DELETE" });
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
  const evtSource = new EventSource(`${BASE}/sessions/${sessionId}/events/stream`);

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
  return request<void>(`/environments/${id}`, { method: "DELETE" });
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
  return request<void>(`/vaults/${id}`, { method: "DELETE" });
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
