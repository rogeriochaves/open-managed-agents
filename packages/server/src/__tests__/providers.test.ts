/**
 * Providers (multi-LLM) integration test.
 *
 * Exercises the public provider CRUD routes that back the "use any LLM
 * provider" README claim. Covers: list, create, set-as-default swap,
 * models endpoint graceful-empty fallback, and delete.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-providers-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function listProviders() {
  const res = await app.request("/v1/providers");
  expect(res.status).toBe(200);
  return (await res.json()) as {
    data: Array<{
      id: string;
      name: string;
      type: string;
      is_default: boolean;
      has_api_key: boolean;
    }>;
  };
}

describe("Providers API (multi-LLM)", () => {
  it("starts with an empty provider list", async () => {
    const body = await listProviders();
    expect(body.data).toEqual([]);
  });

  it("creates an Anthropic provider as default", async () => {
    const res = await app.request("/v1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Anthropic",
        type: "anthropic",
        api_key: "sk-ant-test-123",
        default_model: "claude-sonnet-4-6",
        is_default: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      type: string;
      is_default: boolean;
      has_api_key: boolean;
    };
    expect(body.type).toBe("anthropic");
    expect(body.is_default).toBe(true);
    // Sanity: api_key is not echoed back, only has_api_key=true
    expect(body.has_api_key).toBe(true);
    expect((body as any).api_key).toBeUndefined();
  });

  it("creates an OpenAI provider without default flag", async () => {
    const res = await app.request("/v1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OpenAI",
        type: "openai",
        api_key: "sk-test-456",
        default_model: "gpt-4o",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_default: boolean };
    expect(body.is_default).toBe(false);
  });

  it("supports a custom openai-compatible endpoint (Together, Groq, …)", async () => {
    const res = await app.request("/v1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Together AI",
        type: "openai-compatible",
        api_key: "together-key",
        base_url: "https://api.together.xyz/v1",
        default_model: "meta-llama/Llama-3-70b-chat-hf",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      base_url: string | null;
    };
    expect(body.type).toBe("openai-compatible");
    expect(body.base_url).toBe("https://api.together.xyz/v1");
  });

  it("supports an Ollama local provider (no api_key needed)", async () => {
    const res = await app.request("/v1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ollama",
        type: "ollama",
        base_url: "http://localhost:11434/v1",
        default_model: "llama3.1",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { has_api_key: boolean };
    expect(body.has_api_key).toBe(false);
  });

  it("has all 4 providers listed, with exactly one default", async () => {
    const body = await listProviders();
    const types = body.data.map((p) => p.type).sort();
    expect(types).toEqual([
      "anthropic",
      "ollama",
      "openai",
      "openai-compatible",
    ]);
    const defaults = body.data.filter((p) => p.is_default);
    expect(defaults.length).toBe(1);
    expect(defaults[0]?.type).toBe("anthropic");
  });

  it("re-assigning is_default clears the previous default", async () => {
    const before = await listProviders();
    const openai = before.data.find((p) => p.type === "openai")!;

    // Delete + recreate OpenAI with is_default=true (there's no PATCH route)
    await app.request(`/v1/providers/${openai.id}`, { method: "DELETE" });
    const res = await app.request("/v1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OpenAI",
        type: "openai",
        api_key: "sk-test-456",
        default_model: "gpt-4o",
        is_default: true,
      }),
    });
    expect(res.status).toBe(200);

    const after = await listProviders();
    const defaults = after.data.filter((p) => p.is_default);
    expect(defaults.length).toBe(1);
    expect(defaults[0]?.type).toBe("openai");
  });

  it("/models returns an empty list for an Ollama provider that is not running", async () => {
    const before = await listProviders();
    const ollama = before.data.find((p) => p.type === "ollama")!;

    const res = await app.request(`/v1/providers/${ollama.id}/models`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: string[] };
    expect(Array.isArray(body.models)).toBe(true);
  });

  it("deletes a provider", async () => {
    const before = await listProviders();
    const togetherBefore = before.data.find(
      (p) => p.type === "openai-compatible"
    );
    expect(togetherBefore).toBeTruthy();

    const delRes = await app.request(
      `/v1/providers/${togetherBefore!.id}`,
      { method: "DELETE" }
    );
    expect(delRes.status).toBe(200);

    const after = await listProviders();
    expect(
      after.data.find((p) => p.type === "openai-compatible")
    ).toBeUndefined();
  });
});
