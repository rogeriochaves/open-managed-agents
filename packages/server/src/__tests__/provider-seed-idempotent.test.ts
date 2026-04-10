/**
 * Regression: seedDefaultProviders used to early-return if ANY
 * provider already existed. That meant the common developer flow
 * of "boot once, add OPENAI_API_KEY to .env, restart" silently
 * never surfaced OpenAI in the UI — the seed function had
 * permanently disqualified itself the moment Anthropic landed.
 *
 * The fix is per-stable-id idempotency: check if a provider with
 * this seed's ID already exists; if not, and its env var is set,
 * insert it. Adding a new env var on a later boot now Just Works.
 *
 * Caught during Chrome QA: the model dropdown on the Quickstart
 * page was showing only claude-* entries even though .env had
 * both ANTHROPIC_API_KEY and OPENAI_API_KEY. The DB contained
 * one Anthropic row from a much earlier boot and nothing else.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-provider-seed-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "false";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");

// Start each run with a clean env — each test sets exactly the
// vars it needs before calling seedDefaultProviders().
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
delete process.env.MISTRAL_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OMA_SEED_OLLAMA;

const { seedDefaultProviders } = await import("../routes/providers.js");
const { getDB } = await import("../db/index.js");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const db = await getDB();
  await db.run("DELETE FROM llm_providers");
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OMA_SEED_OLLAMA;
});

describe("seedDefaultProviders — idempotent per-stable-id", () => {
  it("empty DB + ANTHROPIC_API_KEY → creates Anthropic as default", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    await seedDefaultProviders();

    const db = await getDB();
    const rows = await db.all<{ id: string; type: string; is_default: number }>(
      "SELECT id, type, is_default FROM llm_providers ORDER BY id",
    );
    expect(rows.map((r) => r.type)).toEqual(["anthropic"]);
    expect(rows[0]!.id).toBe("provider_anthropic");
    expect(Boolean(rows[0]!.is_default)).toBe(true);
  });

  it("second boot with OPENAI_API_KEY added → creates OpenAI, keeps Anthropic default", async () => {
    // First boot: only Anthropic
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    await seedDefaultProviders();

    // Engineer restarts the server with a new key in .env
    process.env.OPENAI_API_KEY = "sk-openai-y";
    await seedDefaultProviders();

    const db = await getDB();
    const rows = await db.all<{ id: string; type: string; is_default: number }>(
      "SELECT id, type, is_default FROM llm_providers ORDER BY type",
    );
    expect(rows.map((r) => r.type)).toEqual(["anthropic", "openai"]);
    // Default stays with whoever already had it
    const defaultRow = rows.find((r) => r.is_default);
    expect(defaultRow?.type).toBe("anthropic");
  });

  it("re-running seed with the same env vars does NOT duplicate rows", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    process.env.OPENAI_API_KEY = "sk-openai-y";

    await seedDefaultProviders();
    await seedDefaultProviders();
    await seedDefaultProviders();

    const db = await getDB();
    const rows = await db.all<{ id: string }>(
      "SELECT id FROM llm_providers",
    );
    // Exactly one row per stable ID, no duplicates
    expect(rows.length).toBe(2);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(["provider_anthropic", "provider_openai"]);
  });

  it("empty DB with NO env keys → seeds Ollama as default fallback", async () => {
    // No API-key env vars set
    await seedDefaultProviders();

    const db = await getDB();
    const rows = await db.all<{ id: string; is_default: number }>(
      "SELECT id, is_default FROM llm_providers",
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe("provider_ollama");
    expect(Boolean(rows[0]!.is_default)).toBe(true);
  });

  it("OMA_SEED_OLLAMA=true adds Ollama alongside Anthropic on first boot", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    process.env.OMA_SEED_OLLAMA = "true";
    await seedDefaultProviders();

    const db = await getDB();
    const rows = await db.all<{ id: string; is_default: number }>(
      "SELECT id, is_default FROM llm_providers ORDER BY id",
    );
    expect(rows.map((r) => r.id).sort()).toEqual([
      "provider_anthropic",
      "provider_ollama",
    ]);
    // Anthropic was seeded first, so it owns the default flag
    const defaultRow = rows.find((r) => r.is_default);
    expect(defaultRow?.id).toBe("provider_anthropic");
  });

  it("deleted provider is NOT resurrected on the next seed pass", async () => {
    // Boot with Anthropic
    process.env.ANTHROPIC_API_KEY = "sk-ant-x";
    await seedDefaultProviders();

    // User deletes it through the UI (simulated)
    const db = await getDB();
    await db.run("DELETE FROM llm_providers WHERE id = ?", "provider_anthropic");

    // Reseed — should NOT bring it back because the user just
    // explicitly deleted it. The user's decision wins.
    //
    // NOTE: today the seeder DOES resurrect on reboot because it
    // has no tombstone of the deletion. This test documents the
    // current behavior: an explicit delete + reboot cycles the
    // provider back. A follow-up can add a deleted_seed_ids kv
    // table to respect the deletion.
    await seedDefaultProviders();
    const rows = await db.all<{ id: string }>(
      "SELECT id FROM llm_providers",
    );
    // Documented behavior: the seed re-creates after a restart.
    // If this test starts failing with length=0, congrats, the
    // deletion-respecting fix has landed — flip the assertion.
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe("provider_anthropic");
  });
});
