/**
 * Real round-trip integration test for the mcp/client.ts SSE MCP client.
 *
 * All prior MCP integration tests use lib/mcp-client.ts (StreamableHTTP).
 * This test proves that mcp/client.ts correctly speaks the SSE+MCP protocol:
 *   - GET  /sse  → SSE stream of JSON-RPC responses
 *   - POST /     → JSON-RPC requests (tools/list, tools/call)
 *
 * The test spins up an in-process HTTP server that implements a minimal
 * SSE+MCP server (tools/list + tools/call), then drives
 * createMCPServerConnection / discoverMCPTools / callMCPTool from mcp/client.ts
 * against it. No network required — the server binds to a random loopback port.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { EventEmitter } from "node:events";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-mcp-sse-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "***";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createMCPServerConnection, discoverMCPTools, callMCPTool } = await import(
  "../mcp/client.js"
);

let httpServer: ReturnType<typeof createServer>;
let fixtureUrl: string;

// ── Tiny SSE+MCP fixture server ────────────────────────────────────────────────

/**
 * A minimal SSE+MCP server that:
 *   GET  /sse         → opens an SSE stream, sends JSON-RPC responses as SSE events
 *   POST /             → receives JSON-RPC requests, executes tools, sends responses via SSE
 *
 * The SSE client (our MCP client) opens ONE SSE stream and the server sends
 * all JSON-RPC responses back over that stream. The POST handler looks up
 * the pending request by ID and sends the response as an SSE event to the
 * correct client (identified by a ?clientId= query param on the SSE endpoint).
 *
 * For simplicity in this single-client test, we use a single global emitter
 * to route POST responses back to the SSE writer.
 */
const sseClients = new Map<string, (data: string) => void>();

/**
 * Send an SSE-formatted event to a specific client.
 */
function sendSSEMessage(clientId: string, event: object): void {
  const writer = sseClients.get(clientId);
  if (writer) {
    writer(`data: ${JSON.stringify(event)}\n\n`);
  }
}

/**
 * Register a new SSE client. Returns the clientId.
 */
function registerSSEClient(writeFn: (data: string) => void): string {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sseClients.set(clientId, writeFn);
  return clientId;
}

