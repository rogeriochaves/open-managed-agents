/**
 * Environment update regression test.
 *
 * EnvironmentUpdateBodySchema declared { name, description, config,
 * metadata }, but the handler used to ignore the metadata field
 * entirely — a classic silent no-op, same class as the pagination
 * and date-range-filter bugs caught in 51465dd and 8382006. The
 * client would POST `{ metadata: { env: "prod" } }`, zod would
 * validate it, the handler would skip the metadata branch, and
 * the row would come back with its original metadata intact.
 *
 * This test locks the metadata patch-merge behavior so a future
 * regression can't silently drop the write again.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-envs-update-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;
let envId: string;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });
  const res = await app.request("/v1/environments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "update-test-env",
      description: "original",
      config: {
        type: "cloud",
        networking: { type: "unrestricted" },
      },
      metadata: { tier: "bronze" },
    }),
  });
  const body = (await res.json()) as { id: string };
  envId = body.id;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Environment update flow", () => {
  it("updates name and description", async () => {
    const res = await app.request(`/v1/environments/${envId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "renamed-env",
        description: "updated",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      description: string;
    };
    expect(body.name).toBe("renamed-env");
    expect(body.description).toBe("updated");
  });

  it("swaps networking config from unrestricted to limited", async () => {
    const res = await app.request(`/v1/environments/${envId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          type: "cloud",
          networking: {
            type: "limited",
            allowed_hosts: ["api.github.com"],
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
        };
      };
    };
    expect(body.config.networking.type).toBe("limited");
    expect(body.config.networking.allowed_hosts).toEqual([
      "api.github.com",
    ]);
  });

  // ── Metadata patch merge regression ──────────────────────────────
  // Silent no-op prior to this commit: handler declared metadata on
  // the schema but never wrote it. These two tests verify that the
  // first patch persists, and that a second patch merges with the
  // first instead of wiping it.

  it("persists a metadata patch", async () => {
    const res = await app.request(`/v1/environments/${envId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { owner: "platform" },
      }),
    });
    expect(res.status).toBe(200);

    const fresh = await app.request(`/v1/environments/${envId}`);
    const body = (await fresh.json()) as {
      metadata: Record<string, string>;
    };
    // The initial metadata was { tier: "bronze" } — the patch adds
    // owner on top of it.
    expect(body.metadata.tier).toBe("bronze");
    expect(body.metadata.owner).toBe("platform");
  });

  it("merges subsequent metadata patches without wiping earlier keys", async () => {
    await app.request(`/v1/environments/${envId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { region: "eu-central-1" },
      }),
    });
    const fresh = await app.request(`/v1/environments/${envId}`);
    const body = (await fresh.json()) as {
      metadata: Record<string, string>;
    };
    expect(body.metadata.tier).toBe("bronze");
    expect(body.metadata.owner).toBe("platform");
    expect(body.metadata.region).toBe("eu-central-1");
  });
});
