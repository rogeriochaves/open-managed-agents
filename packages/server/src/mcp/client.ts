/**
 * MCP SSE + JSON-RPC client.
 *
 * Manages a persistent SSE connection to each MCP server URL and
 * sends JSON-RPC requests over HTTP POST to execute tools.
 *
 * Protocol flow:
 *   1. Connect to GET /sse  → receives server events as SSE stream
 *   2. Send  POST /         → JSON-RPC request (tools/list, tools/call, etc.)
 *   3. Receive events on SSE stream, match to pending requests
 *
 * The SSE stream carries both:
 *   - Responses to our POST requests (matching request ID)
 *   - Unsolicited server notifications (e.g. cancellation, progress)
 */

import type {
  MCPServerConnection,
  MCPServerConfig,
  MCPEvent,
  MCPToolsListResult,
  MCPToolCallResult,
} from "./types.js";
import { MCP_ERROR_CODES } from "./types.js";
import type { ToolDefinition } from "../providers/index.js";

const SSE_REQUEST_TIMEOUT_MS = 60_000;  // 1 minute for tool list
const TOOL_CALL_TIMEOUT_MS = 120_000;  // 2 minutes for long-running tools

// ── Connection manager ────────────────────────────────────────────────────────

/**
 * Creates a live MCP server connection and starts listening on the SSE stream.
 */
export async function createMCPServerConnection(
  config: MCPServerConfig,
  onNotification?: (method: string, params: Record<string, unknown>) => void
): Promise<MCPServerConnection> {
  const abortController = new AbortController();

  const pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  // Build auth header
  const authHeader = config.authToken
    ? `Bearer ${config.authToken}`
    : undefined;

  // Start SSE listener — fire and forget; it runs in the background and
  // feeds responses into pendingRequests as they arrive over the stream.
  // We do NOT await it: SSE responses are long-lived and never "complete",
  // so awaiting would deadlock createMCPServerConnection indefinitely.
  startSSEListener(config.url, authHeader, pendingRequests, onNotification, abortController.signal)
    .catch((err) => console.error(`[MCP] SSE listener error for ${config.name}:`, err));

  const conn: MCPServerConnection = {
    name: config.name,
    url: config.url,
    authHeader,
    tools: [],
    initialized: false,
    abortController,
    requestId: 0,
    pendingRequests,
  };

  return conn;
}

/**
 * Start listening to the SSE stream from the MCP server.
 * Parses SSE events and routes JSON-RPC responses to pending requests.
 */
