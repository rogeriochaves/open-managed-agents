/**
 * Usage summary integration test.
 *
 * Exercises /v1/usage/summary, the route that powers the "Usage & Cost"
 * analytics page. Creates agents and sessions, then injects usage JSON
 * directly into the sessions table (the normal path is via the engine
 * which would require a live LLM). Verifies aggregation by agent and
 * by provider, plus cost estimation.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-usage-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");
const { getDB } = await import("../db/index.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });

  const db = await getDB();

  // Seed two providers so by_provider aggregation has something to resolve
  await db.run(
    "INSERT INTO llm_providers (id, name, type, api_key_encrypted, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?)",
    "provider_anthropic", "Anthropic", "anthropic", "sk-test", "claude-sonnet-4-6", 1
  );
  await db.run(
    "INSERT INTO llm_providers (id, name, type, api_key_encrypted, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?)",
    "provider_openai", "OpenAI", "openai", "sk-test", "gpt-4o", 0
  );

  // Create two agents via the public API (one anthropic, one openai)
  const a1 = await app.request("/v1/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "high-usage-agent",
      model: "claude-sonnet-4-6",
      model_provider_id: "provider_anthropic",
    }),
  });
  const a1Body = (await a1.json()) as { id: string };

  const a2 = await app.request("/v1/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "cheap-agent",
      model: "gpt-4o",
      model_provider_id: "provider_openai",
    }),
  });
  const a2Body = (await a2.json()) as { id: string };

  // Create two sessions for each agent
  async function createSession(agentId: string, title: string) {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: agentId,
        environment_id: "env_default",
        title,
      }),
    });
    const body = (await res.json()) as { id: string };
    return body.id;
  }
  const s1 = await createSession(a1Body.id, "anth-1");
  const s2 = await createSession(a1Body.id, "anth-2");
  const s3 = await createSession(a2Body.id, "openai-1");

  // Inject usage directly — normally populated by the engine
  await db.run(
    "UPDATE sessions SET usage = ? WHERE id = ?",
    JSON.stringify({ input_tokens: 100_000, output_tokens: 20_000 }),
    s1
  );
  await db.run(
    "UPDATE sessions SET usage = ? WHERE id = ?",
    JSON.stringify({ input_tokens: 50_000, output_tokens: 10_000 }),
    s2
  );
  await db.run(
    "UPDATE sessions SET usage = ? WHERE id = ?",
    JSON.stringify({ input_tokens: 200_000, output_tokens: 5_000 }),
    s3
  );
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /v1/usage/summary", () => {
  it("returns session and event totals", async () => {
    const res = await app.request("/v1/usage/summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total_sessions: number;
      total_input_tokens: number;
      total_output_tokens: number;
    };
    expect(body.total_sessions).toBe(3);
    expect(body.total_input_tokens).toBe(350_000);
    expect(body.total_output_tokens).toBe(35_000);
  });

  it("aggregates by agent", async () => {
    const res = await app.request("/v1/usage/summary");
    const body = (await res.json()) as {
      by_agent: Array<{
        agent_name: string;
        session_count: number;
        input_tokens: number;
        output_tokens: number;
      }>;
    };
    const high = body.by_agent.find((a) => a.agent_name === "high-usage-agent");
    const cheap = body.by_agent.find((a) => a.agent_name === "cheap-agent");
    expect(high?.session_count).toBe(2);
    expect(high?.input_tokens).toBe(150_000);
    expect(high?.output_tokens).toBe(30_000);
    expect(cheap?.session_count).toBe(1);
    expect(cheap?.input_tokens).toBe(200_000);
  });

  it("aggregates by provider", async () => {
    const res = await app.request("/v1/usage/summary");
    const body = (await res.json()) as {
      by_provider: Array<{
        provider_name: string;
        provider_type: string;
        input_tokens: number;
        output_tokens: number;
      }>;
    };
    const anth = body.by_provider.find(
      (p) => p.provider_type === "anthropic"
    );
    const oai = body.by_provider.find((p) => p.provider_type === "openai");
    expect(anth?.input_tokens).toBe(150_000);
    expect(anth?.output_tokens).toBe(30_000);
    expect(oai?.input_tokens).toBe(200_000);
    expect(oai?.output_tokens).toBe(5_000);
  });

  it("estimates cost using per-provider rates", async () => {
    const res = await app.request("/v1/usage/summary");
    const body = (await res.json()) as {
      estimated_cost_usd: number;
      by_provider: Array<{
        provider_type: string;
        estimated_cost_usd: number;
      }>;
    };

    // Anthropic: 150k in × $3/M + 30k out × $15/M = 0.45 + 0.45 = $0.90
    const anth = body.by_provider.find(
      (p) => p.provider_type === "anthropic"
    );
    expect(anth?.estimated_cost_usd).toBeCloseTo(0.9, 4);

    // OpenAI: 200k in × $2.5/M + 5k out × $10/M = 0.5 + 0.05 = $0.55
    const oai = body.by_provider.find((p) => p.provider_type === "openai");
    expect(oai?.estimated_cost_usd).toBeCloseTo(0.55, 4);

    // Total = 0.9 + 0.55 = 1.45
    expect(body.estimated_cost_usd).toBeCloseTo(1.45, 4);
  });

  it("sorts by_agent by total tokens descending", async () => {
    const res = await app.request("/v1/usage/summary");
    const body = (await res.json()) as {
      by_agent: Array<{
        agent_name: string;
        input_tokens: number;
        output_tokens: number;
      }>;
    };
    const totals = body.by_agent.map(
      (a) => a.input_tokens + a.output_tokens
    );
    expect(totals[0]).toBeGreaterThanOrEqual(totals[1] ?? 0);
  });

  it("accepts a ?days=N window", async () => {
    const res = await app.request("/v1/usage/summary?days=30");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total_sessions: number };
    expect(body.total_sessions).toBe(3);
  });
});
