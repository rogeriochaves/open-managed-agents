/**
 * Web API client contract test.
 *
 * Every other web test mocks `api.*` directly, so a broken
 * HTTP method or path in packages/web/src/lib/api.ts was
 * invisible to the entire suite — exactly the class of bug
 * that fix 892989c caught (updateAgent using PUT when the
 * server wanted POST, archiveAgent using DELETE when the
 * server wanted POST /archive, both silently 404-ing for
 * weeks before anyone actually clicked the buttons against
 * a live server).
 *
 * This file stubs global.fetch and then calls each mutation
 * helper directly, asserting the request URL, method, and
 * relevant body shape. It makes no assumptions about what
 * component ships the call — it's a pure contract test on
 * the client ↔ server wire.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as api from "../lib/api";

type FetchCall = [url: string, init?: RequestInit];

function stubFetch(
  response: unknown = {},
  status = 200,
): ReturnType<typeof vi.fn> {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as unknown as Response;
  });
  // vitest's globalThis patch
  (globalThis as any).fetch = f;
  return f;
}

function restoreFetch(original: typeof fetch | undefined) {
  if (original) (globalThis as any).fetch = original;
  else delete (globalThis as any).fetch;
}

describe("web API client ↔ server HTTP contract", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
  });

  afterEach(() => {
    restoreFetch(originalFetch);
  });

  // ── Agents ────────────────────────────────────────────────

  it("updateAgent POSTs to /v1/agents/:id (not PUT)", async () => {
    const f = stubFetch({ id: "agent_1", version: 2 });
    await api.updateAgent("agent_1", {
      version: 1,
      name: "renamed",
    } as any);

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/agents/agent_1");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.version).toBe(1);
    expect(body.name).toBe("renamed");
  });

  it("archiveAgent POSTs to /v1/agents/:id/archive (not DELETE)", async () => {
    const f = stubFetch({ id: "agent_1", archived_at: "now" });
    await api.archiveAgent("agent_1");

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/agents/agent_1/archive");
    expect(init?.method).toBe("POST");
  });

  // ── Environments ──────────────────────────────────────────

  it("archiveEnvironment POSTs to /v1/environments/:id/archive (soft, not DELETE)", async () => {
    const f = stubFetch({ id: "env_1", archived_at: "now" });
    await api.archiveEnvironment("env_1");

    const [url, init] = f.mock.calls[0] as FetchCall;
    // Critical: must NOT be DELETE /v1/environments/:id — that's
    // the hard-delete path and clicking Archive in the UI would
    // destroy the row instead of soft-archiving it.
    expect(url).toBe("/v1/environments/env_1/archive");
    expect(init?.method).toBe("POST");
  });

  // ── Vaults ────────────────────────────────────────────────

  it("archiveVault POSTs to /v1/vaults/:id/archive (soft, not DELETE)", async () => {
    const f = stubFetch({ id: "vlt_1", archived_at: "now" });
    await api.archiveVault("vlt_1");

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/vaults/vlt_1/archive");
    expect(init?.method).toBe("POST");
  });

  // ── Sessions ──────────────────────────────────────────────

  it("stopSession POSTs to /v1/sessions/:id/stop", async () => {
    const f = stubFetch({ id: "sesn_1", status: "terminated" });
    await api.stopSession("sesn_1");

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/sessions/sesn_1/stop");
    expect(init?.method).toBe("POST");
  });

  // ── Vault credentials ─────────────────────────────────────

  it("createVaultCredential POSTs to /v1/vaults/:id/credentials", async () => {
    const f = stubFetch({ id: "cred_1", name: "SLACK_BOT_TOKEN" });
    await api.createVaultCredential("vlt_1", {
      name: "SLACK_BOT_TOKEN",
      value: "xoxb-fake",
    });

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/vaults/vlt_1/credentials");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.name).toBe("SLACK_BOT_TOKEN");
    expect(body.value).toBe("xoxb-fake");
  });

  it("deleteVaultCredential DELETEs /v1/vaults/:id/credentials/:credId", async () => {
    const f = stubFetch({ deleted: true });
    await api.deleteVaultCredential("vlt_1", "cred_1");

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/vaults/vlt_1/credentials/cred_1");
    expect(init?.method).toBe("DELETE");
  });

  // ── MCP connectors ────────────────────────────────────────

  it("connectMCPConnector POSTs to /v1/mcp/connectors/:id/connect with {token}", async () => {
    const f = stubFetch({ id: "mcpconn_1", connector_id: "slack" });
    await api.connectMCPConnector("slack", "xoxb-fake");

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/mcp/connectors/slack/connect");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.token).toBe("xoxb-fake");
  });

  it("disconnectMCPConnector DELETEs /v1/mcp/connectors/:id/connect", async () => {
    const f = stubFetch({ deleted: true });
    await api.disconnectMCPConnector("slack");

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/mcp/connectors/slack/connect");
    expect(init?.method).toBe("DELETE");
  });

  // ── Agent builder chat ────────────────────────────────────

  it("agentBuilderChat POSTs to /v1/agent-builder/chat", async () => {
    const f = stubFetch({
      reply: "ok",
      draft: {},
      done: false,
      provider: { id: "provider_anthropic", name: "Anthropic" },
    });
    await api.agentBuilderChat({
      messages: [{ role: "user", content: "hi" }],
    });

    const [url, init] = f.mock.calls[0] as FetchCall;
    expect(url).toBe("/v1/agent-builder/chat");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.messages).toHaveLength(1);
  });
});
