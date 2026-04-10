/**
 * MCP connector credential storage test.
 *
 * User complaint that drove this: "I can't oauth with those connectors
 * — it's all fake, all pretend on the frontend". The connector browser
 * was purely cosmetic: clicking a connector did nothing, there was no
 * way to store credentials for it, no connected state.
 *
 * This file covers the minimum real primitive underneath a later full
 * OAuth flow: POST /v1/mcp/connectors/:id/connect with a token,
 * encrypted at rest and scoped to the current organization, surfaced
 * on the list endpoint as `connected: true`, and deletable via DELETE.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-mcpconn-test-"));
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
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("MCP connector credential storage", () => {
  it("returns connected=false for every connector on a fresh install", async () => {
    const res = await app.request("/v1/mcp/connectors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; connected?: boolean }>;
    };
    expect(body.data.length).toBeGreaterThan(0);
    for (const c of body.data) {
      expect(c.connected ?? false).toBe(false);
    }
  });

  it("stores a connector token encrypted and surfaces connected=true on list", async () => {
    const res = await app.request("/v1/mcp/connectors/slack/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "xoxb-super-secret-bot-token" }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      id: string;
      connector_id: string;
      auth_type: string;
    };
    expect(body.connector_id).toBe("slack");

    // The stored token must NOT be the plaintext — it's encrypted at rest.
    const db = await getDB();
    const row = await db.get<{ token_encrypted: string }>(
      "SELECT token_encrypted FROM mcp_connections WHERE connector_id = ?",
      "slack",
    );
    expect(row?.token_encrypted).toBeTruthy();
    expect(row?.token_encrypted).not.toBe("xoxb-super-secret-bot-token");

    // The list endpoint now reports slack as connected
    const list = await app.request("/v1/mcp/connectors");
    const listBody = (await list.json()) as {
      data: Array<{ id: string; connected?: boolean }>;
    };
    const slack = listBody.data.find((c) => c.id === "slack");
    expect(slack?.connected).toBe(true);

    // And the single-connector GET also reports it
    const one = await app.request("/v1/mcp/connectors/slack");
    expect(one.status).toBe(200);
    const oneBody = (await one.json()) as { connected?: boolean };
    expect(oneBody.connected).toBe(true);
  });

  it("overwrites the token on a second connect (upsert)", async () => {
    // First connect
    await app.request("/v1/mcp/connectors/notion/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "first-token" }),
    });

    // Second connect with a different token
    const res = await app.request("/v1/mcp/connectors/notion/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "second-token" }),
    });
    expect(res.status).toBe(200);

    const db = await getDB();
    const rows = await db.all<{ id: string }>(
      "SELECT id FROM mcp_connections WHERE connector_id = ?",
      "notion",
    );
    expect(rows).toHaveLength(1);
  });

  it("rejects connect for an unknown connector with 404", async () => {
    const res = await app.request(
      "/v1/mcp/connectors/does-not-exist/connect",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "whatever" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("deletes the stored credential on DELETE and flips connected back to false", async () => {
    const res = await app.request("/v1/mcp/connectors/slack/connect", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean };
    expect(body.deleted).toBe(true);

    const db = await getDB();
    const row = await db.get(
      "SELECT id FROM mcp_connections WHERE connector_id = ?",
      "slack",
    );
    expect(row).toBeFalsy();

    const list = await app.request("/v1/mcp/connectors");
    const listBody = (await list.json()) as {
      data: Array<{ id: string; connected?: boolean }>;
    };
    const slack = listBody.data.find((c) => c.id === "slack");
    expect(slack?.connected).toBe(false);
  });
});
