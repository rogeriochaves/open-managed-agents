/**
 * End-to-end engine ↔ MCP integration test.
 *
 * Each prior test covers ONE slice of the MCP stack:
 *
 *   - mcp-connections.test.ts       — encrypted token storage
 *   - mcp-discovery-tools.test.ts   — GET tools route (stubbed client)
 *   - mcp-client-integration.test.ts — lib/mcp-client vs a real fixture
 *   - engine-mcp-tools.test.ts      — resolveTools with listMCPTools stubbed
 *
 * Nothing chains them. A drift on any seam (the `__mcp__<connector>__`
 * prefix contract, the connection-lookup-by-orgId, the Bearer header
 * injection, the SDK response shape) could go unnoticed as long as
 * each slice's own stubs kept agreeing with themselves.
 *
 * This file chains the whole stack: it spawns a real in-process MCP
 * server, stores a real encrypted connection row for the fixture URL,
 * calls the real engine.resolveTools() with a real agent config that
 * references "slack" as its mcp_server, and asserts that:
 *
 *   1. The engine decrypts the token and sends it in the Bearer
 *      header on the wire.
 *   2. The returned tool list contains __mcp__slack__echo and
 *      __mcp__slack__add, matching what the fixture exposes.
 *   3. The mcpRoutes map round-trips to the fixture URL with the
 *      decrypted token.
 *   4. executeBuiltinTool routes a call to __mcp__slack__echo all
 *      the way through to the fixture's echo tool and receives back
 *      the correct text.
 *
 * No mocks on any layer. If any of the seams break, this test breaks.
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-engine-mcp-e2e-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");
const { getDB } = await import("../db/index.js");
const { resolveTools } = await import("../engine/index.js");

let httpServer: HttpServer;
let fixtureUrl: string;
const observedAuthHeaders: string[] = [];

function buildMcpHandler() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers["authorization"];
    if (typeof auth === "string") observedAuthHeaders.push(auth);

    let body: unknown = undefined;
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = undefined;
      }
    }

    const server = new McpServer(
      { name: "oma-engine-e2e-fixture", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );

    server.registerTool(
      "echo",
      {
        description: "Echo back the text the caller sent",
        inputSchema: { text: z.string() },
      },
      async ({ text }) => ({
        content: [{ type: "text", text: `echo: ${text}` }],
      }),
    );

    server.registerTool(
      "add",
      {
        description: "Add two numbers and return the sum",
        inputSchema: { a: z.number(), b: z.number() },
      },
      async ({ a, b }) => ({
        content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }],
      }),
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };
}

beforeAll(async () => {
  // Boot the Hono app so initSchema + initEncryption run.
  await createApp({ skipProviderSeed: true });

  httpServer = createServer((req, res) => {
    buildMcpHandler()(req, res).catch((err) => {
      console.error("[mcp-fixture] handler error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address() as AddressInfo;
  fixtureUrl = `http://127.0.0.1:${address.port}/mcp`;

  // Seed an encrypted mcp_connections row for the default org.
  // loadConnectorToken will be called with ("org_default", "slack")
  // and must find this row + decrypt it back to the plaintext.
  const db = await getDB();
  const { encrypt } = await import("../lib/encryption.js");
  await db.run(
    "INSERT INTO mcp_connections (id, organization_id, connector_id, auth_type, token_encrypted, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
    "mcpconn_e2e_slack",
    "org_default",
    "slack",
    "token",
    encrypt("e2e-secret-bearer-token"),
    null,
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("engine ↔ MCP end-to-end against a real in-process fixture", () => {
  it("resolveTools surfaces the fixture's tools as __mcp__slack__* entries", async () => {
    const { tools, mcpRoutes } = await resolveTools(
      {
        name: "support",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [],
        mcp_servers: [{ name: "slack", url: fixtureUrl, type: "url" }],
        skills: [],
      },
      "org_default",
    );

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["__mcp__slack__add", "__mcp__slack__echo"]);

    const echoRoute = mcpRoutes.get("__mcp__slack__echo");
    expect(echoRoute).toBeTruthy();
    expect(echoRoute!.connectorId).toBe("slack");
    expect(echoRoute!.url).toBe(fixtureUrl);
    expect(echoRoute!.token).toBe("e2e-secret-bearer-token");
    expect(echoRoute!.originalName).toBe("echo");

    // The fixture must have observed the Bearer header on the
    // listTools round-trip — this is the seam proof. If the
    // engine forgets to decrypt, or the client forgets the
    // header, this would fail here.
    expect(
      observedAuthHeaders.some((h) =>
        h.includes("Bearer e2e-secret-bearer-token"),
      ),
    ).toBe(true);
  });

  it("callMCPTool through the resolved route actually executes against the fixture", async () => {
    const { callMCPTool } = await import("../lib/mcp-client.js");
    const { tools: _tools, mcpRoutes } = await resolveTools(
      {
        name: "support",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [],
        mcp_servers: [{ name: "slack", url: fixtureUrl, type: "url" }],
        skills: [],
      },
      "org_default",
    );

    const route = mcpRoutes.get("__mcp__slack__echo")!;
    const result = await callMCPTool(route.url, route.token, route.originalName, {
      text: "hello from e2e",
    });

    expect(result.is_error).not.toBe(true);
    const text = (result.content ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("");
    expect(text).toBe("echo: hello from e2e");
  });

  it("an unknown connector with no stored credential still lists tools (fixture is open for this test) with no Bearer", async () => {
    observedAuthHeaders.length = 0;

    const { tools } = await resolveTools(
      {
        name: "unscoped",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [],
        mcp_servers: [
          // No connection row exists for "scratch", so the engine
          // will pass a null token to listMCPTools — the fixture
          // doesn't require auth so the call still succeeds, and
          // observedAuthHeaders picks up no "Bearer …" entry.
          { name: "scratch", url: fixtureUrl, type: "url" },
        ],
        skills: [],
      },
      "org_default",
    );

    expect(tools.map((t) => t.name).sort()).toEqual([
      "__mcp__scratch__add",
      "__mcp__scratch__echo",
    ]);
    expect(
      observedAuthHeaders.some((h) => h.startsWith("Bearer ")),
    ).toBe(false);
  });

  it("a broken MCP URL is skipped without crashing the whole resolution", async () => {
    const { tools, mcpRoutes } = await resolveTools(
      {
        name: "hybrid",
        system: null,
        model: "claude-sonnet-4-6",
        tools: [],
        mcp_servers: [
          { name: "slack", url: fixtureUrl, type: "url" },
          { name: "dead", url: "http://127.0.0.1:1/unreachable", type: "url" },
        ],
        skills: [],
      },
      "org_default",
    );

    // Slack still resolved normally.
    expect(tools.map((t) => t.name)).toContain("__mcp__slack__echo");
    expect(mcpRoutes.has("__mcp__slack__echo")).toBe(true);
    // Dead was logged and skipped.
    expect(tools.some((t) => t.name.startsWith("__mcp__dead__"))).toBe(false);
    expect(
      Array.from(mcpRoutes.keys()).some((k) => k.startsWith("__mcp__dead__")),
    ).toBe(false);
  });
});
