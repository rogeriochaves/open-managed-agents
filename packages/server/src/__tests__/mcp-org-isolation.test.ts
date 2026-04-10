/**
 * MCP connector org-scoped isolation test.
 *
 * Validates that MCP connection tokens are stored and retrieved per
 * organization, so one org's stored credential never leaks into
 * another org's view. The key surface is GET /v1/mcp/connectors (list)
 * and GET /v1/mcp/connectors/:id (detail), both of which derive
 * organization_id from the authenticated user and pass it to
 * getConnectedIds().
 *
 * Test matrix:
 *   - org_default stores slack → org_default sees connected=true
 *   - org_default does NOT see another org's slack token
 *   - A second org (org_acme) storing a slack token does not affect org_default
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-mcp-org-isol-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.OMA_DEFAULT_ADMIN_PASSWORD = "admin-test-pw";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.AUTH_ENABLED; // auth ON
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");
const { getDB } = await import("../db/index.js");
const { hashPassword } = await import("../lib/auth-session.js");

let app: Awaited<ReturnType<typeof createApp>>;
let adminCookie: string; // belongs to org_default
let acmeUserCookie: string; // belongs to org_acme

function extractCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const m = raw.match(/oma_session=([^;]+)/);
  return m ? m[1]! : null;
}

async function login(email: string, password: string): Promise<string> {
  const res = await app.request("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return extractCookie(res)!;
}

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });

  const db = await getDB();

  // Create a second organization directly in the DB
  await db.run(
    `INSERT INTO organizations (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    "org_acme",
    "Acme Corp",
    "acme"
  );

  // Create a regular user in org_acme (not an admin)
  const hash = await hashPassword("acme-user-pw");
  await db.run(
    `INSERT INTO users (id, email, name, role, organization_id, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    "user_acme",
    "alice@acme.example",
    "Alice from Acme",
    "member",
    "org_acme",
    hash
  );

  // Admin (org_default) logs in
  adminCookie = await login("admin@localhost", "admin-test-pw");

  // Acme user logs in
  acmeUserCookie = await login("alice@acme.example", "acme-user-pw");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("MCP connector org-scoped isolation", () => {
  it("org_default does not see slack as connected before storing any token", async () => {
    const res = await app.request("/v1/mcp/connectors/slack", {
      headers: { cookie: `oma_session=${adminCookie}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { connected?: boolean };
    expect(body.connected).toBe(false);
  });

  it("acme org stores a slack token → acme sees slack as connected", async () => {
    const res = await app.request("/v1/mcp/connectors/slack/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${acmeUserCookie}`,
      },
      body: JSON.stringify({ token: "xoxb-acme-slack-token" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { connector_id: string };
    expect(body.connector_id).toBe("slack");

    // Acme user now sees slack as connected
    const detailRes = await app.request("/v1/mcp/connectors/slack", {
      headers: { cookie: `oma_session=${acmeUserCookie}` },
    });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json() as { connected?: boolean };
    expect(detail.connected).toBe(true);
  });

  it("org_default still does NOT see slack as connected (org isolation)", async () => {
    const res = await app.request("/v1/mcp/connectors/slack", {
      headers: { cookie: `oma_session=${adminCookie}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { connected?: boolean };
    expect(body.connected).toBe(false);
  });

  it("list endpoint also respects org scope — org_default has zero connected", async () => {
    const res = await app.request("/v1/mcp/connectors", {
      headers: { cookie: `oma_session=${adminCookie}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ id: string; connected?: boolean }> };
    const connected = body.data.filter((c) => c.connected === true);
    expect(connected.length).toBe(0);
  });

  it("acme org disconnect removes the token only for acme", async () => {
    // Acme user disconnects slack
    const disconnectRes = await app.request("/v1/mcp/connectors/slack/connect", {
      method: "DELETE",
      headers: { cookie: `oma_session=${acmeUserCookie}` },
    });
    expect(disconnectRes.status).toBe(200);

    // Acme no longer sees slack as connected
    const acmeRes = await app.request("/v1/mcp/connectors/slack", {
      headers: { cookie: `oma_session=${acmeUserCookie}` },
    });
    const acmeBody = await acmeRes.json() as { connected?: boolean };
    expect(acmeBody.connected).toBe(false);

    // org_default still doesn't see it (was never connected for them)
    const adminRes = await app.request("/v1/mcp/connectors/slack", {
      headers: { cookie: `oma_session=${adminCookie}` },
    });
    const adminBody = await adminRes.json() as { connected?: boolean };
    expect(adminBody.connected).toBe(false);
  });
});
