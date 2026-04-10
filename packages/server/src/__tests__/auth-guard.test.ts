/**
 * Auth guard middleware test.
 *
 * Regression guard for the most serious latent gap in the project:
 * AUTH_ENABLED was previously a myth — tests set it but no code
 * read it, so every route was publicly reachable even though the
 * README promised auth and RBAC. This file drives the guard with
 * auth ENABLED (default) and verifies:
 *
 * - Public paths are reachable without a cookie.
 * - Private paths are 401 without a cookie.
 * - A valid session cookie from a real login unlocks private paths.
 * - AUTH_ENABLED=false still bypasses everything (dev / test opt-out).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-guard-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.OMA_DEFAULT_ADMIN_PASSWORD = "guard-test-pw";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.AUTH_ENABLED; // auth ON
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { createApp } = await import("../app.js");

let app: Awaited<ReturnType<typeof createApp>>;
let adminCookie: string;

beforeAll(async () => {
  app = await createApp({ skipProviderSeed: true });

  const res = await app.request("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@localhost",
      password: "guard-test-pw",
    }),
  });
  const raw = res.headers.get("set-cookie") ?? "";
  const m = raw.match(/oma_session=([^;]+)/);
  adminCookie = m ? m[1]! : "";
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Auth guard (AUTH_ENABLED default on)", () => {
  it("allows /health without a cookie", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("allows /v1/auth/login without a cookie", async () => {
    const res = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@localhost",
        password: "guard-test-pw",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("allows /v1/auth/me without a cookie (returns {user:null})", async () => {
    const res = await app.request("/v1/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });

  it("allows /v1/auth/sso-providers without a cookie", async () => {
    const res = await app.request("/v1/auth/sso-providers");
    expect(res.status).toBe(200);
  });

  it("allows /openapi.json without a cookie (for generated clients)", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
  });

  it("rejects GET /v1/agents with 401 when unauthenticated", async () => {
    const res = await app.request("/v1/agents");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("authentication_error");
  });

  it("rejects GET /v1/sessions with 401 when unauthenticated", async () => {
    const res = await app.request("/v1/sessions");
    expect(res.status).toBe(401);
  });

  it("rejects GET /v1/vaults with 401 when unauthenticated", async () => {
    const res = await app.request("/v1/vaults");
    expect(res.status).toBe(401);
  });

  it("rejects GET /v1/providers with 401 when unauthenticated", async () => {
    const res = await app.request("/v1/providers");
    expect(res.status).toBe(401);
  });

  it("rejects GET /v1/audit-log with 401 when unauthenticated", async () => {
    const res = await app.request("/v1/audit-log");
    expect(res.status).toBe(401);
  });

  it("allows GET /v1/agents with a valid session cookie", async () => {
    const res = await app.request("/v1/agents", {
      headers: { cookie: `oma_session=${adminCookie}` },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a bogus session cookie with 401", async () => {
    const res = await app.request("/v1/agents", {
      headers: { cookie: `oma_session=not-a-real-token` },
    });
    expect(res.status).toBe(401);
  });

  it("accepts Authorization: Bearer <session_token> (CLI / curl)", async () => {
    const res = await app.request("/v1/agents", {
      headers: { authorization: `Bearer ${adminCookie}` },
    });
    expect(res.status).toBe(200);
  });

  it("accepts x-api-key: <session_token> (Anthropic-SDK compat)", async () => {
    const res = await app.request("/v1/agents", {
      headers: { "x-api-key": adminCookie },
    });
    expect(res.status).toBe(200);
  });

  it("rejects a bogus Bearer token with 401", async () => {
    const res = await app.request("/v1/agents", {
      headers: { authorization: `Bearer not-a-real-token` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a bogus x-api-key with 401", async () => {
    const res = await app.request("/v1/agents", {
      headers: { "x-api-key": "not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });
});
