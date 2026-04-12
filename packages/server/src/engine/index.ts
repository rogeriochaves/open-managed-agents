/**
 * Agent execution engine.
 *
 * Manages the agent loop: receives user messages, calls the LLM provider,
 * processes tool calls, and emits events. Supports streaming.
 */

import { getDB, newId } from "../db/index.js";
import type {
  LLMProvider,
  ChatMessage,
  ContentPart,
  ToolDefinition,
  ChatCompletionChunk,
} from "../providers/index.js";
import {
  loadConnectorToken,
  listMCPTools,
  callMCPTool,
  MCPClientError,
} from "../lib/mcp-client.js";
import { resolveMCPCredential } from "../mcp/registry.js";
import {
  resolveMCPTools,
  executeMCPTool,
  isMCPTool,
  mcpToolRequiresConfirmation,
  MCPExecutorConfig,
} from "../mcp/executor.js";

export interface AgentConfig {
  name: string;
  system: string | null;
  model: string;
  tools: any[];
  mcp_servers: any[];
  skills: any[];
  /** Session IDs whose vaults supply MCP credentials. */
  vault_ids?: string[];
}

export interface SessionEventEmitter {
  emit(event: SessionEventData): void;
  close(): void;
}

export interface SessionEventData {
  id: string;
  type: string;
  [key: string]: unknown;
  processed_at: string;
}

// Built-in tool definitions for the agent toolset
const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "web_search",
    description: "Search the web for information. Returns search results with titles, URLs, and snippets.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description: "Fetch the content of a web page by URL.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    },
  },
];

/**
 * A routing table built alongside the tool list: maps the
 * LLM-facing tool name back to the connector + URL + original
 * tool name so executeBuiltinTool can call the right MCP server.
 */
interface MCPToolRoute {
  connectorId: string;
  url: string;
  token: string | null;
  originalName: string;
}

export interface ResolvedTools {
  tools: ToolDefinition[];
  mcpRoutes: Map<string, MCPToolRoute>;
}

/**
 * Resolves tool definitions from agent config.
 *
 * Built-in + custom tools are returned unchanged. For every entry in
 * agentConfig.mcp_servers we open a short-lived MCP connection
 * (StreamableHTTPClientTransport + Bearer from vault or mcp_connections)
 * and list the server's real tools. Each remote tool is added to the
 * LLM's tool list with a `__mcp__<connector>__<tool>` prefix and
 * a matching entry in `mcpRoutes` so callMCPTool() can route a tool
 * call back to the right server.
 *
 * Credential resolution order: vault (via resolveMCPCredential) first,
 * then falling back to the mcp_connections table. This ensures that
 * vault-based credentials — stored under sessions.vault_ids — are
 * always preferred over org-scoped connector tokens.
 *
 * If a connector fails (no token stored, unreachable, 401, …) we log
 * the reason and skip it. The agent still runs with whatever tools
 * did resolve rather than erroring out the whole turn.
 */
