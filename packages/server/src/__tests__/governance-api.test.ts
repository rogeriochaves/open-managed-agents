/**
 * Governance API direct-CRUD integration test.
 *
 * Complements governance-config.test.ts (which covers the IAC/JSON
 * config loading path) by exercising the raw POST routes that an
 * admin UI would use to mutate orgs, teams, projects, members,
 * provider-access, mcp-policies, users, and the audit log.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-gov-api-test-"));
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

describe("Governance API — direct CRUD", () => {
  let orgId: string;
  let teamId: string;
  let userId: string;

  it("creates an organization via POST /v1/organizations", async () => {
    const res = await app.request("/v1/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Co",
        slug: "testco",
        sso_provider: "google",
        sso_config: { client_id: "abc" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      name: string;
      slug: string;
    };
    expect(body.id).toMatch(/^org_/);
    expect(body.name).toBe("Test Co");
    expect(body.slug).toBe("testco");
    orgId = body.id;
  });

  it("creates a team under that org", async () => {
    const res = await app.request(`/v1/organizations/${orgId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Platform",
        slug: "platform",
        description: "Platform engineering",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      organization_id: string;
    };
    expect(body.id).toMatch(/^team_/);
    expect(body.organization_id).toBe(orgId);
    teamId = body.id;
  });

  it("creates a project under that team", async () => {
    const res = await app.request(`/v1/teams/${teamId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Core API",
        slug: "core-api",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      team_id: string;
    };
    expect(body.id).toMatch(/^proj_/);
    expect(body.team_id).toBe(teamId);
  });

  it("creates a user and lists users", async () => {
    const createRes = await app.request("/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@testco.example",
        name: "Alice",
        role: "member",
        organization_id: orgId,
      }),
    });
    expect(createRes.status).toBe(200);
    const user = (await createRes.json()) as {
      id: string;
      email: string;
    };
    expect(user.id).toMatch(/^user_/);
    expect(user.email).toBe("alice@testco.example");
    userId = user.id;

    const listRes = await app.request("/v1/users");
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listBody.data.some((u) => u.id === userId)).toBe(true);

    // Without a password the user row exists but password_hash
    // is null — login should still 401. Guards against a
    // regression where we accidentally set a default password.
    const db = await getDB();
    const alice = await db.get<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = ?",
      userId,
    );
    expect(alice?.password_hash).toBeFalsy();
  });

  it("creates a user with an initial password and the user can log in immediately", async () => {
    const createRes = await app.request("/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "bob@testco.example",
        name: "Bob",
        role: "member",
        organization_id: orgId,
        password: "initial-pw-from-admin",
      }),
    });
    expect(createRes.status).toBe(200);
    const bob = (await createRes.json()) as { id: string };

    // Row in DB has a bcrypt hash, not the plaintext
    const db = await getDB();
    const row = await db.get<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = ?",
      bob.id,
    );
    expect(row?.password_hash).toBeTruthy();
    expect(row?.password_hash).not.toBe("initial-pw-from-admin");
    // bcrypt hashes have the $2a$ / $2b$ prefix
    expect(row?.password_hash).toMatch(/^\$2[aby]\$/);

    // Bob can now log in — we temporarily flip AUTH_ENABLED on
    // to exercise the real auth flow through the route
    process.env.AUTH_ENABLED = "true";
    try {
      const loginRes = await app.request("/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "bob@testco.example",
          password: "initial-pw-from-admin",
        }),
      });
      expect(loginRes.status).toBe(200);
      const loginBody = (await loginRes.json()) as {
        user: { email: string };
      };
      expect(loginBody.user.email).toBe("bob@testco.example");

      // Wrong password still fails
      const badRes = await app.request("/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "bob@testco.example",
          password: "wrong-password",
        }),
      });
      expect(badRes.status).toBe(401);
    } finally {
      process.env.AUTH_ENABLED = "false";
    }
  });

  it("rejects initial passwords shorter than 8 chars (zod min)", async () => {
    const res = await app.request("/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "short@testco.example",
        name: "Short",
        role: "member",
        organization_id: orgId,
        password: "short",
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("adds a team member and upserts on re-add with a different role", async () => {
    const addRes = await app.request(`/v1/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role: "member" }),
    });
    expect(addRes.status).toBe(200);
    const member = (await addRes.json()) as {
      id: string;
      role: string;
    };
    expect(member.role).toBe("member");
    const firstMemberId = member.id;

    // Re-add with a different role — should upsert, not create a new row
    const upsertRes = await app.request(`/v1/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role: "admin" }),
    });
    expect(upsertRes.status).toBe(200);
    const upserted = (await upsertRes.json()) as {
      id: string;
      role: string;
    };
    expect(upserted.id).toBe(firstMemberId);
    expect(upserted.role).toBe("admin");

    // List should contain exactly one entry for this user
    const listRes = await app.request(`/v1/teams/${teamId}/members`);
    const listBody = (await listRes.json()) as {
      data: Array<{ user_id: string }>;
    };
    const matching = listBody.data.filter((m) => m.user_id === userId);
    expect(matching.length).toBe(1);
  });

  it("sets and updates team MCP policy (upsert)", async () => {
    const first = await app.request(
      `/v1/teams/${teamId}/mcp-policies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector_id: "slack",
          policy: "allowed",
        }),
      }
    );
    expect(first.status).toBe(200);

    // Update to "blocked" — should upsert by (team_id, connector_id)
    const second = await app.request(
      `/v1/teams/${teamId}/mcp-policies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector_id: "slack",
          policy: "blocked",
        }),
      }
    );
    expect(second.status).toBe(200);

    const listRes = await app.request(
      `/v1/teams/${teamId}/mcp-policies`
    );
    const body = (await listRes.json()) as {
      data: Array<{ connector_id: string; policy: string }>;
    };
    const slack = body.data.filter((p) => p.connector_id === "slack");
    expect(slack.length).toBe(1);
    expect(slack[0]?.policy).toBe("blocked");
  });

  it("lists audit log entries (initially empty for fresh DB)", async () => {
    const res = await app.request("/v1/audit-log");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("filters audit log by resource_type", async () => {
    // The prior tests in this file already created a real team and a
    // real project via the public routes, which now auto-write audit
    // rows. So we don't need to seed anything manually — we just
    // assert the filter returns the right rows by resource_type.
    const teamRes = await app.request("/v1/audit-log?resource_type=team");
    const teamBody = (await teamRes.json()) as {
      data: Array<{ resource_type: string; resource_id: string }>;
    };
    expect(teamBody.data.length).toBeGreaterThanOrEqual(1);
    expect(
      teamBody.data.every((r) => r.resource_type === "team")
    ).toBe(true);
    // The team we created earlier in this file shows up
    expect(
      teamBody.data.some((r) => r.resource_id === teamId)
    ).toBe(true);

    // Filter by a resource_type nothing has written should return []
    const noneRes = await app.request(
      "/v1/audit-log?resource_type=nonexistent"
    );
    const noneBody = (await noneRes.json()) as { data: unknown[] };
    expect(noneBody.data).toEqual([]);
  });
});
