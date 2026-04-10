/**
 * Sessions + events integration test.
 *
 * Tests the full CRUD + event write/read cycle without invoking the
 * real LLM engine. We achieve that by not configuring any providers:
 * the events route only triggers runAgentLoop() when a provider is
 * resolvable, so without one it degrades to pure event storage.
 *
 * This exercises the durable transcript path that powers both the
 * session detail page and the debug tracing view.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-sessions-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
// IMPORTANT: no provider keys — events route will skip runAgentLoop
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;
let agentId: string;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });

  const agentRes = await app.request("/v1/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "session-test-agent",
      description: "For session tests",
      model: "claude-sonnet-4-6",
      system: "test system prompt",
    }),
  });
  const agent = (await agentRes.json()) as { id: string };
  agentId = agent.id;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Sessions + events", () => {
  let sessionId: string;

  it("creates a session bound to an agent and environment", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agentId,
        environment_id: "env_default",
        title: "First conversation",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      title: string;
      status: string;
      agent: { id: string; name: string };
      environment_id: string;
    };
    expect(body.id).toMatch(/^session_/);
    expect(body.title).toBe("First conversation");
    expect(body.status).toBe("idle");
    expect(body.agent.id).toBe(agentId);
    expect(body.environment_id).toBe("env_default");
    sessionId = body.id;
  });

  it("retrieves the session by id", async () => {
    const res = await app.request(`/v1/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(sessionId);
  });

  it("lists sessions and includes the new one", async () => {
    const res = await app.request("/v1/sessions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
    };
    expect(body.data.some((s) => s.id === sessionId)).toBe(true);
  });

  it("updates session title", async () => {
    const res = await app.request(`/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed session" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe("Renamed session");
  });

  it("returns an empty event list for a brand-new session", async () => {
    const res = await app.request(`/v1/sessions/${sessionId}/events`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown[];
      has_more: boolean;
    };
    expect(body.data).toEqual([]);
    expect(body.has_more).toBe(false);
  });

  it("stores a user message event (engine skipped — no provider)", async () => {
    const res = await app.request(
      `/v1/sessions/${sessionId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: "Hello agent" }],
            },
          ],
        }),
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; type: string }>;
    };
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.type).toBe("user.message");
    expect(body.data[0]?.id).toMatch(/^evt_/);
  });

  it("stores multiple events in a single POST", async () => {
    const res = await app.request(
      `/v1/sessions/${sessionId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: "Second message" }],
            },
            {
              type: "user.message",
              content: [{ type: "text", text: "Third message" }],
            },
          ],
        }),
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data.length).toBe(2);
  });

  it("lists events in ascending order by default", async () => {
    const res = await app.request(
      `/v1/sessions/${sessionId}/events?order=asc&limit=100`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        id: string;
        type: string;
        content?: Array<{ text: string }>;
      }>;
    };
    // We wrote 3 user messages so far
    expect(body.data.length).toBe(3);
    expect(body.data[0]?.content?.[0]?.text).toBe("Hello agent");
    expect(body.data[1]?.content?.[0]?.text).toBe("Second message");
    expect(body.data[2]?.content?.[0]?.text).toBe("Third message");
  });

  it("supports descending order", async () => {
    const res = await app.request(
      `/v1/sessions/${sessionId}/events?order=desc&limit=100`
    );
    const body = (await res.json()) as {
      data: Array<{ content?: Array<{ text: string }> }>;
    };
    expect(body.data[0]?.content?.[0]?.text).toBe("Third message");
    expect(body.data[2]?.content?.[0]?.text).toBe("Hello agent");
  });

  it("supports limit-based pagination via has_more", async () => {
    const res = await app.request(
      `/v1/sessions/${sessionId}/events?order=asc&limit=2`
    );
    const body = (await res.json()) as {
      data: unknown[];
      has_more: boolean;
      first_id: string;
      last_id: string;
    };
    expect(body.data.length).toBe(2);
    expect(body.has_more).toBe(true);
    expect(body.first_id).toBeTruthy();
    expect(body.last_id).toBeTruthy();
  });

  it("returns 404 for send events on a nonexistent session", async () => {
    const res = await app.request(
      "/v1/sessions/session_does_not_exist/events",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            { type: "user.message", content: [{ type: "text", text: "x" }] },
          ],
        }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("stops a session via POST /v1/sessions/:id/stop", async () => {
    // Create a fresh session so other tests don't race against it
    const createRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agentId,
        environment_id: "env_default",
        title: "Stoppable session",
      }),
    });
    const created = (await createRes.json()) as { id: string; status: string };
    // New sessions start idle — mark it running first so Stop has
    // something to transition away from (simulates the engine having
    // just kicked off a turn).
    const { getDB } = await import("../db/index.js");
    const db = await getDB();
    await db.run("UPDATE sessions SET status = 'running' WHERE id = ?", created.id);

    const stopRes = await app.request(`/v1/sessions/${created.id}/stop`, {
      method: "POST",
    });
    expect(stopRes.status).toBe(200);
    const body = (await stopRes.json()) as { id: string; status: string };
    expect(body.id).toBe(created.id);
    expect(body.status).toBe("terminated");

    // A session.status_terminated event was persisted so the
    // transcript reflects the explicit stop.
    const eventsRes = await app.request(
      `/v1/sessions/${created.id}/events?order=asc&limit=100`,
    );
    const eventsBody = (await eventsRes.json()) as {
      data: Array<{ type: string; reason?: string }>;
    };
    const terminated = eventsBody.data.find(
      (e) => e.type === "session.status_terminated",
    );
    expect(terminated).toBeTruthy();
    expect((terminated as any)?.reason).toBe("user_requested");
  });

  it("stop on an unknown session returns 404", async () => {
    const res = await app.request("/v1/sessions/session_bogus/stop", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
