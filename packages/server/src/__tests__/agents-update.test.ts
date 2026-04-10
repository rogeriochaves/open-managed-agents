/**
 * Agent update + archive integration test.
 *
 * The base app.test.ts covers create/list/retrieve/validation. This
 * file adds coverage for the mutation paths that mess with versioning
 * and metadata merging — both easy places for subtle bugs.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-agents-update-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;
let agentId: string;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
  const res = await app.request("/v1/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "update-test-agent",
      description: "original description",
      model: "claude-sonnet-4-6",
      system: "original prompt",
      metadata: { env: "dev", owner: "alice" },
    }),
  });
  const body = (await res.json()) as { id: string; version: number };
  expect(body.version).toBe(1);
  agentId = body.id;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Agent update flow", () => {
  it("updates a single field and increments version", async () => {
    const res = await app.request(`/v1/agents/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        description: "updated description",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      description: string;
      version: number;
      name: string;
    };
    expect(body.description).toBe("updated description");
    expect(body.version).toBe(2);
    // Unchanged fields still present
    expect(body.name).toBe("update-test-agent");
  });

  it("leaves other fields untouched on partial update", async () => {
    const before = await app.request(`/v1/agents/${agentId}`);
    const beforeBody = (await before.json()) as {
      name: string;
      system: string;
    };
    expect(beforeBody.system).toBe("original prompt");

    const res = await app.request(`/v1/agents/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 2, name: "renamed-agent" }),
    });
    const body = (await res.json()) as {
      name: string;
      system: string;
      version: number;
    };
    expect(body.name).toBe("renamed-agent");
    expect(body.system).toBe("original prompt");
    expect(body.version).toBe(3);
  });

  it("merges metadata on update rather than replacing", async () => {
    const res = await app.request(`/v1/agents/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 3,
        metadata: { region: "eu-west-1" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      metadata: Record<string, unknown>;
    };
    // Previously-set env and owner keys should still be there
    expect(body.metadata.env).toBe("dev");
    expect(body.metadata.owner).toBe("alice");
    // Newly-set region key should be added
    expect(body.metadata.region).toBe("eu-west-1");
  });

  it("removes metadata keys that are set to null", async () => {
    const res = await app.request(`/v1/agents/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 4,
        metadata: { owner: null },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      metadata: Record<string, unknown>;
    };
    expect("owner" in body.metadata).toBe(false);
    // Other keys unaffected
    expect(body.metadata.env).toBe("dev");
    expect(body.metadata.region).toBe("eu-west-1");
  });

  it("updates tools / mcp_servers / skills arrays", async () => {
    const res = await app.request(`/v1/agents/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 5,
        tools: [
          {
            type: "agent_toolset_20260401",
            default_config: {
              enabled: true,
              permission_policy: { type: "always_allow" },
            },
          },
        ],
        mcp_servers: [
          { type: "url", name: "slack", url: "https://mcp.slack.com/sse" },
        ],
        skills: [{ type: "anthropic", skill_id: "web_search" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tools: unknown[];
      mcp_servers: Array<{ name: string }>;
      skills: Array<{ skill_id: string }>;
    };
    expect(body.tools.length).toBe(1);
    expect(body.mcp_servers[0]?.name).toBe("slack");
    expect(body.skills[0]?.skill_id).toBe("web_search");
  });

  it("returns 404 when updating an unknown agent", async () => {
    const res = await app.request("/v1/agents/agent_does_not_exist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, name: "doesnt-matter" }),
    });
    expect(res.status).toBe(404);
  });

  it("archives an agent and hides it from the default list", async () => {
    const archiveRes = await app.request(
      `/v1/agents/${agentId}/archive`,
      { method: "POST" }
    );
    expect(archiveRes.status).toBe(200);
    const body = (await archiveRes.json()) as {
      archived_at: string | null;
    };
    expect(body.archived_at).toBeTruthy();

    const listRes = await app.request("/v1/agents");
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listBody.data.some((a) => a.id === agentId)).toBe(false);
  });

  it("include_archived=true reveals archived agents", async () => {
    const res = await app.request(
      "/v1/agents?include_archived=true"
    );
    const body = (await res.json()) as {
      data: Array<{ id: string; archived_at: string | null }>;
    };
    const archived = body.data.find((a) => a.id === agentId);
    expect(archived).toBeTruthy();
    expect(archived?.archived_at).toBeTruthy();
  });
});
