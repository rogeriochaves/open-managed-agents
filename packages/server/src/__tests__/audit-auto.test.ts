/**
 * Audit log auto-write test.
 *
 * Regression guard for a previously latent issue: auditLog() was
 * declared but never called from any route, so the README's "Full
 * audit logging — track all actions" claim was not backed by code.
 *
 * This test verifies that real mutations via the public HTTP API
 * actually cause audit rows to land in the audit_log table.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-audit-test-"));
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

async function fetchAudit(resource_type?: string) {
  const q = resource_type ? `?resource_type=${resource_type}` : "";
  const res = await app.request(`/v1/audit-log${q}`);
  const body = (await res.json()) as {
    data: Array<{
      action: string;
      resource_type: string;
      resource_id: string | null;
    }>;
  };
  return body.data;
}

describe("Audit log auto-write", () => {
  it("logs an 'agent create' entry", async () => {
    const res = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "audit-test-agent",
        model: "claude-sonnet-4-6",
      }),
    });
    expect(res.status).toBe(200);
    const agent = (await res.json()) as { id: string };

    const entries = await fetchAudit("agent");
    const createEntry = entries.find(
      (e) => e.resource_id === agent.id && e.action === "create"
    );
    expect(createEntry).toBeTruthy();
  });

  it("logs an 'agent update' entry", async () => {
    const createRes = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "audit-update-agent",
        model: "claude-sonnet-4-6",
      }),
    });
    const agent = (await createRes.json()) as {
      id: string;
      version: number;
    };

    const updRes = await app.request(`/v1/agents/${agent.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: agent.version, name: "renamed" }),
    });
    expect(updRes.status).toBe(200);

    const entries = await fetchAudit("agent");
    const updateEntry = entries.find(
      (e) => e.resource_id === agent.id && e.action === "update"
    );
    expect(updateEntry).toBeTruthy();
  });

  it("logs an 'agent archive' entry", async () => {
    const createRes = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "audit-archive-agent",
        model: "claude-sonnet-4-6",
      }),
    });
    const agent = (await createRes.json()) as { id: string };

    const arcRes = await app.request(
      `/v1/agents/${agent.id}/archive`,
      { method: "POST" }
    );
    expect(arcRes.status).toBe(200);

    const entries = await fetchAudit("agent");
    const archiveEntry = entries.find(
      (e) => e.resource_id === agent.id && e.action === "archive"
    );
    expect(archiveEntry).toBeTruthy();
  });

  it("logs a 'credential create' entry (security-critical)", async () => {
    const vaultRes = await app.request("/v1/vaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Audit Vault" }),
    });
    const vault = (await vaultRes.json()) as { id: string };

    const credRes = await app.request(
      `/v1/vaults/${vault.id}/credentials`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "sensitive_token",
          value: "secret-12345",
        }),
      }
    );
    expect(credRes.status).toBe(200);
    const cred = (await credRes.json()) as { id: string };

    const entries = await fetchAudit("credential");
    const createEntry = entries.find(
      (e) => e.resource_id === cred.id && e.action === "create"
    );
    expect(createEntry).toBeTruthy();
  });

  it("returns `details` as a parsed object, not a JSON string", async () => {
    // Trigger an audit row whose details payload is a JSON blob.
    // The create-agent path writes {"name": "..."} into details.
    const res = await app.request("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "audit-details-shape",
        model: "claude-sonnet-4-6",
      }),
    });
    const agent = (await res.json()) as { id: string };

    const auditRes = await app.request("/v1/audit-log?resource_type=agent");
    const body = (await auditRes.json()) as {
      data: Array<{ resource_id: string; details: unknown }>;
    };
    const entry = body.data.find((e) => e.resource_id === agent.id);
    expect(entry).toBeTruthy();
    // Must be a parsed object, not a string.
    expect(typeof entry!.details).toBe("object");
    expect(entry!.details).not.toBeNull();
    expect((entry!.details as Record<string, unknown>).name).toBe(
      "audit-details-shape"
    );
  });

  it("logs a 'credential delete' entry (security-critical)", async () => {
    // Reuse the vault from the previous test; create + delete a cred
    const vaultsRes = await app.request("/v1/vaults");
    const vaults = (await vaultsRes.json()) as {
      data: Array<{ id: string }>;
    };
    const vaultId = vaults.data[0]!.id;

    const credRes = await app.request(
      `/v1/vaults/${vaultId}/credentials`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "to_delete",
          value: "delete-me",
        }),
      }
    );
    const cred = (await credRes.json()) as { id: string };

    const delRes = await app.request(
      `/v1/vaults/${vaultId}/credentials/${cred.id}`,
      { method: "DELETE" }
    );
    expect(delRes.status).toBe(200);

    const entries = await fetchAudit("credential");
    const deleteEntry = entries.find(
      (e) => e.resource_id === cred.id && e.action === "delete"
    );
    expect(deleteEntry).toBeTruthy();
  });
});
