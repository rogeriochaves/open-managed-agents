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

export interface AgentConfig {
  name: string;
  system: string | null;
  model: string;
  tools: any[];
  mcp_servers: any[];
  skills: any[];
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
 * Resolves tool definitions from agent config.
 */
function resolveTools(agentConfig: AgentConfig): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const tool of agentConfig.tools) {
    if (tool.type === "agent_toolset_20260401") {
      // Add built-in tools
      tools.push(...AGENT_TOOLS);
    } else if (tool.type === "custom") {
      tools.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema ?? { type: "object", properties: {} },
      });
    }
  }

  // Add MCP tools (placeholder - real implementation would connect to MCP servers)
  for (const mcp of agentConfig.mcp_servers) {
    tools.push({
      name: `mcp_${mcp.name}_query`,
      description: `Query the ${mcp.name} MCP server. Use this to interact with ${mcp.name}.`,
      input_schema: {
        type: "object",
        properties: {
          action: { type: "string", description: "The action to perform" },
          params: {
            type: "object",
            description: "Parameters for the action",
          },
        },
        required: ["action"],
      },
    });
  }

  return tools;
}

/**
 * Execute a built-in tool and return the result.
 */
async function executeBuiltinTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ content: string; is_error: boolean }> {
  try {
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
    if (name.startsWith("mcp_")) {
      return {
        content: `MCP tool ${name} executed with input: ${JSON.stringify(input)}. (MCP server integration pending - connect to real MCP servers for live results.)`,
        is_error: false,
      };
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
async function storeEvent(
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
async function buildMessagesFromEvents(sessionId: string): Promise<ChatMessage[]> {
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
  maxIterations = 20
): Promise<void> {
  const tools = resolveTools(agentConfig);
  let iteration = 0;

  // Mark session as running
  await updateSessionStatus(sessionId, "running");
  const runningEvent = await storeEvent(sessionId, "session.status_running", {});
  emitter?.emit(runningEvent);

  try {
    while (iteration < maxIterations) {
      iteration++;

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
        // Emit tool use event
        const toolUseEvent = await storeEvent(sessionId, "agent.tool_use", {
          tool_use_id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          evaluated_permission: "allow",
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

        // Execute built-in tool
        const toolResult = await executeBuiltinTool(
          toolUse.name!,
          toolUse.input ?? {}
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

    await updateSessionStatus(sessionId, "idle");
    const idleEvent = await storeEvent(sessionId, "session.status_idle", {
      stop_reason: { type: "end_turn" },
    });
    emitter?.emit(idleEvent);
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
