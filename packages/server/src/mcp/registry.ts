/**
 * MCP Server Registry.
 *
 * Manages live MCP server connections using a **global connection pool**.
 *
 * Connections are shared across sessions when they use the same MCP server URL
 * and the same authentication (same token). This avoids redundant SSE connections
 * under high concurrency.
 *
 * Design:
 *   - `globalConnections`: Map<mcpServerKey, GlobalMCPConnection>
 *       Key = "${serverName}@${authTokenHash || 'anonymous'}"
 *       Value = the shared connection + ref count
 *   - `sessionRefs`: Map<sessionId, Set<mcpServerKey>>
 *       Tracks which sessions reference which global connections
 *
 * Lifecycle:
 *   - getOrCreateMCPServerConnection(): finds or creates a shared connection
 *   - closeMCPSession(): decrements ref counts, closes connection when last session leaves
 *   - cleanupMCPSession(): alias for closeMCPSession (called from engine finally block)
 */

import type {
  MCPSession,
  MCPServerConnection,
  MCPServerCredential,
  MCPServerConfig,
} from "./types.js";
import {
  createMCPServerConnection,
  closeMCPServerConnection,
  discoverMCPTools,
} from "./client.js";
import { getDB } from "../db/index.js";
import { decrypt } from "../lib/encryption.js";
import type { ToolDefinition } from "../providers/index.js";

// ── Auth info for known connectors ───────────────────────────────────────────

export const CONNECTOR_AUTH_INFO: Record<
  string,
  { authType: "oauth" | "token" | "none"; scopes?: string[]; tokenEnvVar?: string }
> = {
  slack:         { authType: "oauth",  scopes: ["channels:read","chat:write","files:write"] },
  notion:        { authType: "oauth",  scopes: ["read","write"] },
  github:        { authType: "token",  tokenEnvVar: "MCP_GITHUB_TOKEN" },
  linear:        { authType: "oauth",  scopes: ["read","write"] },
  sentry:        { authType: "token",  tokenEnvVar: "MCP_SENTRY_TOKEN" },
  asana:         { authType: "oauth",  scopes: ["default"] },
  amplitude:     { authType: "token",  tokenEnvVar: "MCP_AMPLITUDE_TOKEN" },
  intercom:      { authType: "oauth",  scopes: ["read","write"] },
  atlassian:     { authType: "oauth",  scopes: ["read","write"] },
  "google-drive":{ authType: "oauth",  scopes: ["https://www.googleapis.com/auth/drive"] },
  postgres:      { authType: "token",  tokenEnvVar: "MCP_POSTGRES_CONNECTION_STRING" },
  stripe:        { authType: "token",  tokenEnvVar: "MCP_STRIPE_TOKEN" },
  posthog:       { authType: "token",  tokenEnvVar: "MCP_POSTHOG_TOKEN" },
  hubspot:       { authType: "oauth",  scopes: ["crm.objects.contacts.read","crm.objects.contacts.write"] },
  zendesk:       { authType: "oauth",  scopes: ["read","write"] },
  datadog:       { authType: "token",  tokenEnvVar: "MCP_DATADOG_TOKEN" },
};

// ── Global connection pool ──────────────────────────────────────────────────────

interface MCPSessionRef {
  sessionId: string;
}

/** A globally-shared MCP server connection with a reference count */
interface GlobalMCPConnection {
  /** The server name */
  name: string;
  /** The shared connection (SSE stream, HTTP client) */
  conn: MCPServerConnection;
  /** Sessions currently using this connection */
  refCount: number;
  /** Auth token used for this connection (for cache key) */
  authToken?: string;
  /** When the connection was established */
  connectedAt: string;
}

/**
 * Global pool of shared MCP server connections.
 * Key = "${serverName}@${authTokenHash || 'anonymous'}"
 */
const globalConnections = new Map<string, GlobalMCPConnection>();

/**
 * Maps each agent session ID to the set of global connection keys it uses.
 * Used to decrement ref counts and clean up when a session ends.
 */
const sessionRefs = new Map<string, Set<string>>();

/**
 * Maps each agent session ID to its per-session MCP state.
 * The per-session state stores session-specific auth tokens resolved from vaults.
 */
const activeSessions = new Map<string, MCPSession>();

// ── Key generation ────────────────────────────────────────────────────────────

/** Generate a global connection key from server name + auth token. */
function makeConnectionKey(serverName: string, authToken?: string): string {
  const tokenPart = authToken
    ? authToken.slice(0, 8).replace(/[^a-zA-Z0-9]/g, "_") // first 8 safe chars
    : "anonymous";
  return `${serverName}@${tokenPart}`;
}

// ── Session management ────────────────────────────────────────────────────────

/**
 * Get or create the per-session MCP state for an agent session.
 */
