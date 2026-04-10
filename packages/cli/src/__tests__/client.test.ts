/**
 * CLI client config test.
 *
 * Critical regression guard: the CLI must point at the self-hosted
 * OMA server, not at api.anthropic.com. The previous version of
 * client.ts passed no baseURL override, so every `oma agents list`
 * actually hit Anthropic's cloud — completely defeating the
 * self-hosting story in the README.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function resetClientModule() {
  // The client module caches its singleton, so we need a fresh import
  // per test to pick up env var changes.
  vi.resetModules();
  return await import("../client.js");
}

const ORIG = { ...process.env };

describe("CLI client config", () => {
  beforeEach(() => {
    delete process.env.OMA_API_BASE;
    delete process.env.OPEN_MANAGED_AGENTS_API_BASE;
    delete process.env.OMA_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in ORIG)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(ORIG)) {
      process.env[k] = v;
    }
  });

  it("defaults to http://localhost:3001 when no env var is set", async () => {
    const mod = await resetClientModule();
    expect(mod.getApiBase()).toBe("http://localhost:3001");
  });

  it("honors OMA_API_BASE", async () => {
    process.env.OMA_API_BASE = "https://oma.acme.internal";
    const mod = await resetClientModule();
    expect(mod.getApiBase()).toBe("https://oma.acme.internal");
  });

  it("accepts OPEN_MANAGED_AGENTS_API_BASE as an alias", async () => {
    process.env.OPEN_MANAGED_AGENTS_API_BASE = "https://agents.example.com";
    const mod = await resetClientModule();
    expect(mod.getApiBase()).toBe("https://agents.example.com");
  });

  it("builds an Anthropic-SDK client whose baseURL points at the OMA server", async () => {
    process.env.OMA_API_BASE = "http://oma.test:9999";
    process.env.OMA_API_KEY = "test-key";
    const mod = await resetClientModule();
    const client = mod.getClient();
    // The SDK exposes baseURL as a public property.
    expect(client.baseURL).toBe("http://oma.test:9999");
  });

  it("uses OMA_API_KEY when provided, falling back to ANTHROPIC_API_KEY, then 'oma-local'", async () => {
    // Priority: OMA_API_KEY
    process.env.OMA_API_KEY = "oma-primary";
    process.env.ANTHROPIC_API_KEY = "anth-secondary";
    {
      const mod = await resetClientModule();
      const client = mod.getClient();
      expect(client.apiKey).toBe("oma-primary");
    }

    // Fallback: ANTHROPIC_API_KEY
    delete process.env.OMA_API_KEY;
    {
      const mod = await resetClientModule();
      const client = mod.getClient();
      expect(client.apiKey).toBe("anth-secondary");
    }

    // Final fallback: placeholder
    delete process.env.ANTHROPIC_API_KEY;
    {
      const mod = await resetClientModule();
      const client = mod.getClient();
      expect(client.apiKey).toBe("oma-local");
    }
  });
});
