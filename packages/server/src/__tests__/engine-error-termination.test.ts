/**
 * Engine error-path regression test.
 *
 * Prior behavior: when runAgentLoop's provider.chat() threw, the
 * catch block emitted session.error (good) but then called
 * updateSessionStatus(sessionId, "idle") and emitted
 * session.status_idle with stop_reason: "end_turn". A failed run
 * looked identical to a successful run in the sessions list —
 * same green-ish "idle" badge, same stop reason — so an operator
 * had to click into the session and find the buried session.error
 * event to know anything had gone wrong.
 *
 * Fix: the error path now marks the session "terminated" (which
 * renders in red via the UI's statusVariant) and emits a matching
 * session.status_terminated event. This test locks that behavior
 * by running the real engine loop against a provider stub that
 * always throws, then asserting both the DB status AND the final
 * event type.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-engine-err-term-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");
const { getDB, newId } = await import("../db/index.js");
const { runAgentLoop } = await import("../engine/index.js");
import type { LLMProvider } from "../providers/index.js";
import type { AgentConfig } from "../engine/index.js";

let app: Awaited<ReturnType<typeof createApp>>;
let sessionId: string;

/**
 * Minimal LLMProvider stub that always throws on chat().
 * runAgentLoop hits chat() on the very first iteration, so the
 * throw triggers the error path deterministically.
 */
const throwingProvider: LLMProvider = {
  type: "stub",
  name: "throwing-stub",
  async chat() {
    throw new Error("boom: provider unavailable");
  },
  async *chatStream() {
    throw new Error("not used");
  },
  async listModels() {
    return [];
  },
};

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });

  // Insert a session row + a seed user.message directly. The
  // engine's buildMessagesFromEvents breaks the loop early when
  // there are zero messages, so without the seed event the loop
  // exits via the happy path before the throwing provider is
  // ever called.
  const db = await getDB();
  sessionId = newId("sesn");
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO sessions (id, title, agent_id, agent_snapshot, environment_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sessionId,
    "error-path-test",
    "agent_stub",
    JSON.stringify({ id: "agent_stub", name: "stub" }),
    "env_default",
    "idle",
    now,
    now,
  );
  await db.run(
    `INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)`,
    newId("evt"),
    sessionId,
    "user.message",
    JSON.stringify({ content: [{ type: "text", text: "hello" }] }),
    now,
  );
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runAgentLoop error path", () => {
  it("marks the session terminated (not idle) when the provider throws", async () => {
    const agentConfig: AgentConfig = {
      name: "stub",
      system: null,
      model: "stub-model",
      tools: [],
      mcp_servers: [],
      skills: [],
    };

    const emitted: Array<{ type: string }> = [];
    const emitter = {
      emit(event: { type: string }) {
        emitted.push(event);
      },
      close() {},
    };

    await runAgentLoop(sessionId, agentConfig, throwingProvider, emitter, 5);

    // ── DB state ───────────────────────────────────────────────
    const db = await getDB();
    const row = await db.get<{ status: string }>(
      "SELECT status FROM sessions WHERE id = ?",
      sessionId,
    );
    expect(row?.status).toBe("terminated");
    // The previous bug set this to "idle" — if a future change
    // reverts that, the UI goes back to showing failed sessions
    // with the same green badge as successes.
    expect(row?.status).not.toBe("idle");

    // ── Emitted event sequence ─────────────────────────────────
    // The happy path emits session.status_running then
    // session.status_idle. The error path must start with
    // session.status_running, then emit session.error, then
    // finish with session.status_terminated.
    const types = emitted.map((e) => e.type);
    expect(types[0]).toBe("session.status_running");
    expect(types).toContain("session.error");
    expect(types[types.length - 1]).toBe("session.status_terminated");

    // And it must NOT close with status_idle — that's the bug.
    expect(types).not.toContain("session.status_idle");
  });
});

describe("runAgentLoop cooperative cancellation path", () => {
  it("emits session.status_terminated (not session.stopped) when the user clicks Stop mid-run", async () => {
    // Fresh session so the other test's state doesn't bleed.
    const db = await getDB();
    const localSessionId = newId("sesn");
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO sessions (id, title, agent_id, agent_snapshot, environment_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      localSessionId,
      "cancel-path-test",
      "agent_stub",
      JSON.stringify({ id: "agent_stub", name: "stub" }),
      "env_default",
      "idle",
      now,
      now,
    );
    await db.run(
      `INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)`,
      newId("evt"),
      localSessionId,
      "user.message",
      JSON.stringify({ content: [{ type: "text", text: "hello" }] }),
      now,
    );

    // This provider simulates the real-world Stop flow: runAgentLoop
    // flips the session to "running" on entry, then enters iteration
    // 1 and calls provider.chat(). Halfway through that chat(), the
    // user clicks Stop — represented here by the provider flipping
    // the row to "terminated" as a side effect before returning.
    // The provider returns a tool_use result so the loop DOESN'T
    // exit via the happy-path break on stop_reason "end_turn",
    // which would skip the cancellation check. Iteration 2 runs
    // the cooperative status check and takes the cancellation
    // branch.
    let chatCalls = 0;
    const cancellingProvider: LLMProvider = {
      type: "stub",
      name: "cancelling-stub",
      async chat() {
        chatCalls++;
        if (chatCalls === 1) {
          // Simulate the user clicking Stop mid-run
          await db.run(
            "UPDATE sessions SET status = ? WHERE id = ?",
            "terminated",
            localSessionId,
          );
          // Return a tool_use so the loop keeps going to iteration 2
          return {
            content: [
              {
                type: "tool_use" as const,
                id: "toolu_1",
                name: "nonexistent_tool",
                input: {},
              },
            ],
            stop_reason: "tool_use" as const,
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
            model: "stub-model",
          };
        }
        throw new Error(
          "provider.chat() called after cancellation — loop did not honor the status flip",
        );
      },
      async *chatStream() {
        throw new Error("not used");
      },
      async listModels() {
        return [];
      },
    };

    const agentConfig: AgentConfig = {
      name: "stub",
      system: null,
      model: "stub-model",
      tools: [],
      mcp_servers: [],
      skills: [],
    };

    const emitted: Array<{ type: string }> = [];
    const emitter = {
      emit(event: { type: string }) {
        emitted.push(event);
      },
      close() {},
    };

    await runAgentLoop(
      localSessionId,
      agentConfig,
      cancellingProvider,
      emitter,
      5,
    );

    const types = emitted.map((e) => e.type);
    // Must include a proper declared status event so the UI's
    // EVENT_BADGES map renders the red terminated badge
    // immediately via SSE instead of waiting 5s for polling.
    expect(types).toContain("session.status_terminated");
    // And must NOT emit the undeclared "session.stopped" type —
    // that's the bug this test guards against. Prior to this
    // fix the engine used an event type that isn't in
    // packages/types/src/events.ts, so the client's switch/case
    // fell through to the default grey badge.
    expect(types).not.toContain("session.stopped");
    // Exactly one chat() call — iteration 2 takes the
    // cancellation branch before reaching the next chat().
    expect(chatCalls).toBe(1);
  });
});
