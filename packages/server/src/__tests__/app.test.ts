/**
 * Integration tests for the server.
 *
 * Uses `createApp()` + `app.request()` so the Hono app is exercised
 * end-to-end without binding a real port. Each test file gets its own
 * temp SQLite DB via `DATABASE_PATH`, set before the server modules
 * are imported.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

// IMPORTANT: set DATABASE_PATH before importing anything that touches the DB.
const tmpDir = mkdtempSync(join(tmpdir(), "oma-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false"; // Disable auth guard for these tests
// Clear any inherited provider keys so the seed pass is clean & deterministic.
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

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});

describe("Agents API", () => {
  it("creates and retrieves an agent", async () => {
    const createRes = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-agent",
        description: "A test agent",
        model: "claude-sonnet-4-6",
        system: "You are a helpful assistant.",
      }),
    });
    expect(createRes.status).toBe(200);
    const agent = (await createRes.json()) as { id: string; name: string };
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.name).toBe("test-agent");

    const getRes = await app.request(`/v1/agents/${agent.id}`);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { id: string; name: string };
    expect(fetched.id).toBe(agent.id);
    expect(fetched.name).toBe("test-agent");
  });

  it("lists agents", async () => {
    const res = await app.request("/v1/agents");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("rejects an agent without a name", async () => {
    const res = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("Environments API", () => {
  it("lists environments (seeded default)", async () => {
    const res = await app.request("/v1/environments");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.some((e) => e.id === "env_default")).toBe(true);
  });
});

describe("Providers API", () => {
  it("lists providers", async () => {
    const res = await app.request("/v1/providers");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("OpenAPI spec", () => {
  it("serves an openapi.json document", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: object };
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(5);
  });
});
