/**
 * MCP Tool Executor.
 *
 * Integrates real MCP tool calls into the agent engine loop.
 *
 * Integration points:
 *   - resolveMCPTools() is called from engine.resolveTools() to get real tool definitions
 *   - executeMCPTool() replaces the placeholder stub in engine.executeBuiltinTool()
 *   - cleanupMCPSession() is called when a session is terminated
 *
 * Tool name convention:
 *   mcp_{serverName}_{toolName}  → e.g. mcp_github_list_issues
 */

// Minimal inline types (duplicated from packages/types to avoid cross-package rootDir issues)
interface MCPExecutorServerDef {
  name: string;
  url: string;
}
interface MCPExecutorToolset {
  type: "mcp_toolset";
  mcp_server_name: string;
  default_config: { enabled: boolean; permission_policy: { type: string } };
  configs: Array<{ name: string; enabled: boolean; permission_policy: { type: string } }>;
}

import type { ToolDefinition } from "../providers/index.js";
import {
  getOrCreateMCPServerConnection,
  closeMCPSession,
  getOrCreateMCPSession,
} from "./registry.js";
import { callMCPTool } from "./client.js";

export interface MCPExecutorConfig {
  sessionId: string;
  mcpServers: MCPExecutorServerDef[];
  mcpToolsets: MCPExecutorToolset[];
  vaultIds: string[];
}

// ── Tool resolution ──────────────────────────────────────────────────────────

/**
 * Resolve real tool definitions from all MCP servers in the agent config.
 *
 * For each MCP server:
 *   1. Connect to the server (or reuse existing connection)
 *   2. Discover tools via JSON-RPC tools/list
 *   3. Filter based on agent's toolset permissions (enabled/disabled per tool)
 *
 * Returns a flat list of ToolDefinitions prefixed with `mcp_{serverName}_`.
 */
export async function resolveMCPTools(
  config: MCPExecutorConfig
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];

  for (const serverDef of config.mcpServers) {
    try {
      const conn = await getOrCreateMCPServerConnection(
        config.sessionId,
        { name: serverDef.name, url: serverDef.url },
        config.vaultIds
      );

      if (!conn.initialized) continue;

      // Find the toolset config for this server (if any)
      const toolset = config.mcpToolsets.find(
        (t): t is MCPExecutorToolset =>
          t.type === "mcp_toolset" && t.mcp_server_name === serverDef.name
      );

      const defaultEnabled = toolset?.default_config.enabled ?? true;

      for (const tool of conn.tools) {
        // Per-tool override from the agent's toolset config
        // The tool name in the toolset is the raw MCP tool name (no mcp_ prefix)
        const rawToolName = tool.name.replace(`mcp_${serverDef.name}_`, "");
        const toolOverride = toolset?.configs.find((c: { name: string; enabled: boolean; permission_policy: { type: string } }) => c.name === rawToolName);

        if (toolOverride !== undefined) {
          if (!toolOverride.enabled) continue;
          // Note: permission_policy (always_ask) is handled at runtime by events.ts
        } else {
          if (!defaultEnabled) continue;
        }

        tools.push(tool);
      }
    } catch (err) {
      console.warn(`[MCP] Failed to connect to server ${serverDef.name}: ${(err as Error).message}`);
      // Add a fallback error tool so the model knows the server is down
      tools.push({
        name: `mcp_${serverDef.name}_error`,
        description: `MCP server "${serverDef.name}" is unavailable: ${(err as Error).message}. Check the server URL and credentials.`,
        input_schema: { type: "object", properties: {} },
      });
    }
  }

  return tools;
}

// ── Tool execution ───────────────────────────────────────────────────────────

/**
 * Execute an MCP tool by its full prefixed name.
 *
 * @param sessionId    Agent session ID
 * @param fullToolName  e.g. "mcp_github_list_issues"
 * @param args          Tool arguments
 */
export async function executeMCPTool(
  sessionId: string,
  fullToolName: string,
  args: Record<string, unknown>
): Promise<{ content: string; is_error: boolean }> {
  const parts = fullToolName.split("_");
  if (parts.length < 3 || parts[0] !== "mcp") {
    return { content: `Invalid MCP tool name format: ${fullToolName}`, is_error: true };
  }
  const serverName = parts[1];

  const session = getOrCreateMCPSession(sessionId);
  const conn = session.servers.get(serverName);

  if (!conn) {
    return {
      content: `MCP server "${serverName}" is not connected. Add it to your agent's mcp_servers configuration.`,
      is_error: true,
    };
  }

  if (!conn.initialized) {
    return {
      content: `MCP server "${serverName}" is still initializing. Retry shortly.`,
      is_error: true,
    };
  }

  return callMCPTool(conn, fullToolName, args);
}

// ── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Clean up all MCP connections for an agent session.
 * Called when a session is terminated, deleted, or archived.
 */
export function cleanupMCPSession(sessionId: string): void {
  closeMCPSession(sessionId);
}

/**
 * Returns true if the tool name belongs to MCP.
 * Used by the engine to route tool calls.
 */
export function isMCPTool(fullToolName: string): boolean {
  return fullToolName.startsWith("mcp_");
}

/**
 * Returns the server name from an MCP tool name, or null if not an MCP tool.
 * e.g. "mcp_github_list_issues" → "github"
 */
export function getMCPServerName(fullToolName: string): string | null {
  const parts = fullToolName.split("_");
  if (parts.length >= 2 && parts[0] === "mcp") {
    return parts[1];
  }
  return null;
}

/**
 * Check if a specific MCP tool requires user confirmation (always_ask policy).
 * This is checked at runtime by the events route before tool execution.
 */
export function mcpToolRequiresConfirmation(
  fullToolName: string,
  mcpServers: MCPExecutorServerDef[],
  mcpToolsets: MCPExecutorToolset[]
): boolean {
  const serverName = getMCPServerName(fullToolName);
  if (!serverName) return false;

  const serverDef = mcpServers.find((s) => s.name === serverName);
  if (!serverDef) return false;

  const toolset = mcpToolsets.find(
    (t): t is MCPExecutorToolset =>
      t.type === "mcp_toolset" && t.mcp_server_name === serverName
  );
  if (!toolset) return false;

  const rawToolName = fullToolName.replace(`mcp_${serverName}_`, "");
  const toolOverride = toolset.configs.find((c: { name: string; enabled: boolean; permission_policy: { type: string } }) => c.name === rawToolName);

  if (toolOverride) {
    return toolOverride.permission_policy.type === "always_ask";
  }

  return toolset.default_config.permission_policy.type === "always_ask";
}
