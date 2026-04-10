/**
 * MCP (Model Context Protocol) module.
 *
 * Provides real MCP server connectivity for the agent engine.
 *
 * Submodules:
 *   types.ts     - JSON-RPC 2.0 types, MCP wire protocol types, internal types
 *   client.ts    - SSE connection manager + JSON-RPC request/response over SSE
 *   registry.ts  - Per-session MCP server registry, vault credential resolution
 *   executor.ts  - Integration with the agent engine loop
 *
 * Usage:
 *   1. In the engine loop, call resolveMCPTools() to get real tool definitions
 *   2. Route MCP tool calls to executeMCPTool()
 *   3. On session end, call cleanupMCPSession()
 */

export * from "./types.js";
export * from "./client.js";
export * from "./registry.js";
export * from "./executor.js";