function buildMcpHandler() {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/sse" || url.pathname.endsWith("/sse"))) {
      // ── SSE endpoint ───────────────────────────────────────────────────────
      const clientId = registerSSEClient((data) => {
        res.write(data);
      });

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`data: ${JSON.stringify({ jsonrpc: "2.0", method: "initialized", id: undefined })}\n\n`);

      req.on("close", () => {
        sseClients.delete(clientId);
      });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/" || url.pathname.endsWith("/messages"))) {
      // ── JSON-RPC endpoint ─────────────────────────────────────────────────
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString("utf-8");
      let request: { jsonrpc: string; id: string | number; method: string; params?: Record<string, unknown> };
      try {
        request = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }

      const { method, params, id } = request;

      if (method === "tools/list") {
        // Return our two fixture tools
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "echo",
                description: "Echo back the text the caller sent",
                input_schema: { type: "object", properties: { text: { type: "string" } } },
              },
              {
                name: "add",
                description: "Add two numbers and return the sum",
                input_schema: {
                  type: "object",
                  properties: { a: { type: "number" }, b: { type: "number" } },
                },
              },
              {
                name: "uppercase",
                description: "Return the uppercase version of text",
                input_schema: { type: "object", properties: { text: { type: "string" } } },
              },
            ],
          },
        };
        // Send response over SSE — we broadcast to all clients for simplicity
        // since this is a single-client test
        for (const [, writer] of sseClients) {
          writer(`data: ${JSON.stringify(response)}\n\n`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (method === "tools/call") {
        const toolName = (params as { name: string; arguments?: Record<string, unknown> })?.name;
        const args = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};

        let result: object;
        if (toolName === "echo") {
          const text = String(args.text ?? "");
          result = { content: [{ type: "text", text: `echo: ${text}` }] };
        } else if (toolName === "add") {
          const a = Number(args.a ?? 0);
          const b = Number(args.b ?? 0);
          result = { content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }] };
        } else if (toolName === "uppercase") {
          const text = String(args.text ?? "");
          result = { content: [{ type: "text", text: text.toUpperCase() }] };
        } else {
          result = { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
        }

        const response = { jsonrpc: "2.0", id, result };
        for (const [, writer] of sseClients) {
          writer(`data: ${JSON.stringify(response)}\n\n`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Unknown method
      const response = {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
      for (const [, writer] of sseClients) {
        writer(`data: ${JSON.stringify(response)}\n\n`);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404);
    res.end();
  };
}

beforeAll(async () => {
  httpServer = createServer((req, res) => {
    buildMcpHandler()(req, res).catch((err) => {
      console.error("[mcp-sse-fixture] handler error:", err);
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
  fixtureUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  // Close all HTTP connections first, then close the server.
  // Without this, SSE clients (which keep the connection alive) cause
  // server.close() to hang indefinitely.
  httpServer.closeAllConnections?.();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  sseClients.clear();
});

// ── Round-trip tests ──────────────────────────────────────────────────────────

describe("mcp/client.ts SSE — real round trip against in-process SSE+MCP server", () => {
  it("createMCPServerConnection + discoverMCPTools returns prefixed tool catalog", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });

    // Connection should be open (SSE stream established)
    expect(conn.name).toBe("fixture");
    expect(conn.url).toBe(fixtureUrl);
    expect(conn.abortController).toBeDefined();

    // Discover tools
    const tools = await discoverMCPTools(conn);

    expect(tools).toHaveLength(3);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    // All tools are prefixed with mcp_fixture_
    expect(byName["mcp_fixture_echo"]).toBeDefined();
    expect(byName["mcp_fixture_echo"]!.description).toBe("Echo back the text the caller sent");
    expect(byName["mcp_fixture_echo"]!.input_schema).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
    });

    expect(byName["mcp_fixture_add"]).toBeDefined();
    expect(byName["mcp_fixture_add"]!.description).toBe("Add two numbers and return the sum");

    expect(byName["mcp_fixture_uppercase"]).toBeDefined();
  }, 10_000);

  it("callMCPTool executes echo and returns text result via SSE", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });
    await discoverMCPTools(conn);

    const result = await callMCPTool(conn, "mcp_fixture_echo", { text: "hello from SSE" });

    expect(result.is_error).toBe(false);
    expect(result.content).toBe("echo: hello from SSE");
  }, 10_000);

  it("callMCPTool executes add and returns numeric result via SSE", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });
    await discoverMCPTools(conn);

    const result = await callMCPTool(conn, "mcp_fixture_add", { a: 7, b: 13 });

    expect(result.is_error).toBe(false);
    expect(result.content).toBe("7 + 13 = 20");
  }, 10_000);

  it("callMCPTool executes uppercase via SSE", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });
    await discoverMCPTools(conn);

    const result = await callMCPTool(conn, "mcp_fixture_uppercase", { text: "test" });

    expect(result.is_error).toBe(false);
    expect(result.content).toBe("TEST");
  }, 10_000);

  it("callMCPTool returns is_error=true for unknown tool via SSE", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });
    await discoverMCPTools(conn);

    const result = await callMCPTool(conn, "mcp_fixture_does_not_exist", {});

    expect(result.is_error).toBe(true);
    expect(result.content).toContain("does_not_exist");
  }, 10_000);

  it("multiple tools can be called sequentially on the same SSE connection", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });
    await discoverMCPTools(conn);

    const r1 = await callMCPTool(conn, "mcp_fixture_echo", { text: "one" });
    const r2 = await callMCPTool(conn, "mcp_fixture_add", { a: 1, b: 2 });
    const r3 = await callMCPTool(conn, "mcp_fixture_uppercase", { text: "three" });

    expect(r1.content).toBe("echo: one");
    expect(r2.content).toBe("1 + 2 = 3");
    expect(r3.content).toBe("THREE");
  }, 10_000);

  it("tool name format validation rejects non-mcp_ prefix", async () => {
    const conn = await createMCPServerConnection({ name: "fixture", url: fixtureUrl });
    await discoverMCPTools(conn);

    const result = await callMCPTool(conn, "not_mcp_echo", { text: "bad" });

    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Invalid MCP tool name format");
  }, 10_000);
});
