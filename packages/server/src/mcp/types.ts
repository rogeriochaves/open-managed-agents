/**
 * MCP (Model Context Protocol) - JSON-RPC types and data structures.
 *
 * Protocol reference:
 *   - Transport: SSE (Server-Sent Events) for server→client events
 *   - Transport: HTTP POST (application/json) for client→server requests
 *   - Format: JSON-RPC 2.0
 *
 * Key endpoints per MCP server URL:
 *   - GET  /sse  → SSE stream of server events
 *   - POST /    → JSON-RPC request (tools/list, tools/call, resources/list, etc.)
 */

import type { ToolDefinition } from "../providers/index.js";

// ── JSON-RPC 2.0 base types ─────────────────────────────────────────────────

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCSuccessResponse {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

export interface JSONRPCErrorResponse {
  jsonrpc: "2.0";
  id: string | number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;

// ── MCP wire protocol events ────────────────────────────────────────────────

/**
 * Base event envelope received over SSE.
 * The MCP protocol sends JSON-RPC messages as SSE data events.
 */
export interface MCPEvent {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  result?: unknown;
  error?: JSONRPCErrorResponse["error"];
  params?: Record<string, unknown>;
}

/**
 * Result of a tools/list call.
 */
export interface MCPToolsListResult {
  tools: MCPTool[];
}

/**
 * A tool exposed by an MCP server.
 */
export interface MCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Arguments for a tools/call request.
 */
export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result of a tools/call call.
 */
export interface MCPToolCallResult {
  content: MCPToolResultContent[];
  isError?: boolean;
}

/**
 * A content block in a tool result.
 */
export interface MCPToolResultContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;       // base64 for image
  mimeType?: string;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

/**
 * Result of a resources/list call.
 */
export interface MCPResourcesListResult {
  resources: MCPResource[];
}

/**
 * A resource exposed by an MCP server.
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// ── Internal server-side types ───────────────────────────────────────────────

/**
 * Per-session MCP session state.
 * Each agent session that uses MCP servers gets its own MCPSession.
 */
export interface MCPSession {
  /** Unique session ID (matches the agent session ID) */
  sessionId: string;
  /** All active MCP server connections keyed by server name */
  servers: Map<string, MCPServerConnection>;
  /** JWT auth token if using session-scoped auth */
  authToken?: string;
}

/**
 * A live connection to a single MCP server.
 */
export interface MCPServerConnection {
  /** Server name (e.g. "github", "slack") */
  name: string;
  /** SSE endpoint URL */
  url: string;
  /** Authorization header value (Bearer token or API key) */
  authHeader?: string;
  /** Cached list of tools exposed by this server */
  tools: ToolDefinition[];
  /** Whether tools have been discovered */
  initialized: boolean;
  /** Abort controller for cleanup */
  abortController: AbortController;
  /** Pending JSON-RPC request ID counter */
  requestId: number;
  /** Pending requests map (id → resolve/reject) */
  pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>;
}

/**
 * Configuration for connecting to an MCP server.
 */
export interface MCPServerConfig {
  name: string;
  url: string;
  /** Bearer token or API key */
  authToken?: string;
  /** Per-tool overrides */
  toolPermissions?: Record<string, "allow" | "block" | "ask">;
}

/**
 * Credential resolved from a vault for an MCP server.
 */
export interface MCPServerCredential {
  mcpServerName: string;
  authType: "bearer" | "oauth";
  token: string;
  expiresAt?: string;
}

// ── Error codes ─────────────────────────────────────────────────────────────

export const MCP_ERROR_CODES = {
  // Standard JSON-RPC codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP-specific codes
  SERVER_ERROR: -32000,
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
  CONNECTION_FAILED: -32003,
  AUTH_FAILED: -32004,
  TIMEOUT: -32005,
} as const;
