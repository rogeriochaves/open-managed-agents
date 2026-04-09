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
