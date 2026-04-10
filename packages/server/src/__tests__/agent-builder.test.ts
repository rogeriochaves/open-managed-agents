/**
 * Agent builder chat endpoint test.
 *
 * Drives POST /v1/agent-builder/chat end-to-end against a stubbed LLM
 * provider. Verifies:
 *  - 503 when no provider is configured
 *  - a happy-path turn where the stubbed provider returns a reply with
 *    an ```oma-draft``` fenced JSON block, and the route correctly
 *    extracts + returns both the reply (with fence stripped) and the
 *    merged draft
 *  - the `done` signal is surfaced when the model sets done=true
 *  - provider info (id + name) is returned so the UI can show "using
 *    OpenAI gpt-5-mini" or similar
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-builder-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

// ─── Stub the provider layer BEFORE importing createApp ──────────────
// The agent-builder route calls createProvider(config).chat(...). We
// replace createProvider with a factory that returns a fake whose chat()
// method returns a fixed response shape. That way this test exercises
// the full HTTP route + prompt parsing without burning API credits.

const stubChat = vi.fn();

vi.mock("../providers/index.js", async () => {
  const actual = await vi.importActual<typeof import("../providers/index.js")>(
    "../providers/index.js",
  );
  return {
    ...actual,
    createProvider: () => ({
      type: "anthropic",
      name: "Stub Provider",
      chat: stubChat,
      chatStream: async function* () {
        /* unused */
      },
      listModels: async () => ["stub-model"],
    }),
  };
});

const { createApp } = await import("../app.js");
const { getDB } = await import("../db/index.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /v1/agent-builder/chat", () => {
  it("returns 503 when no LLM provider is configured", async () => {
    // Ensure no rows
    const db = await getDB();
    await db.run("DELETE FROM llm_providers");

    const res = await app.request("/v1/agent-builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      error: { type: string; message: string };
    };
    expect(body.error.type).toBe("provider_not_configured");
  });

  it("returns a parsed reply + draft when the stub provider returns a fenced block", async () => {
    const db = await getDB();
    await db.run(
      "INSERT INTO llm_providers (id, name, type, api_key_encrypted, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?)",
      "provider_stub",
      "Stub Provider",
      "anthropic",
      "stub-key",
      "stub-model",
      1,
    );

    stubChat.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: `Got it! I'll build you a support agent. What's your product called?

\`\`\`oma-draft
{
  "name": "support-agent",
  "description": "Answers customer questions from docs and escalates when needed",
  "system": "You are a customer support agent.",
  "mcp_servers": [
    { "name": "slack", "url": "https://mcp.slack.com/sse", "type": "url" }
  ],
  "done": false
}
\`\`\``,
        },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
      model: "stub-model",
    });

    const res = await app.request("/v1/agent-builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "I want to build a customer support agent" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reply: string;
      draft: Record<string, unknown>;
      done: boolean;
      provider: { id: string; name: string };
    };

    expect(body.reply).toContain("Got it!");
    expect(body.reply).not.toContain("oma-draft");
    expect(body.reply).not.toContain("```");
    expect(body.draft.name).toBe("support-agent");
    expect(body.draft.description).toBe(
      "Answers customer questions from docs and escalates when needed",
    );
    const mcpServers = body.draft.mcp_servers as Array<{ name: string }>;
    expect(mcpServers).toHaveLength(1);
    expect(mcpServers[0]!.name).toBe("slack");
    expect(body.done).toBe(false);
    expect(body.provider).toEqual({ id: "provider_stub", name: "Stub Provider" });
  });

  it("sets done=true when the draft block says done:true", async () => {
    stubChat.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: `All set! Click "Create agent" when you're ready.

\`\`\`oma-draft
{
  "name": "support-agent",
  "description": "final",
  "system": "final prompt",
  "done": true
}
\`\`\``,
        },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 20 },
      model: "stub-model",
    });

    const res = await app.request("/v1/agent-builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "looks good, ship it" },
        ],
        draft: {
          name: "support-agent",
          description: "earlier version",
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reply: string;
      draft: { description: string; system: string };
      done: boolean;
    };
    expect(body.done).toBe(true);
    expect(body.draft.description).toBe("final");
    expect(body.draft.system).toBe("final prompt");
  });

  it("falls back gracefully when the model forgets the fenced block", async () => {
    stubChat.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Sure, tell me more about what you want." },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 10 },
      model: "stub-model",
    });

    const res = await app.request("/v1/agent-builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        draft: { name: "prior-draft" },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reply: string;
      draft: { name: string };
      done: boolean;
    };
    expect(body.reply).toBe("Sure, tell me more about what you want.");
    // Prior draft is preserved unchanged when no new block is emitted
    expect(body.draft.name).toBe("prior-draft");
    expect(body.done).toBe(false);
  });
});
