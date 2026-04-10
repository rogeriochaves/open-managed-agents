/**
 * MCP tool-discovery endpoint test.
 *
 * Drives GET /v1/mcp/connectors/:id/tools against a stubbed MCP client
 * so we don't need a live remote MCP server. Verifies:
 *
 *  - happy path returns the server's tool list in our internal shape
 *  - 401 when the MCP server rejects the stored credential
 *  - 502 when the MCP server is unreachable
 *  - 404 for an unknown connector id
 *  - auth gating is unchanged (AUTH_ENABLED=false in this test file)
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-mcp-tools-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

// Stub the MCP client BEFORE importing createApp — the route depends
// on this module and we replace listMCPTools with a vi.fn() whose
// behavior each test controls.
const listToolsStub = vi.fn();

vi.mock("../lib/mcp-client.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/mcp-client.js")>(
    "../lib/mcp-client.js",
  );
  return {
    ...actual,
    listMCPTools: listToolsStub,
  };
});

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /v1/mcp/connectors/:id/tools", () => {
  it("returns 404 for an unknown connector", async () => {
    const res = await app.request("/v1/mcp/connectors/does-not-exist/tools");
    expect(res.status).toBe(404);
  });

  it("returns the tool catalog from the stubbed MCP client on the happy path", async () => {
    listToolsStub.mockResolvedValueOnce([
      {
        name: "send_message",
        description: "Post a message to a Slack channel",
        input_schema: {
          type: "object",
          properties: { channel: { type: "string" }, text: { type: "string" } },
          required: ["channel", "text"],
        },
      },
      {
        name: "read_channel",
        description: "Read recent messages from a channel",
        input_schema: { type: "object", properties: {} },
      },
    ]);

    const res = await app.request("/v1/mcp/connectors/slack/tools");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ name: string; description?: string }>;
    };
    expect(body.data).toHaveLength(2);
    expect(body.data[0]!.name).toBe("send_message");
    expect(body.data[0]!.description).toBe(
      "Post a message to a Slack channel",
    );
    expect(body.data[1]!.name).toBe("read_channel");
  });

  it("returns 401 when the MCP server rejects the stored credential", async () => {
    const { MCPClientError } = await import("../lib/mcp-client.js");
    listToolsStub.mockRejectedValueOnce(
      new MCPClientError(
        "MCP server https://mcp.slack.com/sse rejected the stored credential (401)",
        401,
        "mcp_unauthorized",
      ),
    );

    const res = await app.request("/v1/mcp/connectors/slack/tools");
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error: { type: string; message: string };
    };
    expect(body.error.type).toBe("mcp_unauthorized");
  });

  it("returns 502 when the MCP server is unreachable", async () => {
    const { MCPClientError } = await import("../lib/mcp-client.js");
    listToolsStub.mockRejectedValueOnce(
      new MCPClientError("Failed to talk to MCP server: connection refused"),
    );

    const res = await app.request("/v1/mcp/connectors/notion/tools");
    expect(res.status).toBe(502);
    const body = (await res.json()) as {
      error: { type: string; message: string };
    };
    expect(body.error.type).toBe("mcp_error");
  });
});
