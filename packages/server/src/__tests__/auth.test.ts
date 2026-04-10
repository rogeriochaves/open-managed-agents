/**
 * Auth flow integration test.
 *
 * Uses a fresh temp DB and a distinct admin password so it runs
 * independently of app.test.ts. Drives login → /me → change-password
 * → logout → /me so every auth branch is exercised.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-auth-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.OMA_DEFAULT_ADMIN_PASSWORD = "supersecret";
delete process.env.AUTH_ENABLED; // default on
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

/** Extract the oma_session cookie from a response's Set-Cookie header. */
function extractSessionCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const match = raw.match(/oma_session=([^;]+)/);
  return match ? match[1]! : null;
}

describe("Auth flow", () => {
  it("rejects bad credentials with 401", async () => {
    const res = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@localhost", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown user with 401", async () => {
    const res = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@localhost", password: "supersecret" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns null user from /me without a session cookie", async () => {
    const res = await app.request("/v1/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });

  it("logs in, exposes the user on /me, then logs out", async () => {
    // 1. Login with the correct password
    const loginRes = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@localhost",
        password: "supersecret",
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = (await loginRes.json()) as {
      user: { id: string; email: string; role: string };
    };
    expect(loginBody.user.email).toBe("admin@localhost");
    expect(loginBody.user.role).toBe("admin");

    const cookie = extractSessionCookie(loginRes);
    expect(cookie).toBeTruthy();

    // 2. /me with the cookie returns the user
    const meRes = await app.request("/v1/auth/me", {
      headers: { cookie: `oma_session=${cookie}` },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as {
      user: { email: string } | null;
    };
    expect(meBody.user?.email).toBe("admin@localhost");

    // 3. Logout
    const logoutRes = await app.request("/v1/auth/logout", {
      method: "POST",
      headers: { cookie: `oma_session=${cookie}` },
    });
    expect(logoutRes.status).toBe(200);

    // 4. /me with the now-invalidated session returns null
    const afterRes = await app.request("/v1/auth/me", {
      headers: { cookie: `oma_session=${cookie}` },
    });
    const afterBody = (await afterRes.json()) as { user: unknown };
    expect(afterBody.user).toBeNull();
  });

  it("change-password rotates the credential and invalidates old password", async () => {
    // Login
    const loginRes = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@localhost",
        password: "supersecret",
      }),
    });
    const cookie = extractSessionCookie(loginRes)!;

    // Change password
    const changeRes = await app.request("/v1/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `oma_session=${cookie}`,
      },
      body: JSON.stringify({
        current_password: "supersecret",
        new_password: "newsecret42",
      }),
    });
    expect(changeRes.status).toBe(200);

    // Old password fails
    const oldRes = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@localhost",
        password: "supersecret",
      }),
    });
    expect(oldRes.status).toBe(401);

    // New password works
    const newRes = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@localhost",
        password: "newsecret42",
      }),
    });
    expect(newRes.status).toBe(200);
  });
});
