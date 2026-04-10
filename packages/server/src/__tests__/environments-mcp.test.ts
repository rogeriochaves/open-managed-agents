/**
 * Environments CRUD + MCP connector discovery integration test.
 *
 * The environments API is what admins use to define networking,
 * package manager, and resource policies per team. The MCP discovery
 * endpoint is what the quickstart UI uses to browse available
 * connectors (Slack, Notion, GitHub, Linear, Sentry, …).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-envmcp-test-"));
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

describe("Environments API", () => {
  let envId: string;

  it("seeds a default 'env_default' environment on first boot", async () => {
    const res = await app.request("/v1/environments/env_default");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      type: string;
      name: string;
    };
    expect(body.id).toBe("env_default");
    expect(body.type).toBe("environment");
  });

  it("creates a custom environment with an unrestricted networking policy", async () => {
    const res = await app.request("/v1/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "engineering-env",
        description: "Full-internet environment for the engineering team",
        config: {
          type: "cloud",
          networking: { type: "unrestricted" },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      name: string;
      config: { networking: { type: string } };
    };
    expect(body.id).toMatch(/^env_/);
    expect(body.name).toBe("engineering-env");
    expect(body.config.networking.type).toBe("unrestricted");
    envId = body.id;
  });

  it("creates a restricted environment with an allow-list", async () => {
    const res = await app.request("/v1/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "support-env",
        description: "Allow-listed for the support team",
        config: {
          type: "cloud",
          networking: {
            type: "limited",
            allowed_hosts: ["api.intercom.io", "mcp.slack.com"],
            allow_mcp_servers: true,
            allow_package_managers: false,
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      config: {
        networking: {
          type: string;
          allowed_hosts?: string[];
          allow_package_managers?: boolean;
        };
      };
    };
    expect(body.config.networking.type).toBe("limited");
    expect(body.config.networking.allowed_hosts).toEqual([
      "api.intercom.io",
      "mcp.slack.com",
    ]);
    expect(body.config.networking.allow_package_managers).toBe(false);
  });

  it("lists environments including the default and both custom ones", async () => {
    const res = await app.request("/v1/environments");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string }>;
    };
    const ids = body.data.map((e) => e.id);
    expect(ids).toContain("env_default");
    expect(body.data.some((e) => e.name === "engineering-env")).toBe(true);
    expect(body.data.some((e) => e.name === "support-env")).toBe(true);
  });

  it("updates an environment name", async () => {
    const res = await app.request(`/v1/environments/${envId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "engineering-env-v2" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("engineering-env-v2");
  });

  it("archives an environment", async () => {
    const res = await app.request(
      `/v1/environments/${envId}/archive`,
      { method: "POST" }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { archived_at: string | null };
    expect(body.archived_at).toBeTruthy();
  });

  it("excludes archived environments from the default list", async () => {
    const res = await app.request("/v1/environments");
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string }>;
    };
    expect(body.data.some((e) => e.id === envId)).toBe(false);
  });

  it("includes archived environments when include_archived=true", async () => {
    const res = await app.request(
      "/v1/environments?include_archived=true"
    );
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
    };
    expect(body.data.some((e) => e.id === envId)).toBe(true);
  });
});

describe("MCP connector discovery", () => {
  it("lists the built-in connectors", async () => {
    const res = await app.request("/v1/mcp/connectors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        id: string;
        name: string;
        category: string;
        description: string;
      }>;
    };
    expect(body.data.length).toBeGreaterThan(5);
    // Sanity-check a handful of connectors we know should exist
    const ids = body.data.map((c) => c.id);
    expect(ids).toContain("slack");
    expect(ids).toContain("notion");
    expect(ids).toContain("github");
    expect(ids).toContain("linear");
    expect(ids).toContain("sentry");
  });

  it("filters connectors by search term", async () => {
    const res = await app.request("/v1/mcp/connectors?search=slack");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((c) => c.id.includes("slack"))).toBe(true);
  });

  it("filters connectors by category", async () => {
    // First, find a category that actually has connectors
    const allRes = await app.request("/v1/mcp/connectors");
    const all = (await allRes.json()) as {
      data: Array<{ category: string }>;
    };
    const firstCategory = all.data[0]?.category;
    expect(firstCategory).toBeTruthy();

    const res = await app.request(
      `/v1/mcp/connectors?category=${firstCategory}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ category: string }>;
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((c) => c.category === firstCategory)).toBe(true);
  });

  it("retrieves a single connector by id with all required fields", async () => {
    const res = await app.request("/v1/mcp/connectors/slack");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      name: string;
      description: string;
      url: string;
      icon: string;
      category: string;
      auth_type: string;
      connected: boolean;
    };
    expect(body.id).toBe("slack");
    expect(body.name).toBeTruthy();
    expect(body.description).toBeTruthy();
    expect(body.url).toBeTruthy();
    expect(body.icon).toBeTruthy();
    expect(body.category).toBeTruthy();
    expect(["oauth", "token", "none"]).toContain(body.auth_type);
    expect(typeof body.connected).toBe("boolean");
  });

  it("returns 404 for an unknown connector", async () => {
    const res = await app.request(
      "/v1/mcp/connectors/does-not-exist"
    );
    expect(res.status).toBe(404);
  });
});
