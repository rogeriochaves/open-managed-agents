/**
 * CLI wire contract test.
 *
 * Every `oma *` command delegates to the Anthropic SDK
 * (client.beta.agents|sessions|environments|vaults|...). The SDK
 * owns URL construction and picks the HTTP method — we don't.
 * That means an SDK upgrade or a typo in one of our command files
 * can silently route a call at the wrong route on our server and
 * the CLI would 404 without any unit-test catching it.
 *
 * This is the same class of bug we caught for the WEB client in
 * 892989c (archiveAgent was using DELETE instead of POST /archive).
 * The CLI had the same risk because:
 *
 *   - There's no integration test booting the server and running
 *     each command (only the broad `cli-smoke-test.sh`, which covers
 *     list/create happy paths, not archive / update / delete).
 *   - The SDK appends `?beta=true` to every URL, which must not
 *     collide with the server's OpenAPI Hono route matcher.
 *
 * This test stubs `global.fetch`, calls each SDK method exactly as
 * the CLI command files do, and asserts the outgoing URL path and
 * HTTP method. It does NOT assert on `?beta=true` because our
 * server ignores unknown query params — we only care about the
 * pathname and the method.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

interface CapturedCall {
  pathname: string;
  method: string;
  body?: unknown;
}

let captured: CapturedCall[] = [];

function stubFetch() {
  captured = [];
  const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === "string" ? new URL(url) : url;
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    captured.push({
      pathname: u.pathname,
      method: (init?.method ?? "GET").toUpperCase(),
      body,
    });
    // Return a minimal but realistic response for every SDK method we call.
    return new Response(
      JSON.stringify({
        id: "stub",
        type: "stub",
        data: [],
        // Filled in shapes the SDK will try to parse:
        agent: { id: "agent_stub" },
        usage: {},
        stats: {},
        config: { networking: { type: "unrestricted" } },
        created_at: "2026-04-10T00:00:00Z",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
  (globalThis as any).fetch = f;
  return f;
}

function client(): Anthropic {
  return new Anthropic({
    apiKey: "oma-test",
    baseURL: "http://oma.test",
  });
}

describe("CLI ↔ server wire contract (via Anthropic SDK)", () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    stubFetch();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  // ── Agents ────────────────────────────────────────────────────────

  it("agents.create → POST /v1/agents", async () => {
    await client().beta.agents.create({
      name: "smoke",
      model: "claude-sonnet-4-6",
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/agents");
    expect(captured[0]!.method).toBe("POST");
  });

  it("agents.list → GET /v1/agents", async () => {
    await client().beta.agents.list({ limit: 5 } as any);
    expect(captured[0]!.pathname).toBe("/v1/agents");
    expect(captured[0]!.method).toBe("GET");
  });

  it("agents.retrieve → GET /v1/agents/:id", async () => {
    await client().beta.agents.retrieve("agent_xyz");
    expect(captured[0]!.pathname).toBe("/v1/agents/agent_xyz");
    expect(captured[0]!.method).toBe("GET");
  });

  it("agents.update → POST /v1/agents/:id (NOT put)", async () => {
    await client().beta.agents.update("agent_xyz", {
      version: 1,
      name: "renamed",
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/agents/agent_xyz");
    expect(captured[0]!.method).toBe("POST");
    expect((captured[0]!.body as any).version).toBe(1);
    expect((captured[0]!.body as any).name).toBe("renamed");
  });

  it("agents.archive → POST /v1/agents/:id/archive (NOT delete)", async () => {
    await client().beta.agents.archive("agent_xyz");
    expect(captured[0]!.pathname).toBe("/v1/agents/agent_xyz/archive");
    expect(captured[0]!.method).toBe("POST");
  });

  // ── Sessions ──────────────────────────────────────────────────────

  it("sessions.create → POST /v1/sessions", async () => {
    await client().beta.sessions.create({
      agent: "agent_xyz",
      environment_id: "env_default",
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/sessions");
    expect(captured[0]!.method).toBe("POST");
  });

  it("sessions.list → GET /v1/sessions", async () => {
    await client().beta.sessions.list({ limit: 5 } as any);
    expect(captured[0]!.pathname).toBe("/v1/sessions");
    expect(captured[0]!.method).toBe("GET");
  });

  it("sessions.archive → POST /v1/sessions/:id/archive (NOT delete)", async () => {
    await client().beta.sessions.archive("sesn_xyz");
    expect(captured[0]!.pathname).toBe("/v1/sessions/sesn_xyz/archive");
    expect(captured[0]!.method).toBe("POST");
  });

  it("sessions.delete → DELETE /v1/sessions/:id (hard delete)", async () => {
    await client().beta.sessions.delete("sesn_xyz");
    expect(captured[0]!.pathname).toBe("/v1/sessions/sesn_xyz");
    expect(captured[0]!.method).toBe("DELETE");
  });

  it("sessions.events.send → POST /v1/sessions/:id/events", async () => {
    await client().beta.sessions.events.send("sesn_xyz", {
      events: [
        { type: "user.message", content: [{ type: "text", text: "hi" }] },
      ],
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/sessions/sesn_xyz/events");
    expect(captured[0]!.method).toBe("POST");
  });

  it("sessions.events.list → GET /v1/sessions/:id/events", async () => {
    await client().beta.sessions.events.list("sesn_xyz", {
      limit: 5,
      order: "asc",
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/sessions/sesn_xyz/events");
    expect(captured[0]!.method).toBe("GET");
  });

  // ── Environments ──────────────────────────────────────────────────

  it("environments.create → POST /v1/environments", async () => {
    await client().beta.environments.create({
      name: "cloud-standard",
      config: {
        type: "cloud",
        networking: { type: "unrestricted" },
      },
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/environments");
    expect(captured[0]!.method).toBe("POST");
  });

  it("environments.list → GET /v1/environments", async () => {
    await client().beta.environments.list({} as any);
    expect(captured[0]!.pathname).toBe("/v1/environments");
    expect(captured[0]!.method).toBe("GET");
  });

  it("environments.archive → POST /v1/environments/:id/archive (NOT delete)", async () => {
    await client().beta.environments.archive("env_xyz");
    expect(captured[0]!.pathname).toBe("/v1/environments/env_xyz/archive");
    expect(captured[0]!.method).toBe("POST");
  });

  it("environments.delete → DELETE /v1/environments/:id (hard delete)", async () => {
    await client().beta.environments.delete("env_xyz");
    expect(captured[0]!.pathname).toBe("/v1/environments/env_xyz");
    expect(captured[0]!.method).toBe("DELETE");
  });

  // ── Vaults ────────────────────────────────────────────────────────

  it("vaults.create → POST /v1/vaults", async () => {
    await client().beta.vaults.create({
      display_name: "Production Secrets",
    } as any);
    expect(captured[0]!.pathname).toBe("/v1/vaults");
    expect(captured[0]!.method).toBe("POST");
  });

  it("vaults.list → GET /v1/vaults", async () => {
    await client().beta.vaults.list({} as any);
    expect(captured[0]!.pathname).toBe("/v1/vaults");
    expect(captured[0]!.method).toBe("GET");
  });

  it("vaults.archive → POST /v1/vaults/:id/archive (soft archive, NOT delete)", async () => {
    await client().beta.vaults.archive("vlt_xyz");
    expect(captured[0]!.pathname).toBe("/v1/vaults/vlt_xyz/archive");
    expect(captured[0]!.method).toBe("POST");
  });

  it("vaults.delete → DELETE /v1/vaults/:id (hard delete)", async () => {
    await client().beta.vaults.delete("vlt_xyz");
    expect(captured[0]!.pathname).toBe("/v1/vaults/vlt_xyz");
    expect(captured[0]!.method).toBe("DELETE");
  });
});
