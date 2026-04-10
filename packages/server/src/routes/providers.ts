import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDB, newId } from "../db/index.js";
import { createProvider, clearProviderCache } from "../providers/index.js";
import type { ProviderConfig } from "../providers/index.js";
import { auditLog } from "./governance.js";
import { currentUserId } from "../lib/current-user.js";

const tags = ["Providers"];

// ── Schemas ────────────────────────────────────────────────────────────────

const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["anthropic", "openai", "openai-compatible", "ollama"]),
  base_url: z.string().nullable(),
  default_model: z.string().nullable(),
  is_default: z.boolean(),
  has_api_key: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ProviderCreateBodySchema = z.object({
  name: z.string(),
  type: z.enum(["anthropic", "openai", "openai-compatible", "ollama"]),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  default_model: z.string().optional(),
  is_default: z.boolean().optional(),
});

const ProviderModelsSchema = z.object({
  models: z.array(z.string()),
});

// ── Routes ─────────────────────────────────────────────────────────────────

const listProvidersRoute = createRoute({
  method: "get",
  path: "/v1/providers",
  tags,
  summary: "List LLM providers",
  responses: {
    200: {
      description: "List of configured providers",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(ProviderSchema) }),
        },
      },
    },
  },
});

const createProviderRoute = createRoute({
  method: "post",
  path: "/v1/providers",
  tags,
  summary: "Add an LLM provider",
  request: {
    body: {
      content: { "application/json": { schema: ProviderCreateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The created provider",
      content: { "application/json": { schema: ProviderSchema } },
    },
  },
});

const deleteProviderRoute = createRoute({
  method: "delete",
  path: "/v1/providers/{providerId}",
  tags,
  summary: "Delete an LLM provider",
  request: {
    params: z.object({ providerId: z.string() }),
  },
  responses: {
    200: {
      description: "Confirmation",
      content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } },
    },
  },
});

const listModelsRoute = createRoute({
  method: "get",
  path: "/v1/providers/{providerId}/models",
  tags,
  summary: "List available models for a provider",
  request: {
    params: z.object({ providerId: z.string() }),
  },
  responses: {
    200: {
      description: "Available models",
      content: { "application/json": { schema: ProviderModelsSchema } },
    },
  },
});

// ── Helper ─────────────────────────────────────────────────────────────────

function rowToProvider(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    base_url: row.base_url ?? null,
    default_model: row.default_model ?? null,
    is_default: !!row.is_default,
    has_api_key: !!row.api_key_encrypted,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Seed default providers from environment variables if none exist.
 */
export async function seedDefaultProviders() {
  const db = await getDB();
  const countRow = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM llm_providers");
  if ((countRow?.c ?? 0) > 0) return;

  if (process.env.ANTHROPIC_API_KEY) {
    await db.run(
      "INSERT INTO llm_providers (id, name, type, api_key_encrypted, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?)",
      "provider_anthropic", "Anthropic", "anthropic", process.env.ANTHROPIC_API_KEY, "claude-sonnet-4-6", 1
    );
  }

  if (process.env.OPENAI_API_KEY) {
    await db.run(
      "INSERT INTO llm_providers (id, name, type, api_key_encrypted, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?)",
      "provider_openai", "OpenAI", "openai", process.env.OPENAI_API_KEY, "gpt-4o", process.env.ANTHROPIC_API_KEY ? 0 : 1
    );
  }
}

/**
 * Get the provider config for a given provider ID, or the default provider.
 */
export async function getProviderConfig(providerId?: string | null): Promise<ProviderConfig | null> {
  const db = await getDB();
  let row: any;

  if (providerId) {
    row = await db.get("SELECT * FROM llm_providers WHERE id = ?", providerId);
  } else {
    row = await db.get("SELECT * FROM llm_providers WHERE is_default = 1");
    if (!row) {
      row = await db.get("SELECT * FROM llm_providers LIMIT 1");
    }
  }

  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    apiKey: row.api_key_encrypted ?? undefined,
    baseUrl: row.base_url ?? undefined,
    defaultModel: row.default_model ?? undefined,
    isDefault: !!row.is_default,
  };
}

// ── Register ───────────────────────────────────────────────────────────────

export function registerProviderRoutes(app: OpenAPIHono) {
  app.openapi(listProvidersRoute, async (c) => {
    const db = await getDB();
    const rows = await db.all<any>("SELECT * FROM llm_providers ORDER BY is_default DESC, name");
    return c.json({ data: rows.map(rowToProvider) }, 200);
  });

  app.openapi(createProviderRoute, async (c) => {
    const body = c.req.valid("json");
    const db = await getDB();
    const id = newId("provider");

    // If setting as default, unset others
    if (body.is_default) {
      await db.run("UPDATE llm_providers SET is_default = 0");
    }

    await db.run(
      "INSERT INTO llm_providers (id, name, type, api_key_encrypted, base_url, default_model, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, body.name, body.type, body.api_key ?? null, body.base_url ?? null, body.default_model ?? null, body.is_default ? 1 : 0
    );

    clearProviderCache();

    const row = await db.get("SELECT * FROM llm_providers WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "provider", id, JSON.stringify({ name: body.name, type: body.type }));
    return c.json(rowToProvider(row), 200);
  });

  app.openapi(deleteProviderRoute, async (c) => {
    const { providerId } = c.req.valid("param");
    const db = await getDB();
    await db.run("DELETE FROM llm_providers WHERE id = ?", providerId);
    clearProviderCache();
    await auditLog(await currentUserId(c), "delete", "provider", providerId);
    return c.json({ deleted: true }, 200);
  });

  app.openapi(listModelsRoute, async (c) => {
    const { providerId } = c.req.valid("param");
    const config = await getProviderConfig(providerId);
    if (!config) {
      return c.json({ models: [] }, 200);
    }

    try {
      const provider = createProvider(config);
      const models = await provider.listModels();
      return c.json({ models }, 200);
    } catch {
      return c.json({ models: [] }, 200);
    }
  });
}
