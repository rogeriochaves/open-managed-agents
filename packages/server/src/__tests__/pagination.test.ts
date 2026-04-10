/**
 * Cursor pagination regression test.
 *
 * Every list handler (agents, sessions, environments, vaults)
 * used to ignore `after_id`. The client tracked a cursorStack,
 * clicked "Next page", and the server returned the same first
 * page forever. A user with >20 rows literally couldn't see
 * the rest of their data.
 *
 * This suite creates 3 rows in each table, pages with limit=1,
 * and asserts that the second call honors the cursor and
 * returns a different row. Runs against the real sqlite
 * adapter via createApp() with no stubs.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-pagination-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.OMA_DEFAULT_ADMIN_PASSWORD = "admin-test-pw";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.AUTH_ENABLED = "false";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");
const { getDB, newId } = await import("../db/index.js");

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: creates a row and returns its id. Uses different created_at
// timestamps (1s apart) so the DESC sort is deterministic — without
// this SQLite's string comparison on iso timestamps is still correct
// but tied creates at the boundary would make the test flaky.
async function insertAgent(name: string, createdAtIso: string): Promise<string> {
  const db = await getDB();
  const id = newId("agent");
  await db.run(
    `INSERT INTO agents (id, name, description, system, model_id, model_speed, model_provider_id, tools, mcp_servers, skills, metadata, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    null,
    null,
    "claude-sonnet-4-6",
    "standard",
    null,
    "[]",
    "[]",
    "[]",
    "{}",
    1,
    createdAtIso,
    createdAtIso,
  );
  return id;
}

async function insertSession(title: string, createdAtIso: string): Promise<string> {
  const db = await getDB();
  const id = newId("sesn");
  await db.run(
    `INSERT INTO sessions (id, title, agent_id, agent_snapshot, environment_id, status, resources, metadata, vault_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    title,
    "agent_stub",
    JSON.stringify({ id: "agent_stub", name: "Stub" }),
    "env_default",
    "idle",
    "[]",
    "{}",
    "[]",
    createdAtIso,
    createdAtIso,
  );
  return id;
}

async function insertEnvironment(name: string, createdAtIso: string): Promise<string> {
  const db = await getDB();
  const id = newId("env");
  await db.run(
    `INSERT INTO environments (id, name, description, networking, packages, cloud_config, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    null,
    JSON.stringify({ type: "unrestricted" }),
    "{}",
    null,
    "{}",
    createdAtIso,
    createdAtIso,
  );
  return id;
}

async function insertVault(displayName: string, createdAtIso: string): Promise<string> {
  const db = await getDB();
  const id = newId("vlt");
  await db.run(
    `INSERT INTO vaults (id, name, description, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    displayName,
    null,
    "{}",
    createdAtIso,
    createdAtIso,
  );
  return id;
}

describe("Cursor pagination via after_id", () => {
  // Shared timestamps: 3 rows created 10s apart so the cursor
  // comparisons are unambiguous.
  const t1 = "2026-04-10T10:00:00.000Z";
  const t2 = "2026-04-10T10:00:10.000Z";
  const t3 = "2026-04-10T10:00:20.000Z";

  it("agents: after_id honors the cursor instead of returning page 1", async () => {
    const a1 = await insertAgent("agent-alpha", t1);
    const a2 = await insertAgent("agent-beta", t2);
    const a3 = await insertAgent("agent-gamma", t3);

    // Page 1 — descending by created_at so the newest row comes first.
    const page1 = await app.request("/v1/agents?limit=1");
    expect(page1.status).toBe(200);
    const page1Body = (await page1.json()) as {
      data: Array<{ id: string; created_at: string }>;
      has_more: boolean;
      last_id: string | null;
    };
    expect(page1Body.data).toHaveLength(1);
    expect(page1Body.data[0]!.id).toBe(a3);
    expect(page1Body.has_more).toBe(true);
    expect(page1Body.last_id).toBe(a3);

    // Page 2 — must return a DIFFERENT row. This was the bug: the
    // old handler ignored after_id and returned a3 again.
    const page2 = await app.request(`/v1/agents?limit=1&after_id=${a3}`);
    const page2Body = (await page2.json()) as {
      data: Array<{ id: string }>;
      has_more: boolean;
    };
    expect(page2Body.data).toHaveLength(1);
    expect(page2Body.data[0]!.id).toBe(a2);
    expect(page2Body.has_more).toBe(true);

    // Page 3 — one row left, has_more false.
    const page3 = await app.request(`/v1/agents?limit=1&after_id=${a2}`);
    const page3Body = (await page3.json()) as {
      data: Array<{ id: string }>;
      has_more: boolean;
    };
    expect(page3Body.data).toHaveLength(1);
    expect(page3Body.data[0]!.id).toBe(a1);
    expect(page3Body.has_more).toBe(false);
  });

  it("sessions: after_id honors the cursor", async () => {
    const s1 = await insertSession("alpha", t1);
    const s2 = await insertSession("beta", t2);
    const s3 = await insertSession("gamma", t3);

    const page1 = await app.request("/v1/sessions?limit=1");
    const body1 = (await page1.json()) as { data: Array<{ id: string }> };
    expect(body1.data[0]!.id).toBe(s3);

    const page2 = await app.request(`/v1/sessions?limit=1&after_id=${s3}`);
    const body2 = (await page2.json()) as { data: Array<{ id: string }> };
    expect(body2.data[0]!.id).toBe(s2);

    const page3 = await app.request(`/v1/sessions?limit=1&after_id=${s2}`);
    const body3 = (await page3.json()) as { data: Array<{ id: string }> };
    expect(body3.data[0]!.id).toBe(s1);
  });

  it("environments: after_id honors the cursor", async () => {
    const e1 = await insertEnvironment("env-alpha", t1);
    const e2 = await insertEnvironment("env-beta", t2);
    const e3 = await insertEnvironment("env-gamma", t3);

    const page1 = await app.request("/v1/environments?limit=1");
    const body1 = (await page1.json()) as { data: Array<{ id: string }> };
    // The seeded default env (env_default) may interleave here with
    // a created_at earlier than our t1, but the DESC order means
    // our newest (e3) must be first.
    expect(body1.data[0]!.id).toBe(e3);

    const page2 = await app.request(`/v1/environments?limit=1&after_id=${e3}`);
    const body2 = (await page2.json()) as { data: Array<{ id: string }> };
    expect(body2.data[0]!.id).toBe(e2);

    const page3 = await app.request(`/v1/environments?limit=1&after_id=${e2}`);
    const body3 = (await page3.json()) as { data: Array<{ id: string }> };
    expect(body3.data[0]!.id).toBe(e1);
  });

  it("vaults: after_id honors the cursor", async () => {
    const v1 = await insertVault("vault-alpha", t1);
    const v2 = await insertVault("vault-beta", t2);
    const v3 = await insertVault("vault-gamma", t3);

    const page1 = await app.request("/v1/vaults?limit=1");
    const body1 = (await page1.json()) as { data: Array<{ id: string }> };
    expect(body1.data[0]!.id).toBe(v3);

    const page2 = await app.request(`/v1/vaults?limit=1&after_id=${v3}`);
    const body2 = (await page2.json()) as { data: Array<{ id: string }> };
    expect(body2.data[0]!.id).toBe(v2);

    const page3 = await app.request(`/v1/vaults?limit=1&after_id=${v2}`);
    const body3 = (await page3.json()) as { data: Array<{ id: string }> };
    expect(body3.data[0]!.id).toBe(v1);
  });

  it("unknown after_id falls back to page 1 instead of 500ing", async () => {
    // If the cursor row doesn't exist (deleted between page loads,
    // bogus id from a tab that's been open for a week, etc.),
    // we degrade to "no filter" rather than crashing or silently
    // returning zero rows.
    //
    // Insert a sentinel so the fallback has something to return —
    // don't depend on other tests in this file having run.
    await insertAgent("fallback-sentinel", "2026-04-10T09:00:00.000Z");

    const res = await app.request("/v1/agents?limit=1&after_id=agent_does_not_exist");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  // ── Date range filters ─────────────────────────────────────────────
  // AgentListQuerySchema + SessionListQuerySchema declare
  // created_at[gte]/[lte] and the web UI sends them on "Last 24
  // hours" / "Last 7 days" clicks, but the handlers used to ignore
  // them — a visual illusion where the dropdown changed and the
  // rows didn't.

  it("agents: created_at[gte] filter excludes rows older than the boundary", async () => {
    // Insert rows at fixed timestamps so the filter boundary is
    // unambiguous. We reuse the agents table which may already have
    // rows from previous tests, so pin the timestamps well outside
    // that range.
    const old = await insertAgent("agent-old", "2025-01-01T00:00:00.000Z");
    const recent = await insertAgent("agent-recent", "2025-06-01T00:00:00.000Z");

    // Boundary: 2025-03-01 — should include recent but NOT old.
    const res = await app.request(
      "/v1/agents?limit=100&created_at%5Bgte%5D=2025-03-01T00:00:00.000Z",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((r) => r.id);
    expect(ids).toContain(recent);
    expect(ids).not.toContain(old);
  });

  it("agents: created_at[lte] filter excludes rows newer than the boundary", async () => {
    const old = await insertAgent("agent-lte-old", "2024-01-01T00:00:00.000Z");
    const recent = await insertAgent(
      "agent-lte-recent",
      "2024-12-01T00:00:00.000Z",
    );

    const res = await app.request(
      "/v1/agents?limit=100&created_at%5Blte%5D=2024-06-01T00:00:00.000Z",
    );
    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((r) => r.id);
    expect(ids).toContain(old);
    expect(ids).not.toContain(recent);
  });

  it("sessions: created_at[gte] range filter works end-to-end", async () => {
    const old = await insertSession(
      "sess-old",
      "2023-01-01T00:00:00.000Z",
    );
    const recent = await insertSession(
      "sess-recent",
      "2023-12-01T00:00:00.000Z",
    );

    const res = await app.request(
      "/v1/sessions?limit=100&created_at%5Bgte%5D=2023-06-01T00:00:00.000Z",
    );
    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((r) => r.id);
    expect(ids).toContain(recent);
    expect(ids).not.toContain(old);
  });

  it("date range + after_id compose correctly", async () => {
    // With a gte filter AND a cursor, both must be honored.
    const t1 = "2022-01-01T00:00:00.000Z";
    const t2 = "2022-06-01T00:00:00.000Z";
    const t3 = "2022-12-01T00:00:00.000Z";
    const a1 = await insertAgent("compose-1", t1);
    const a2 = await insertAgent("compose-2", t2);
    const a3 = await insertAgent("compose-3", t3);

    // Range: t1.5 onwards (excludes a1). Cursor: after a3.
    // Expected: only a2 remains.
    const res = await app.request(
      `/v1/agents?limit=100&created_at%5Bgte%5D=2022-03-01T00:00:00.000Z&after_id=${a3}`,
    );
    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((r) => r.id);
    expect(ids).toContain(a2);
    expect(ids).not.toContain(a1);
    expect(ids).not.toContain(a3);
  });
});