export async function resolveTools(
  agentConfig: AgentConfig,
  organizationId: string,
  sessionId?: string,
): Promise<ResolvedTools> {
  const tools: ToolDefinition[] = [];
  const mcpRoutes = new Map<string, MCPToolRoute>();

  for (const tool of agentConfig.tools) {
    if (tool.type === "agent_toolset_20260401") {
      tools.push(...AGENT_TOOLS);
    } else if (tool.type === "custom") {
      tools.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema ?? { type: "object", properties: {} },
      });
    }
  }

  // Process mcp_toolset entries using the MCP executor
  const mcpToolsets = agentConfig.tools.filter((t) => t.type === "mcp_toolset");
  if (mcpToolsets.length > 0 && agentConfig.mcp_servers && agentConfig.mcp_servers.length > 0) {
    const executorConfig: MCPExecutorConfig = {
      sessionId: sessionId ?? "",
      mcpServers: agentConfig.mcp_servers.map((s) => ({ name: String(s.name ?? ""), url: String(s.url ?? "") })),
      mcpToolsets: mcpToolsets as any,
      vaultIds: agentConfig.vault_ids ?? [],
    };
    try {
      const mcpTools = await resolveMCPTools(executorConfig);
      tools.push(...mcpTools);
    } catch (err) {
      console.warn(
        `[engine] failed to resolve MCP toolsets:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  for (const mcp of agentConfig.mcp_servers ?? []) {
    const connectorId = String(mcp.name ?? "");
    const url = String(mcp.url ?? "");
    if (!connectorId || !url) continue;

    let token: string | null = null;
    const vaultIds = agentConfig.vault_ids ?? [];

    // 1. Try vault credentials first (per-session vault IDs).
    if (sessionId && vaultIds.length > 0) {
      try {
        const vaultCred = await resolveMCPCredential(sessionId, connectorId);
        if (vaultCred) {
          token = vaultCred.token;
        }
      } catch (err) {
        console.warn(
          `[engine] vault credential lookup failed for ${connectorId}:`,
          err instanceof Error ? err.message : err,
        );
        // Fall through to mcp_connections below.
      }
    }

    // 2. Fall back to org-scoped mcp_connections table.
    if (token === null) {
      try {
        token = await loadConnectorToken(organizationId, connectorId);
      } catch (err) {
        console.warn(
          `[engine] failed to load token for ${connectorId}:`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }
    }

    try {
      const remoteTools = await listMCPTools(url, token);
      for (const t of remoteTools) {
        const prefixed = `__mcp__${connectorId}__${t.name}`;
        tools.push({
          name: prefixed,
          description: t.description
            ? `[${connectorId}] ${t.description}`
            : `[${connectorId}] ${t.name}`,
          input_schema: t.input_schema,
        });
        mcpRoutes.set(prefixed, {
          connectorId,
          url,
          token,
          originalName: t.name,
        });
      }
    } catch (err) {
      const msg =
        err instanceof MCPClientError
          ? `${err.type}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.warn(
        `[engine] skipping MCP connector ${connectorId} (${url}): ${msg}`,
      );
      // Fall through — the agent keeps running with the tools we did
      // resolve. A degraded-but-working agent is better than a hard
      // failure mid-turn.
    }
  }

  return { tools, mcpRoutes };
}

/**
 * Execute a built-in tool and return the result.
 *
 * If the tool name starts with `__mcp__<connector>__`, it's routed
 * through the MCP client using the matching route from resolveTools.
 *
 * If the tool name starts with `mcp_`, it's routed through the MCP executor
 * using the session-scoped MCP session.
 */
