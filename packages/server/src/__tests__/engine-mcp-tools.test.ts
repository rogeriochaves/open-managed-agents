/**
 * Engine MCP tool-resolution test.
 *
 * This is the promise we were delivering on with the mcp_connections
 * table + lib/mcp-client wrapper: when an agent has an MCP server in
 * its config, the engine should connect to the server, list its real
 * tools, expose them to the LLM with a deterministic `__mcp__…` prefix,
 * and route the LLM's tool calls back through callMCPTool().
 *
 * We don't need a live MCP server to prove this — we stub the client
 * module at the vi.mock boundary and assert on the call shapes.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-engine-mcp-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const loadTokenStub = vi.fn();
const listToolsStub = vi.fn();
const callToolStub = vi.fn();

vi.mock("../lib/mcp-client.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/mcp-client.js")>(
    "../lib/mcp-client.js",
  );
  return {
    ...actual,
    loadConnectorToken: loadTokenStub,
    listMCPTools: listToolsStub,
    callMCPTool: callToolStub,
  };
});

const { createApp } = await import("../app.js");
const { resolveTools } = await import("../engine/index.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("engine resolveTools() — MCP integration", () => {
  it("returns built-in + custom tools unchanged for an agent with no mcp_servers", async () => {
    const { tools, mcpRoutes } = await resolveTools(
      {
        name: "simple",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [
          {
            type: "agent_toolset_20260401",
            default_config: {},
          },
          {
            type: "custom",
            name: "my_custom_tool",
            description: "does a thing",
            input_schema: { type: "object" },
          },
        ],
        mcp_servers: [],
        skills: [],
      },
      "org_default",
    );

    expect(tools.length).toBeGreaterThanOrEqual(2);
    expect(tools.map((t) => t.name)).toContain("my_custom_tool");
    // Built-in web_search/web_fetch from AGENT_TOOLS survive the pass
    expect(tools.map((t) => t.name)).toContain("web_search");
    expect(mcpRoutes.size).toBe(0);
    expect(loadTokenStub).not.toHaveBeenCalled();
    expect(listToolsStub).not.toHaveBeenCalled();
  });

  it("connects to an MCP server, prefixes remote tools, and populates the route map", async () => {
    loadTokenStub.mockResolvedValueOnce("decrypted-slack-token");
    listToolsStub.mockResolvedValueOnce([
      {
        name: "send_message",
        description: "Post a message",
        input_schema: { type: "object", properties: { text: { type: "string" } } },
      },
      {
        name: "read_channel",
        description: "Read recent messages",
        input_schema: { type: "object" },
      },
    ]);

    const { tools, mcpRoutes } = await resolveTools(
      {
        name: "support",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [],
        mcp_servers: [
          { name: "slack", url: "https://mcp.slack.com/sse", type: "url" },
        ],
        skills: [],
      },
      "org_default",
    );

    expect(loadTokenStub).toHaveBeenCalledWith("org_default", "slack");
    expect(listToolsStub).toHaveBeenCalledWith(
      "https://mcp.slack.com/sse",
      "decrypted-slack-token",
    );

    expect(tools.map((t) => t.name)).toEqual([
      "__mcp__slack__send_message",
      "__mcp__slack__read_channel",
    ]);
    expect(tools[0]!.description).toContain("[slack]");
    expect(mcpRoutes.size).toBe(2);
    const route = mcpRoutes.get("__mcp__slack__send_message")!;
    expect(route.connectorId).toBe("slack");
    expect(route.url).toBe("https://mcp.slack.com/sse");
    expect(route.token).toBe("decrypted-slack-token");
    expect(route.originalName).toBe("send_message");
  });

  it("skips a broken MCP connector rather than failing the whole turn", async () => {
    const { MCPClientError } = await import("../lib/mcp-client.js");

    loadTokenStub
      .mockResolvedValueOnce("good-notion-token")
      .mockResolvedValueOnce("bad-slack-token");
    listToolsStub
      .mockResolvedValueOnce([
        {
          name: "search",
          description: "Search Notion",
          input_schema: { type: "object" },
        },
      ])
      .mockRejectedValueOnce(
        new MCPClientError(
          "MCP server https://mcp.slack.com/sse rejected the stored credential (401)",
          401,
          "mcp_unauthorized",
        ),
      );

    const { tools, mcpRoutes } = await resolveTools(
      {
        name: "hybrid",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [],
        mcp_servers: [
          { name: "notion", url: "https://mcp.notion.com/sse", type: "url" },
          { name: "slack", url: "https://mcp.slack.com/sse", type: "url" },
        ],
        skills: [],
      },
      "org_default",
    );

    // Notion succeeded — its one tool is in the list + routes
    expect(tools.map((t) => t.name)).toContain("__mcp__notion__search");
    expect(mcpRoutes.has("__mcp__notion__search")).toBe(true);

    // Slack failed — no __mcp__slack__ entries, but the loop didn't throw
    expect(
      tools.some((t) => t.name.startsWith("__mcp__slack__")),
    ).toBe(false);
    expect(
      Array.from(mcpRoutes.keys()).some((k) => k.startsWith("__mcp__slack__")),
    ).toBe(false);
  });
});