export function getOrCreateMCPSession(sessionId: string): MCPSession {
  const existing = activeSessions.get(sessionId);
  if (existing) return existing;

  const session: MCPSession = { sessionId, servers: new Map() };
  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Get an existing MCP session (does not create).
 */
export function getMCPSession(sessionId: string): MCPSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Close all MCP connections for a session, decrementing global ref counts.
 * A global connection is only closed when the last session referencing it disconnects.
 */
export function closeMCPSession(sessionId: string): void {
  const refs = sessionRefs.get(sessionId);
  if (!refs) return;

  for (const key of refs) {
    const global = globalConnections.get(key);
    if (global) {
      global.refCount--;
      if (global.refCount <= 0) {
        // Last session — close the connection
        closeMCPServerConnection(global.conn);
        globalConnections.delete(key);
      }
    }
  }

  refs.clear();
  sessionRefs.delete(sessionId);

  const session = activeSessions.get(sessionId);
  if (session) {
    session.servers.clear();
    activeSessions.delete(sessionId);
  }
}

/**
 * Get the count of active MCP sessions and global connections (for monitoring).
 */
export function getActiveMCPSessionCount(): number {
  return activeSessions.size;
}

/**
 * Get the number of globally pooled MCP connections.
 */
export function getGlobalConnectionCount(): number {
  return globalConnections.size;
}

// ── Credential resolution ──────────────────────────────────────────────────────

/**
 * Resolve a bearer token for an MCP server from the session's vaults.
 */
export async function resolveMCPCredential(
  sessionId: string,
  mcpServerName: string
): Promise<MCPServerCredential | null> {
  const db = await getDB();

  const session = await db.get<{ vault_ids: string }>(
    "SELECT vault_ids FROM sessions WHERE id = ?",
    sessionId
  );
  if (!session) return null;

  const vaultIds: string[] = JSON.parse(session.vault_ids ?? "[]");
  if (vaultIds.length === 0) return null;

  const placeholders = vaultIds.map(() => "?").join(", ");
  const credRow = await db.get<{ value_encrypted: string }>(
    `SELECT value_encrypted FROM credentials
     WHERE vault_id IN (${placeholders})
     AND (name = ? OR name = ? OR name = ?)`,
    ...vaultIds,
    `mcp_${mcpServerName}`,
    mcpServerName,
    `mcp-${mcpServerName}`
  );

  if (!credRow) return null;

  try {
    const token = decrypt(credRow.value_encrypted);
    return { mcpServerName, authType: "bearer", token };
  } catch {
    return null;
  }
}

function getEnvToken(mcpServerName: string): string | undefined {
  const envVar = CONNECTOR_AUTH_INFO[mcpServerName]?.tokenEnvVar;
  if (envVar) return process.env[envVar];
  return process.env[`MCP_${mcpServerName.toUpperCase()}_TOKEN`];
}

// ── Server connection ──────────────────────────────────────────────────────────

/**
 * Get or create a **globally-shared** connection to a specific MCP server.
 *
 * If another session already has a connection to this server with the same auth token,
 * the session is added as a reference and the existing connection is reused.
 * The global connection is closed only when the last referencing session disconnects.
 */
export async function getOrCreateMCPServerConnection(
  sessionId: string,
  serverConfig: { name: string; url: string },
  vaultIds: string[] = []
): Promise<MCPServerConnection> {
  // Resolve credentials: vault first, then environment
  let authToken: string | undefined;
  const vaultCred = await resolveMCPCredential(sessionId, serverConfig.name);
  if (vaultCred) {
    authToken = vaultCred.token;
  } else {
    authToken = getEnvToken(serverConfig.name);
  }

  const connectionKey = makeConnectionKey(serverConfig.name, authToken);

  // Check if a global shared connection already exists
  const existingGlobal = globalConnections.get(connectionKey);
  if (existingGlobal) {
    // Reuse existing connection
    existingGlobal.refCount++;

    // Track this session's reference
    let refs = sessionRefs.get(sessionId);
    if (!refs) {
      refs = new Set();
      sessionRefs.set(sessionId, refs);
    }
    refs.add(connectionKey);

    // Also register in the per-session servers map
    const session = getOrCreateMCPSession(sessionId);
    session.servers.set(serverConfig.name, existingGlobal.conn);

    return existingGlobal.conn;
  }

  // Create a new connection
  const config: MCPServerConfig = {
    name: serverConfig.name,
    url: serverConfig.url,
    authToken,
  };

  const conn = await createMCPServerConnection(config);
  await discoverMCPTools(conn);

  // Register globally
  const global: GlobalMCPConnection = {
    name: serverConfig.name,
    conn,
    refCount: 1,
    authToken,
    connectedAt: new Date().toISOString(),
  };
  globalConnections.set(connectionKey, global);

  // Track session reference
  let refs = sessionRefs.get(sessionId);
  if (!refs) {
    refs = new Set();
    sessionRefs.set(sessionId, refs);
  }
  refs.add(connectionKey);

  // Register in per-session map
  const session = getOrCreateMCPSession(sessionId);
  session.servers.set(serverConfig.name, conn);

  return conn;
}

/**
 * Check if an MCP server is connected and initialized for a session.
 */
export function isMCPServerConnected(sessionId: string, serverName: string): boolean {
  const session = activeSessions.get(sessionId);
  return session?.servers.get(serverName)?.initialized ?? false;
}
