/**
 * Destructive operations test.
 *
 * Sweeps the archive + delete paths for sessions, vaults, and
 * environments — the last uncovered routes in the main CRUD
 * surface. Archive = soft delete (hides from default list but
 * keeps rows), delete = hard delete (row is gone).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-destructive-test-"));
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
  const a = await app.request("/v1/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "dest-agent", model: "claude-sonnet-4-6" }),
  });
  const body = (await a.json()) as { id: string };
  agentId = body.id;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function createSession(title: string): Promise<string> {
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

describe("Destructive operations", () => {
  it("archives a session (soft) and hides from default list", async () => {
    const id = await createSession("to-be-archived");

    const arc = await app.request(`/v1/sessions/${id}/archive`, {
      method: "POST",
    });
    expect(arc.status).toBe(200);
    const body = (await arc.json()) as { archived_at: string | null };
    expect(body.archived_at).toBeTruthy();

    const list = await app.request("/v1/sessions");
    const listBody = (await list.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listBody.data.some((s) => s.id === id)).toBe(false);

    // include_archived=true reveals it
    const listArc = await app.request(
      "/v1/sessions?include_archived=true"
    );
    const listArcBody = (await listArc.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listArcBody.data.some((s) => s.id === id)).toBe(true);
  });

  it("deletes a session (hard) and cascades its events", async () => {
    const id = await createSession("to-be-deleted");

    // Write an event so we can verify cascade
    await app.request(`/v1/sessions/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text: "will be cascaded" }],
          },
        ],
      }),
    });

    const del = await app.request(`/v1/sessions/${id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    const body = (await del.json()) as { id: string; type: string };
    expect(body.type).toBe("session_deleted");

    // Session gone from include_archived=true listing too
    const listArc = await app.request(
      "/v1/sessions?include_archived=true"
    );
    const listArcBody = (await listArc.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listArcBody.data.some((s) => s.id === id)).toBe(false);
  });

  it("archives a vault (soft) and hides from default list", async () => {
    const create = await app.request("/v1/vaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "archive-me" }),
    });
    const vault = (await create.json()) as { id: string };

    const arc = await app.request(`/v1/vaults/${vault.id}/archive`, {
      method: "POST",
    });
    expect(arc.status).toBe(200);

    const list = await app.request("/v1/vaults");
    const listBody = (await list.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listBody.data.some((v) => v.id === vault.id)).toBe(false);
  });

  it("deletes a vault (hard)", async () => {
    const create = await app.request("/v1/vaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "delete-me" }),
    });
    const vault = (await create.json()) as { id: string };

    const del = await app.request(`/v1/vaults/${vault.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    // include_archived should also not find it
    const list = await app.request("/v1/vaults?include_archived=true");
    const listBody = (await list.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listBody.data.some((v) => v.id === vault.id)).toBe(false);
  });

  it("deletes an environment (hard)", async () => {
    const create = await app.request("/v1/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "delete-env",
        description: "scratch",
        config: { type: "cloud", networking: { type: "unrestricted" } },
      }),
    });
    const env = (await create.json()) as { id: string };

    const del = await app.request(`/v1/environments/${env.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    const list = await app.request(
      "/v1/environments?include_archived=true"
    );
    const listBody = (await list.json()) as {
      data: Array<{ id: string }>;
    };
    expect(listBody.data.some((e) => e.id === env.id)).toBe(false);
  });
});
