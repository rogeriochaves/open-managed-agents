/**
 * Real round-trip MCP client test.
 *
 * All prior MCP tests (mcp-connections, mcp-discovery-tools, engine-mcp-tools)
 * stub listMCPTools / callMCPTool at the vi.mock boundary. That's fine for
 * fault-path coverage, but we were never proving that lib/mcp-client actually
 * speaks the MCP protocol correctly against a live server.
 *
 * This test closes that gap. It spawns a tiny in-process
 * StreamableHTTPServerTransport wrapped in a node http server, registers two
 * real tools (echo + add) via the MCP SDK's McpServer, and then drives
 * listMCPTools / callMCPTool from lib/mcp-client.ts against it. If the
 * contracts on either side break, this test breaks. No network required —
 * the HTTP server binds to a random loopback port.
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-mcp-int-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { listMCPTools, callMCPTool } = await import("../lib/mcp-client.js");

let httpServer: HttpServer;
let fixtureUrl: string;
let observedAuthHeaders: string[] = [];

/**
 * Build a tiny stateless MCP server exposing two tools:
 *   - echo: returns whatever text the caller sent
 *   - add:  returns a+b
 * Each request creates a fresh McpServer + transport so the test doesn't
 * need to manage session state.
 */
function buildMcpHandler() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // Record what Authorization header the client sent so we can assert
    // the Bearer token made it through the full transport.
    const auth = req.headers["authorization"];
    if (typeof auth === "string") observedAuthHeaders.push(auth);

    // Collect the full body — handleRequest wants the parsed body for POSTs
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
      { name: "oma-mcp-fixture", version: "0.0.1" },
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

    // Stateless mode: each request is its own session.
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
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("lib/mcp-client — real round trip against an in-process MCP server", () => {
  it("listMCPTools returns the server's tool catalog in our internal shape", async () => {
    observedAuthHeaders = [];

    const tools = await listMCPTools(fixtureUrl, "fake-bearer-token");

    expect(tools.length).toBe(2);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(byName.echo).toBeDefined();
    expect(byName.echo!.description).toBe("Echo back the text the caller sent");
    expect(byName.echo!.input_schema).toMatchObject({ type: "object" });

    expect(byName.add).toBeDefined();
    expect(byName.add!.description).toBe("Add two numbers and return the sum");

    // Bearer token made it all the way through the transport. We can't
    // compare strictly because the SDK may retry during handshake, so
    // we just assert *something* authenticated did land.
    expect(observedAuthHeaders.some((h) => h.includes("Bearer fake-bearer-token"))).toBe(true);
  });

  it("callMCPTool executes echo and returns the text back", async () => {
    const result = await callMCPTool(fixtureUrl, null, "echo", {
      text: "hello, world",
    });

    expect(result.is_error).not.toBe(true);
    const joined = (result.content ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("");
    expect(joined).toBe("echo: hello, world");
  });

  it("callMCPTool executes add and returns the numeric result", async () => {
    const result = await callMCPTool(fixtureUrl, null, "add", { a: 17, b: 23 });

    expect(result.is_error).not.toBe(true);
    const joined = (result.content ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("");
    expect(joined).toBe("17 + 23 = 40");
  });

  it("callMCPTool on an unknown tool returns is_error:true with the server's error message", async () => {
    // The MCP SDK returns `{content: [...], isError: true}` rather than
    // throwing for "tool not found" — that's the protocol contract.
    // Our engine converts this into a tool_result with is_error=true
    // which is exactly what we want: the LLM sees the error and can
    // recover rather than the whole turn crashing.
    const result = await callMCPTool(fixtureUrl, null, "does-not-exist", {});
    expect(result.is_error).toBe(true);
    const text = (result.content ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("");
    expect(text).toMatch(/does-not-exist/);
  });
});
