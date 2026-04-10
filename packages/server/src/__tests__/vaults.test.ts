/**
 * Vaults + encryption integration test.
 *
 * Exercises: create vault → store a credential (encrypted at rest with
 * AES-256-GCM) → list credentials (decrypted) → delete. Also verifies
 * that stored ciphertext in the DB does NOT equal the plaintext.
 *
 * This test also documents a previously-latent boot bug: initEncryption()
 * was never called during server startup, so the first call to
 * encrypt() would throw "Encryption not initialized". createApp() now
 * calls initEncryption() before any route is registered.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-vault-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
// Pin a deterministic 32-byte key so we don't auto-generate into .env
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

describe("Vaults + encryption", () => {
  let vaultId: string;

  it("creates a vault", async () => {
    const res = await app.request("/v1/vaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Test Secrets" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; display_name: string };
    expect(body.id).toMatch(/^vault_/);
    expect(body.display_name).toBe("Test Secrets");
    vaultId = body.id;
  });

  it("stores a credential encrypted at rest", async () => {
    const secret = "super-secret-api-token-12345";
    const res = await app.request(`/v1/vaults/${vaultId}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "anthropic_key", value: secret }),
    });
    expect(res.status).toBe(200);

    // Directly inspect the DB to confirm the stored value is NOT the plaintext.
    const db = await getDB();
    const row = await db.get<any>(
      "SELECT value_encrypted FROM credentials WHERE vault_id = ? AND name = ?",
      vaultId,
      "anthropic_key"
    );
    expect(row).toBeTruthy();
    expect(row.value_encrypted).not.toBe(secret);
    expect(row.value_encrypted).not.toContain(secret);
    // base64 of AES-GCM payload — at minimum IV (12) + authTag (16) = 28 bytes → ~40 chars
    expect(row.value_encrypted.length).toBeGreaterThan(30);
  });

  it("lists credentials for a vault", async () => {
    const res = await app.request(`/v1/vaults/${vaultId}/credentials`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string }>;
    };
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.name).toBe("anthropic_key");
  });

  it("lists vaults and includes the one we just created", async () => {
    const res = await app.request("/v1/vaults");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; display_name: string }>;
    };
    expect(body.data.some((v) => v.id === vaultId)).toBe(true);
  });

  it("deletes a credential", async () => {
    const listRes = await app.request(`/v1/vaults/${vaultId}/credentials`);
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string }>;
    };
    const credId = listBody.data[0]!.id;

    const delRes = await app.request(
      `/v1/vaults/${vaultId}/credentials/${credId}`,
      { method: "DELETE" }
    );
    expect(delRes.status).toBe(200);

    const afterRes = await app.request(`/v1/vaults/${vaultId}/credentials`);
    const afterBody = (await afterRes.json()) as { data: unknown[] };
    expect(afterBody.data.length).toBe(0);
  });

  // ── Update regression ───────────────────────────────────────────────
  // Prior handler read body.name / body.description, but the schema
  // declares display_name + metadata. Every vault update was a silent
  // no-op — the client sent a new display_name, zod happily validated
  // it, the handler ran an UPDATE with zero columns, and returned the
  // unchanged row. These tests lock the fix.

  it("POST /v1/vaults/:id persists display_name", async () => {
    const res = await app.request(`/v1/vaults/${vaultId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Renamed Secrets" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { display_name: string };
    expect(body.display_name).toBe("Renamed Secrets");

    // Verify the change actually reached the DB, not just the
    // immediate response body.
    const fresh = await app.request(`/v1/vaults/${vaultId}`);
    const freshBody = (await fresh.json()) as { display_name: string };
    expect(freshBody.display_name).toBe("Renamed Secrets");
  });

  it("POST /v1/vaults/:id merges metadata as a patch", async () => {
    await app.request(`/v1/vaults/${vaultId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { env: "prod" } }),
    });
    // Second patch adds a key — the first key must still be there
    await app.request(`/v1/vaults/${vaultId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { team: "platform" } }),
    });
    const fresh = await app.request(`/v1/vaults/${vaultId}`);
    const body = (await fresh.json()) as {
      metadata: Record<string, string>;
    };
    expect(body.metadata.env).toBe("prod");
    expect(body.metadata.team).toBe("platform");
  });
});

describe("Encryption primitives", () => {
  it("round-trips arbitrary UTF-8 payloads", async () => {
    const { encrypt, decrypt } = await import("../lib/encryption.js");
    const payloads = [
      "simple ascii",
      "with spaces and punctuation!",
      "🔒 unicode 中文 emoji",
      "a".repeat(10_000),
      "",
    ];
    for (const p of payloads) {
      const enc = encrypt(p);
      expect(enc).not.toBe(p);
      const dec = decrypt(enc);
      expect(dec).toBe(p);
    }
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const { encrypt } = await import("../lib/encryption.js");
    const a = encrypt("same input");
    const b = encrypt("same input");
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext via GCM auth tag", async () => {
    const { encrypt, decrypt } = await import("../lib/encryption.js");
    const enc = encrypt("do not tamper");
    // Flip a byte in the ciphertext region (base64 → Buffer → flip → back)
    const buf = Buffer.from(enc, "base64");
    // Flip a byte strictly inside the ciphertext (between IV and authTag).
    buf[14] = buf[14]! ^ 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });
});