async function startSSEListener(
  serverUrl: string,
  authHeader: string | undefined,
  pendingRequests: MCPServerConnection["pendingRequests"],
  onNotification: ((method: string, params: Record<string, unknown>) => void) | undefined,
  signal: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  // Build SSE endpoint URL (append /sse if not already present)
  const sseUrl = serverUrl.endsWith("/sse") ? serverUrl : `${serverUrl}/sse`;

  let response: Response;
  try {
    response = await fetch(sseUrl, { headers, signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw new MCPConnectionError(
      `SSE connection failed: ${(err as Error).message}`,
      MCP_ERROR_CODES.CONNECTION_FAILED
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new MCPConnectionError(
      `SSE connection failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
      MCP_ERROR_CODES.CONNECTION_FAILED
    );
  }

  if (!response.body) {
    throw new MCPConnectionError(
      "SSE response has no body",
      MCP_ERROR_CODES.CONNECTION_FAILED
    );
  }

  // SSE parser state
  let eventLines = "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      for (const char of chunk) {
        if (char === "\n") {
          const line = eventLines.trimEnd();
          eventLines = "";

          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const event: MCPEvent = JSON.parse(data);
              handleMCPEvent(event, pendingRequests, onNotification);
            } catch {
              // Skip malformed JSON lines
            }
          }
        } else if (char !== "\r") {
          eventLines += char;
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw new MCPConnectionError(
      `SSE stream error: ${(err as Error).message}`,
      MCP_ERROR_CODES.CONNECTION_FAILED
    );
  }
}

/**
 * Handle an MCPEvent received over SSE.
 * Routes responses to pending requests, notifications to callbacks.
 */
function handleMCPEvent(
  event: MCPEvent,
  pendingRequests: MCPServerConnection["pendingRequests"],
  onNotification: ((method: string, params: Record<string, unknown>) => void) | undefined
): void {
  if (event.id !== undefined) {
    const pending = pendingRequests.get(event.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(event.id);
      if (event.error) {
        pending.reject(new MCPError(
          event.error.message,
          event.error.code ?? MCP_ERROR_CODES.SERVER_ERROR,
          event.error.data
        ));
      } else {
        pending.resolve(event.result);
      }
    }
  } else if (event.method && onNotification) {
    onNotification(event.method, event.params ?? {});
  }
}

// ── JSON-RPC request/response ────────────────────────────────────────────────

/**
 * Send a JSON-RPC request to the MCP server via POST and wait for SSE response.
 */
function sendJSONRPCRequest(
  conn: MCPServerConnection,
  method: string,
  params: Record<string, unknown> | undefined,
  timeoutMs: number
): Promise<unknown> {
  const id = conn.requestId++;

  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    id,
    method,
  };
  if (params) body.params = params;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.pendingRequests.delete(id);
      reject(new MCPError(`Request ${method} timed out after ${timeoutMs}ms`, MCP_ERROR_CODES.TIMEOUT));
    }, timeoutMs);

    conn.pendingRequests.set(id, { resolve, reject, timeout });

    // POST to the base URL (strip /sse suffix)
    const postUrl = conn.url.replace(/\/sse$/, "/");

    fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(conn.authHeader ? { Authorization: conn.authHeader } : {}),
      },
      body: JSON.stringify(body),
      signal: conn.abortController.signal,
    }).catch((err) => {
      const pending = conn.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        conn.pendingRequests.delete(id);
        pending.reject(new MCPConnectionError(
          `POST request failed: ${err.message}`,
          MCP_ERROR_CODES.CONNECTION_FAILED
        ));
      }
    });
  });
}

// ── Tool operations ──────────────────────────────────────────────────────────

/**
 * Discover all tools available on an MCP server via tools/list.
 * Called once when the server connection is first established.
 */
export async function discoverMCPTools(conn: MCPServerConnection): Promise<ToolDefinition[]> {
  try {
    const result = await sendJSONRPCRequest(
      conn,
      "tools/list",
      undefined,
      SSE_REQUEST_TIMEOUT_MS
    );

    const toolResult = result as MCPToolsListResult | undefined;
    if (!toolResult?.tools) return [];

    conn.tools = toolResult.tools.map(tool => ({
      name: `mcp_${conn.name}_${tool.name}`,
      description: tool.description ?? `MCP tool: ${tool.name}`,
      input_schema: tool.input_schema ?? { type: "object", properties: {} },
    }));

    conn.initialized = true;
    return conn.tools;
  } catch (err) {
    console.warn(`[MCP] Failed to discover tools for ${conn.name}: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Call a tool on an MCP server via tools/call.
 * The full tool name is `mcp_{serverName}_{toolName}`.
 */
export async function callMCPTool(
  conn: MCPServerConnection,
  fullToolName: string,
  args: Record<string, unknown>
): Promise<{ content: string; is_error: boolean }> {
  // Parse: mcp_github_list_issues → server=github, tool=list_issues
  const parts = fullToolName.split("_");
  if (parts.length < 3 || parts[0] !== "mcp") {
    return { content: `Invalid MCP tool name format: ${fullToolName}`, is_error: true };
  }
  const toolName = parts.slice(2).join("_");

  try {
    const result = await sendJSONRPCRequest(
      conn,
      "tools/call",
      { name: toolName, arguments: args },
      TOOL_CALL_TIMEOUT_MS
    );

    const toolResult = result as MCPToolCallResult | undefined;
    if (!toolResult) {
      return { content: "No result returned from MCP tool", is_error: true };
    }

    // Render content blocks to text
    const textParts = (toolResult.content ?? []).map(block => {
      if (block.type === "text") return block.text ?? "";
      if (block.type === "image" && block.data) {
        return `[image: ${block.data.substring(0, 50)}${block.data.length > 50 ? "..." : ""}]`;
      }
      if (block.type === "resource" && block.resource?.text) return block.resource.text;
      return JSON.stringify(block);
    });

    const text = textParts.join("\n") || "Tool executed successfully (no output)";
    return { content: text, is_error: !!toolResult.isError };
  } catch (err) {
    return {
      content: `MCP tool error: ${(err as Error).message}`,
      is_error: true,
    };
  }
}

/**
 * Close an MCP server connection and reject all pending requests.
 */
export function closeMCPServerConnection(conn: MCPServerConnection): void {
  conn.abortController.abort();
  for (const [id, pending] of conn.pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new MCPError("Connection closed", MCP_ERROR_CODES.SERVER_ERROR));
    conn.pendingRequests.delete(id);
  }
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "MCPError";
  }
}

export class MCPConnectionError extends MCPError {
  constructor(message: string, code: number) {
    super(message, code);
    this.name = "MCPConnectionError";
  }
}
