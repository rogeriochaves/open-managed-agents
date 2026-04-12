/**
 * Unit tests for the mcp/executor module.
 *
 * Covers:
 *   - isMCPTool() — pure function
 *   - getMCPServerName() — pure function
 *   - mcpToolRequiresConfirmation() — pure function
 *   - resolveMCPTools() — mocked registry + client
 *   - executeMCPTool() — mocked registry + client
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi, beforeEach } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-mcp-executor-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "***";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

// ── Stub external dependencies ────────────────────────────────────────────────

const getOrCreateMCPServerConnectionMock = vi.fn();
const getOrCreateMCPSessionMock = vi.fn();
const closeMCPSessionMock = vi.fn();
const callMCPToolMock = vi.fn();

vi.mock("../mcp/registry.js", () => ({
  getOrCreateMCPServerConnection: getOrCreateMCPServerConnectionMock,
  getOrCreateMCPSession: getOrCreateMCPSessionMock,
  closeMCPSession: closeMCPSessionMock,
  getMCPSession: vi.fn(),
}));

vi.mock("../mcp/client.js", () => ({
  callMCPTool: callMCPToolMock,
}));

const {
  isMCPTool,
  getMCPServerName,
  mcpToolRequiresConfirmation,
  resolveMCPTools,
  executeMCPTool,
} = await import("../mcp/executor.js");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Pure function tests ────────────────────────────────────────────────────────

describe("isMCPTool()", () => {
  it("returns true for mcp_ prefixed names", () => {
    expect(isMCPTool("mcp_github_list_issues")).toBe(true);
    expect(isMCPTool("mcp_slack_send_message")).toBe(true);
  });

  it("returns false for non-mcp_ names", () => {
    expect(isMCPTool("web_search")).toBe(false);
    expect(isMCPTool("my_custom_tool")).toBe(false);
    expect(isMCPTool("__mcp__slack__send")).toBe(false);
  });

  it("returns false for edge cases", () => {
    expect(isMCPTool("mcp")).toBe(false);
    expect(isMCPTool("")).toBe(false);
  });
});

describe("getMCPServerName()", () => {
  it("extracts server name from mcp_ prefixed tool", () => {
    expect(getMCPServerName("mcp_github_list_issues")).toBe("github");
    expect(getMCPServerName("mcp_slack_send_message")).toBe("slack");
    expect(getMCPServerName("mcp_google-drive_list_files")).toBe("google-drive");
  });

  it("returns null for non-mcp_ names", () => {
    expect(getMCPServerName("web_search")).toBe(null);
    expect(getMCPServerName("__mcp__slack__send")).toBe(null);
  });

  it("returns null for edge cases", () => {
    expect(getMCPServerName("mcp")).toBe(null);
    expect(getMCPServerName("")).toBe(null);
  });
});

describe("mcpToolRequiresConfirmation()", () => {
  const servers = [
    { name: "github", url: "https://mcp.github.com/sse" },
    { name: "slack", url: "https://mcp.slack.com/sse" },
  ];

  it("returns false when toolset is not found for server", () => {
    expect(mcpToolRequiresConfirmation("mcp_github_list_issues", servers, [])).toBe(false);
  });

  it("returns default_config permission_policy.type", () => {
    const toolset = {
      type: "mcp_toolset" as const,
      mcp_server_name: "github",
      default_config: { enabled: true, permission_policy: { type: "always_ask" } },
      configs: [],
    };
    expect(mcpToolRequiresConfirmation("mcp_github_list_issues", servers, [toolset])).toBe(true);

    const allowToolset = {
      ...toolset,
      default_config: { enabled: true, permission_policy: { type: "allow" } },
    };
    expect(mcpToolRequiresConfirmation("mcp_github_list_issues", servers, [allowToolset])).toBe(false);
  });

  it("per-tool override takes precedence over default", () => {
    const toolset = {
      type: "mcp_toolset" as const,
      mcp_server_name: "slack",
      default_config: { enabled: true, permission_policy: { type: "allow" } },
      configs: [
        { name: "send_message", enabled: true, permission_policy: { type: "always_ask" } },
      ],
    };
    // send_message overrides to always_ask
    expect(mcpToolRequiresConfirmation("mcp_slack_send_message", servers, [toolset])).toBe(true);
    // other tools fall back to allow
    expect(mcpToolRequiresConfirmation("mcp_slack_read_channel", servers, [toolset])).toBe(false);
  });

  it("returns false for non-MCP tool names", () => {
    const toolset = {
      type: "mcp_toolset" as const,
      mcp_server_name: "github",
      default_config: { enabled: true, permission_policy: { type: "always_ask" } },
      configs: [],
    };
    expect(mcpToolRequiresConfirmation("web_search", servers, [toolset])).toBe(false);
  });
});

// ── resolveMCPTools() tests ────────────────────────────────────────────────────

describe("resolveMCPTools()", () => {
  beforeEach(() => {
    getOrCreateMCPServerConnectionMock.mockReset();
  });

  it("resolves tools from a connected MCP server with mcp_ prefix", async () => {
    const mockConn = {
      name: "github",
      initialized: true,
      tools: [
        {
          name: "mcp_github_list_issues",
          description: "List issues",
          input_schema: { type: "object", properties: {} },
        },
        {
          name: "mcp_github_create_issue",
          description: "Create an issue",
          input_schema: { type: "object", properties: {} },
        },
      ],
    };
    getOrCreateMCPServerConnectionMock.mockResolvedValueOnce(mockConn);

    const tools = await resolveMCPTools({
      sessionId: "sess_1",
      mcpServers: [{ name: "github", url: "https://mcp.github.com/sse" }],
      mcpToolsets: [],
      vaultIds: [],
    });

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain("mcp_github_list_issues");
    expect(tools.map((t) => t.name)).toContain("mcp_github_create_issue");
  });

  it("skips disabled tools via default_config.enabled=false", async () => {
    const mockConn = {
      name: "slack",
      initialized: true,
      tools: [
        { name: "mcp_slack_send_message", description: "Send", input_schema: { type: "object", properties: {} } },
        { name: "mcp_slack_read_channel", description: "Read", input_schema: { type: "object", properties: {} } },
      ],
    };
    getOrCreateMCPServerConnectionMock.mockResolvedValueOnce(mockConn);

    const tools = await resolveMCPTools({
      sessionId: "sess_2",
      mcpServers: [{ name: "slack", url: "https://mcp.slack.com/sse" }],
      mcpToolsets: [{
        type: "mcp_toolset",
        mcp_server_name: "slack",
        default_config: { enabled: false, permission_policy: { type: "always_ask" } },
        configs: [],
      }],
      vaultIds: [],
    });

    expect(tools).toHaveLength(0);
  });

  it("skips per-tool override when enabled=false", async () => {
    const mockConn = {
      name: "github",
      initialized: true,
      tools: [
        { name: "mcp_github_list_issues", description: "List", input_schema: { type: "object", properties: {} } },
        { name: "mcp_github_create_issue", description: "Create", input_schema: { type: "object", properties: {} } },
      ],
    };
    getOrCreateMCPServerConnectionMock.mockResolvedValueOnce(mockConn);

    const tools = await resolveMCPTools({
      sessionId: "sess_3",
      mcpServers: [{ name: "github", url: "https://mcp.github.com/sse" }],
      mcpToolsets: [{
        type: "mcp_toolset",
        mcp_server_name: "github",
        default_config: { enabled: true, permission_policy: { type: "allow" } },
        configs: [
          { name: "create_issue", enabled: false, permission_policy: { type: "always_ask" } },
        ],
      }],
      vaultIds: [],
    });

    expect(tools.map((t) => t.name)).toContain("mcp_github_list_issues");
    expect(tools.map((t) => t.name)).not.toContain("mcp_github_create_issue");
  });

  it("adds error fallback tool when connection fails", async () => {
    getOrCreateMCPServerConnectionMock.mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    const tools = await resolveMCPTools({
      sessionId: "sess_4",
      mcpServers: [{ name: "broken", url: "https://broken.example.com/sse" }],
      mcpToolsets: [],
      vaultIds: [],
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("mcp_broken_error");
    expect(tools[0]!.description).toContain("Connection refused");
  });

  it("skips uninitialized connections", async () => {
    const mockConn = {
      name: "notready",
      initialized: false,
      tools: [],
    };
    getOrCreateMCPServerConnectionMock.mockResolvedValueOnce(mockConn);

    const tools = await resolveMCPTools({
      sessionId: "sess_5",
      mcpServers: [{ name: "notready", url: "https://notready.example.com/sse" }],
      mcpToolsets: [],
      vaultIds: [],
    });

    expect(tools).toHaveLength(0);
  });
});

// ── executeMCPTool() tests ─────────────────────────────────────────────────────

describe("executeMCPTool()", () => {
  beforeEach(() => {
    getOrCreateMCPSessionMock.mockReset();
    callMCPToolMock.mockReset();
  });

  it("calls callMCPTool with correct server connection", async () => {
    const mockConn = {
      name: "github",
      initialized: true,
      tools: [],
    };
    const mockSession = {
      sessionId: "sess_1",
      servers: new Map([["github", mockConn]]),
    };
    getOrCreateMCPSessionMock.mockReturnValueOnce(mockSession);
    callMCPToolMock.mockResolvedValueOnce({ content: "42 issues found", is_error: false });

    const result = await executeMCPTool("sess_1", "mcp_github_list_issues", { repo: "test" });

    expect(callMCPToolMock).toHaveBeenCalledWith(mockConn, "mcp_github_list_issues", { repo: "test" });
    expect(result.content).toBe("42 issues found");
    expect(result.is_error).toBe(false);
  });

  it("returns error for invalid tool name format", async () => {
    const result = await executeMCPTool("sess_1", "not_mcp_github_list_issues", {});

    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Invalid MCP tool name format");
    expect(callMCPToolMock).not.toHaveBeenCalled();
  });

  it("returns error when server is not connected for this session", async () => {
    const mockSession = {
      sessionId: "sess_1",
      servers: new Map(),
    };
    getOrCreateMCPSessionMock.mockReturnValueOnce(mockSession);

    const result = await executeMCPTool("sess_1", "mcp_slack_send_message", { text: "hi" });

    expect(result.is_error).toBe(true);
    expect(result.content).toContain("not connected");
    expect(callMCPToolMock).not.toHaveBeenCalled();
  });

  it("returns error when server is still initializing", async () => {
    const mockConn = {
      name: "slow",
      initialized: false,
      tools: [],
    };
    const mockSession = {
      sessionId: "sess_1",
      servers: new Map([["slow", mockConn]]),
    };
    getOrCreateMCPSessionMock.mockReturnValueOnce(mockSession);

    const result = await executeMCPTool("sess_1", "mcp_slow_list", {});

    expect(result.is_error).toBe(true);
    expect(result.content).toContain("still initializing");
    expect(callMCPToolMock).not.toHaveBeenCalled();
  });

  it("propagates is_error=true from callMCPTool", async () => {
    const mockConn = { name: "github", initialized: true, tools: [] };
    const mockSession = {
      sessionId: "sess_1",
      servers: new Map([["github", mockConn]]),
    };
    getOrCreateMCPSessionMock.mockReturnValueOnce(mockSession);
    callMCPToolMock.mockResolvedValueOnce({ content: "Rate limit exceeded", is_error: true });

    const result = await executeMCPTool("sess_1", "mcp_github_list_issues", {});

    expect(result.is_error).toBe(true);
    expect(result.content).toBe("Rate limit exceeded");
  });
});
