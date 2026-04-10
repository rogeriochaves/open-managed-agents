/**
 * Team-scoped provider access enforcement test.
 *
 * Regression guard for a previously latent gap: team_provider_access
 * rows were written and read via the governance APIs but never
 * consulted at runtime. This test drives the full flow with auth
 * ENABLED:
 *
 *   1. An admin creates a non-admin user, a team, an agent that
 *      targets provider_restricted, and a team_provider_access row
 *      granting that team access.
 *   2. The non-admin user tries to create a session against that
 *      agent without being a member of the team → 403.
 *   3. The admin adds the user to the team → the non-admin user
 *      can now create the session successfully.
 *
 * Admins bypass the check entirely (no way to lock yourself out).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-provider-access-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.OMA_DEFAULT_ADMIN_PASSWORD = "admin-test-pw";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.AUTH_ENABLED;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");
const { getDB } = await import("../db/index.js");
const { hashPassword } = await import("../lib/auth-session.js");

let app: Awaited<ReturnType<typeof createApp>>;
let adminCookie: string;
let regularUserCookie: string;
let agentId: string;
let teamId: string;
let regularUserId: string;

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

  // Seed a "restricted" provider that the team will have access to
  await db.run(
    "INSERT INTO llm_providers (id, name, type, api_key_encrypted, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?)",
    "provider_restricted",
    "Restricted",
    "anthropic",
    "sk-test",
    "claude-sonnet-4-6",
    1
  );

  // Seed a regular (non-admin) user
  regularUserId = "user_regular";
  const hash = await hashPassword("regular-pw");
  await db.run(
    "INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)",
    regularUserId,
    "regular@localhost",
    "Regular User",
    "member",
    hash
  );

  // Admin logs in (this auto-writes audit rows etc.)
  adminCookie = await login("admin@localhost", "admin-test-pw");

  // Admin creates a team and a team_provider_access row
  const teamRes = await app.request("/v1/organizations/org_default/teams", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `oma_session=${adminCookie}`,
    },
    body: JSON.stringify({ name: "Engineering", slug: "eng" }),
  });
  const team = (await teamRes.json()) as { id: string };
  teamId = team.id;

  await app.request(`/v1/teams/${teamId}/provider-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `oma_session=${adminCookie}`,
    },
    body: JSON.stringify({
      provider_id: "provider_restricted",
      enabled: true,
    }),
  });

  // Admin creates an agent pinned to the restricted provider
  const agentRes = await app.request("/v1/agents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `oma_session=${adminCookie}`,
    },
    body: JSON.stringify({
      name: "restricted-agent",
      model: "claude-sonnet-4-6",
      model_provider_id: "provider_restricted",
    }),
  });
  const agent = (await agentRes.json()) as { id: string };
  agentId = agent.id;

  regularUserCookie = await login("regular@localhost", "regular-pw");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Team-scoped provider access enforcement", () => {
  it("denies a non-member user with 403", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${regularUserCookie}`,
      },
      body: JSON.stringify({
        agent: agentId,
        environment_id: "env_default",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("allows the same user once added to the team", async () => {
    // Admin adds the regular user to the team
    const addRes = await app.request(`/v1/teams/${teamId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${adminCookie}`,
      },
      body: JSON.stringify({ user_id: regularUserId, role: "member" }),
    });
    expect(addRes.status).toBe(200);

    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${regularUserCookie}`,
      },
      body: JSON.stringify({
        agent: agentId,
        environment_id: "env_default",
        title: "Allowed now",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("admins can always create sessions (no lockout)", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${adminCookie}`,
      },
      body: JSON.stringify({
        agent: agentId,
        environment_id: "env_default",
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe("Team-scoped MCP connector enforcement", () => {
  let mcpAgentId: string;

  beforeAll(async () => {
    // Create a second agent that attaches a slack MCP connector
    const agentRes = await app.request("/v1/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${adminCookie}`,
      },
      body: JSON.stringify({
        name: "slack-agent",
        model: "claude-sonnet-4-6",
        model_provider_id: "provider_restricted",
        mcp_servers: [
          { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
        ],
      }),
    });
    const agent = (await agentRes.json()) as { id: string };
    mcpAgentId = agent.id;
  });

  it("allows by default when no policy row exists", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${regularUserCookie}`,
      },
      body: JSON.stringify({
        agent: mcpAgentId,
        environment_id: "env_default",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("denies with 403 once the team blocks the connector", async () => {
    // Admin blocks slack for the Engineering team
    const policyRes = await app.request(
      `/v1/teams/${teamId}/mcp-policies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `oma_session=${adminCookie}`,
        },
        body: JSON.stringify({ connector_id: "slack", policy: "blocked" }),
      }
    );
    expect(policyRes.status).toBe(200);

    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${regularUserCookie}`,
      },
      body: JSON.stringify({
        agent: mcpAgentId,
        environment_id: "env_default",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("also denies when the policy is 'requires_approval' (no approval flow yet)", async () => {
    await app.request(`/v1/teams/${teamId}/mcp-policies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${adminCookie}`,
      },
      body: JSON.stringify({
        connector_id: "slack",
        policy: "requires_approval",
      }),
    });

    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${regularUserCookie}`,
      },
      body: JSON.stringify({
        agent: mcpAgentId,
        environment_id: "env_default",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("re-allows once the team explicitly grants the connector", async () => {
    await app.request(`/v1/teams/${teamId}/mcp-policies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${adminCookie}`,
      },
      body: JSON.stringify({ connector_id: "slack", policy: "allowed" }),
    });

    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${regularUserCookie}`,
      },
      body: JSON.stringify({
        agent: mcpAgentId,
        environment_id: "env_default",
      }),
    });
    expect(res.status).toBe(200);
  });
});