export async function executeBuiltinTool(
  name: string,
  input: Record<string, unknown>,
  mcpRoutes?: Map<string, MCPToolRoute>,
  sessionId?: string,
): Promise<{ content: string; is_error: boolean }> {
  try {
    // ── Remote MCP tool (new mcp_ prefix via executor) ───────────
    if (isMCPTool(name)) {
      if (!sessionId) {
        return {
          content: `MCP tool ${name} requires a session ID but none was provided.`,
          is_error: true,
        };
      }
      try {
        const result = await executeMCPTool(sessionId, name, input);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: `MCP tool execution failed (${name}): ${msg}`,
          is_error: true,
        };
      }
    }

    // ── Legacy MCP tool (__mcp__ prefix via mcpRoutes) ────────────
    if (name.startsWith("__mcp__") && mcpRoutes?.has(name)) {
      const route = mcpRoutes.get(name)!;
      try {
        const result = await callMCPTool(
          route.url,
          route.token,
          route.originalName,
          input,
        );
        const text = (result.content ?? [])
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text!)
          .join("\n")
          .trim();
        return {
          content: text || JSON.stringify(result.content ?? []),
          is_error: result.is_error === true,
        };
      } catch (err) {
        const msg =
          err instanceof MCPClientError
            ? `${err.type}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        return {
          content: `MCP call failed (${route.connectorId}.${route.originalName}): ${msg}`,
          is_error: true,
        };
      }
    }

    if (name === "web_search") {
      // Simple web search implementation
      const query = input.query as string;
      return {
        content: `Web search results for "${query}":\n\n(Web search is available when connected to a search provider. Configure a web search MCP server or API key to enable live results.)`,
        is_error: false,
      };
    }
    if (name === "web_fetch") {
      const url = input.url as string;
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "OpenManagedAgents/0.1.0" },
          signal: AbortSignal.timeout(30000),
        });
        const text = await response.text();
        // Truncate to avoid huge responses
        const truncated = text.length > 10000 ? text.slice(0, 10000) + "\n\n[... truncated]" : text;
        return { content: truncated, is_error: false };
      } catch (err: any) {
        return { content: `Failed to fetch ${url}: ${err.message}`, is_error: true };
      }
    }

    return {
      content: `Unknown tool: ${name}`,
      is_error: true,
    };
  } catch (err: any) {
    return {
      content: `Tool execution error: ${err.message}`,
      is_error: true,
    };
  }
}

/**
 * Store an event in the database and return it.
 */
export async function storeEvent(
  sessionId: string,
  type: string,
  data: Record<string, unknown>
): Promise<SessionEventData> {
  const db = await getDB();
  const id = newId("evt");
  const processed_at = new Date().toISOString();
  const event: SessionEventData = { id, type, ...data, processed_at };

  await db.run(
    "INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)",
    id, sessionId, type, JSON.stringify(data), processed_at
  );

  return event;
}

/**
 * Update session status in the database.
 */
async function updateSessionStatus(sessionId: string, status: string) {
  const db = await getDB();
  await db.run(
    "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
    status, new Date().toISOString(), sessionId
  );
}

/**
 * Update session usage stats.
 */
async function updateSessionUsage(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  cacheRead: number,
  _cacheWrite: number
) {
  const db = await getDB();
  const session = await db.get<any>("SELECT usage, stats FROM sessions WHERE id = ?", sessionId);
  if (!session) return;

  const usage = JSON.parse(session.usage || "{}");
  const stats = JSON.parse(session.stats || "{}");

  usage.input_tokens = (usage.input_tokens ?? 0) + inputTokens;
  usage.output_tokens = (usage.output_tokens ?? 0) + outputTokens;
  usage.cache_read_input_tokens = (usage.cache_read_input_tokens ?? 0) + cacheRead;

  await db.run(
    "UPDATE sessions SET usage = ?, stats = ?, updated_at = ? WHERE id = ?",
    JSON.stringify(usage), JSON.stringify(stats), new Date().toISOString(), sessionId
  );
}

/**
 * Build conversation messages from stored events for a session.
 */
export async function buildMessagesFromEvents(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const events = await db.all<{ type: string; data: string }>(
    "SELECT type, data FROM events WHERE session_id = ? ORDER BY processed_at ASC",
    sessionId
  );

  const messages: ChatMessage[] = [];

  for (const evt of events) {
    const data = JSON.parse(evt.data);

    if (evt.type === "user.message") {
      const text = (data.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      if (text) {
        messages.push({ role: "user", content: text });
      }
    } else if (evt.type === "agent.message") {
      const text = (data.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      if (text) {
        // Check if there are subsequent tool_use events that belong to this turn
        messages.push({ role: "assistant", content: text });
      }
    } else if (evt.type === "agent.tool_use") {
      // Skip MCP tools that are still pending user confirmation.
      // The engine emits them with evaluated_permission="pending" and goes
      // idle. Once the user approves/denies, the tool confirmation handler
      // updates this event and re-triggers the engine.
      if (data.evaluated_permission === "pending") {
        continue;
      }

      // Add tool_use as part of assistant message
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        if (typeof last.content === "string") {
          last.content = [
            { type: "text", text: last.content },
            { type: "tool_use", id: data.tool_use_id ?? data.id, name: data.name, input: data.input ?? {} },
          ];
        } else if (Array.isArray(last.content)) {
          last.content.push({
            type: "tool_use",
            id: data.tool_use_id ?? data.id,
            name: data.name,
            input: data.input ?? {},
          });
        }
      } else {
        messages.push({
          role: "assistant",
          content: [
            { type: "tool_use", id: data.tool_use_id ?? data.id, name: data.name, input: data.input ?? {} },
          ],
        });
      }
    } else if (evt.type === "agent.tool_result") {
      const resultText = (data.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: data.tool_use_id,
            content: resultText,
            is_error: data.is_error ?? false,
          },
        ],
      });
    }
  }

  return messages;
}

/**
 * Run the agent loop for a session. Processes a single user turn:
 * calls the LLM, processes tool calls, loops until done or max iterations.
 */
export async function runAgentLoop(
  sessionId: string,
  agentConfig: AgentConfig,
  provider: LLMProvider,
  emitter?: SessionEventEmitter,
  maxIterations = 20,
  organizationId = "org_default",
): Promise<void> {
  const { tools, mcpRoutes } = await resolveTools(agentConfig, organizationId, sessionId);
  let iteration = 0;

  // Mark session as running
  await updateSessionStatus(sessionId, "running");
  const runningEvent = await storeEvent(sessionId, "session.status_running", {});
  emitter?.emit(runningEvent);

  try {
    while (iteration < maxIterations) {
      iteration++;

      // Cooperative cancellation: check the session status before
      // each LLM call. If a user clicked Stop on the UI (or anything
      // else POSTed /v1/sessions/:id/stop), the row has been flipped
      // to "terminated" — bail out of the loop without firing another
      // provider.chat(). The in-flight call from the previous
      // iteration has already finished; the next one never runs.
      const db = await getDB();
      const statusRow = await db.get<{ status: string }>(
        "SELECT status FROM sessions WHERE id = ?",
        sessionId,
      );
      if (statusRow?.status === "terminated") {
        // Emit session.status_terminated — a declared event type
        // that the UI already maps via EVENT_BADGES. The prior
        // implementation emitted "session.stopped" which isn't on
        // the SessionEvent union in packages/types/src/events.ts,
        // so the client's switch/case fell through to a default
        // grey badge and the badge on the list view only updated
        // when the 5s polling query refetched the session row.
        // With a declared status event on the SSE stream, the
        // badge flips immediately.
        const terminatedEvent = await storeEvent(
          sessionId,
          "session.status_terminated",
          {},
        );
        emitter?.emit(terminatedEvent);
        return;
      }

      // Build messages from stored events
      const messages = await buildMessagesFromEvents(sessionId);

      if (messages.length === 0) break;

      // Emit model request start
      const startEvent = await storeEvent(sessionId, "span.model_request_start", {});
      emitter?.emit(startEvent);

      // Call the LLM
      const result = await provider.chat({
        model: agentConfig.model,
        system: agentConfig.system ?? undefined,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      // Emit model request end with usage
      const endEvent = await storeEvent(sessionId, "span.model_request_end", {
        model_request_start_id: startEvent.id,
        model_usage: {
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
          cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
        },
        is_error: false,
      });
      emitter?.emit(endEvent);

      // Update session usage
      await updateSessionUsage(
        sessionId,
        result.usage.input_tokens,
        result.usage.output_tokens,
        result.usage.cache_read_input_tokens ?? 0,
        result.usage.cache_creation_input_tokens ?? 0
      );

      // Process response content
      const textParts = result.content.filter((p) => p.type === "text");
      const toolUseParts = result.content.filter((p) => p.type === "tool_use");

      // Emit text response as agent message
      if (textParts.length > 0) {
        const agentMsg = await storeEvent(sessionId, "agent.message", {
          content: textParts.map((p) => ({ type: "text", text: p.text })),
        });
        emitter?.emit(agentMsg);
      }

      // If no tool calls, we're done
      if (result.stop_reason !== "tool_use" || toolUseParts.length === 0) {
        break;
      }

      // Process tool calls
      for (const toolUse of toolUseParts) {
        const toolName = toolUse.name ?? "";
        const isMCP = toolName.startsWith("__mcp__") || isMCPTool(toolName);

        // Emit tool use event.
        // Custom tools: always allow (user provided the result via user.custom_tool_result).
        // MCP tools: require explicit user confirmation first.
        const evaluatedPermission = isMCP ? "pending" : "allow";
        const toolUseEvent = await storeEvent(sessionId, "agent.tool_use", {
          tool_use_id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          evaluated_permission: evaluatedPermission,
        });
        emitter?.emit(toolUseEvent);

        // Check if it's a custom tool (needs user response)
        const isCustom = agentConfig.tools.some(
          (t: any) => t.type === "custom" && t.name === toolUse.name
        );

        if (isCustom) {
          // Emit custom tool use event - user needs to provide result
          await storeEvent(sessionId, "agent.custom_tool_use", {
            name: toolUse.name,
            input: toolUse.input,
          });
          // Go idle waiting for user to provide tool result
          await updateSessionStatus(sessionId, "idle");
          const idleEvent = await storeEvent(sessionId, "session.status_idle", {
            stop_reason: {
              type: "requires_action",
              event_ids: [toolUseEvent.id],
            },
          });
          emitter?.emit(idleEvent);
          return;
        }

        // MCP tools: pause and wait for user confirmation before executing.
        // The engine will be re-triggered by user.tool_confirmation (allow/deny).
        if (isMCP) {
          await updateSessionStatus(sessionId, "idle");
          const idleEvent = await storeEvent(sessionId, "session.status_idle", {
            stop_reason: {
              type: "requires_action",
              event_ids: [toolUseEvent.id],
            },
          });
          emitter?.emit(idleEvent);
          return;
        }

        // Check if this tool already has a result in history (e.g., injected
        // by a prior deny confirmation). If so, skip re-execution.
        const allResultRows = await getDB().then((db) =>
          db.all<{ id: string; data: string }>(
            "SELECT id, data FROM events WHERE session_id = ? AND type = 'agent.tool_result'",
            sessionId,
          )
        );
        let skipped = false;
        for (const row of allResultRows) {
          try {
            const existingData = JSON.parse(row.data);
            if (existingData?.tool_use_id === toolUse.id) {
              // Result already injected (denial or prior execution) — skip.
              skipped = true;
              break;
            }
          } catch {
            // Not parseable JSON — ignore.
          }
        }
        if (skipped) {
          continue;
        }

        // Execute built-in tool
        const toolResult = await executeBuiltinTool(
          toolUse.name!,
          toolUse.input ?? {},
          mcpRoutes,
          sessionId,
        );

        // Store tool result
        const toolResultEvent = await storeEvent(sessionId, "agent.tool_result", {
          tool_use_id: toolUse.id,
          content: [{ type: "text", text: toolResult.content }],
          is_error: toolResult.is_error,
        });
        emitter?.emit(toolResultEvent);
      }

      // Continue loop for next LLM call
    }

    // Mark session as idle
    await updateSessionStatus(sessionId, "idle");
    const idleEvent = await storeEvent(sessionId, "session.status_idle", {
      stop_reason: { type: "end_turn" },
    });
    emitter?.emit(idleEvent);
  } catch (err: any) {
    console.error(`Agent loop error for session ${sessionId}:`, err);

    const errorEvent = await storeEvent(sessionId, "session.error", {
      error: {
        type: "unknown_error",
        message: err.message ?? "Unknown error",
        retry_status: { type: "terminal" },
      },
    });
    emitter?.emit(errorEvent);

    // Mark the session terminated — NOT idle. The previous
    // behavior ran updateSessionStatus(..., "idle") + emitted
    // session.status_idle with stop_reason end_turn, which made
    // a failed session indistinguishable from a successful one
    // in the UI (same green "idle" badge, same "end_turn" in the
    // stop reason). A terminated badge renders in red via the
    // statusVariant map, so operators can see at a glance that
    // the run failed.
    await updateSessionStatus(sessionId, "terminated");
    const terminatedEvent = await storeEvent(
      sessionId,
      "session.status_terminated",
      {},
    );
    emitter?.emit(terminatedEvent);
  }
}

/**
 * Create a streaming event emitter backed by a ReadableStream for SSE.
 */
export function createSSEEmitter(): {
  emitter: SessionEventEmitter;
  stream: ReadableStream;
} {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const emitter: SessionEventEmitter = {
    emit(event: SessionEventData) {
      try {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      } catch {
        // Stream may be closed
      }
    },
    close() {
      try {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch {
        // Already closed
      }
    },
  };

  return { emitter, stream };
}
