import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  VaultSchema,
  VaultCreateBodySchema,
  VaultUpdateBodySchema,
  VaultListQuerySchema,
  VaultIdParamSchema,
  DeletedVaultSchema,
} from "../schemas/vaults.js";
import { pageCursorResponse } from "../schemas/common.js";

const tags = ["Vaults"];

// ── Route definitions ───────────────────────────────────────────────────────

const createVaultRoute = createRoute({
  method: "post",
  path: "/v1/vaults",
  tags,
  summary: "Create a vault",
  request: {
    body: {
      content: { "application/json": { schema: VaultCreateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The created vault",
      content: { "application/json": { schema: VaultSchema } },
    },
  },
});

const retrieveVaultRoute = createRoute({
  method: "get",
  path: "/v1/vaults/{vaultId}",
  tags,
  summary: "Retrieve a vault",
  request: {
    params: VaultIdParamSchema,
  },
  responses: {
    200: {
      description: "The vault",
      content: { "application/json": { schema: VaultSchema } },
    },
  },
});

const updateVaultRoute = createRoute({
  method: "post",
  path: "/v1/vaults/{vaultId}",
  tags,
  summary: "Update a vault",
  request: {
    params: VaultIdParamSchema,
    body: {
      content: { "application/json": { schema: VaultUpdateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated vault",
      content: { "application/json": { schema: VaultSchema } },
    },
  },
});

const listVaultsRoute = createRoute({
  method: "get",
  path: "/v1/vaults",
  tags,
  summary: "List vaults",
  request: {
    query: VaultListQuerySchema,
  },
  responses: {
    200: {
      description: "A paginated list of vaults",
      content: {
        "application/json": { schema: pageCursorResponse(VaultSchema) },
      },
    },
  },
});

const deleteVaultRoute = createRoute({
  method: "delete",
  path: "/v1/vaults/{vaultId}",
  tags,
  summary: "Delete a vault",
  request: {
    params: VaultIdParamSchema,
  },
  responses: {
    200: {
      description: "Confirmation of deletion",
      content: {
        "application/json": { schema: DeletedVaultSchema },
      },
    },
  },
});

const archiveVaultRoute = createRoute({
  method: "post",
  path: "/v1/vaults/{vaultId}/archive",
  tags,
  summary: "Archive a vault",
  request: {
    params: VaultIdParamSchema,
  },
  responses: {
    200: {
      description: "The archived vault",
      content: { "application/json": { schema: VaultSchema } },
    },
  },
});

// ── Register routes ─────────────────────────────────────────────────────────

export function registerVaultRoutes(app: OpenAPIHono) {
  app.openapi(createVaultRoute, async (c) => {
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.vaults.create(body);
    return c.json(result as any, 200);
  });

  app.openapi(retrieveVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.vaults.retrieve(vaultId);
    return c.json(result as any, 200);
  });

  app.openapi(updateVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.vaults.update(vaultId, body);
    return c.json(result as any, 200);
  });

  app.openapi(listVaultsRoute, async (c) => {
    const query = c.req.valid("query");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.vaults.list(query);
    return c.json(result as any, 200);
  });

  app.openapi(deleteVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.vaults.del(vaultId);
    return c.json(result as any, 200);
  });

  app.openapi(archiveVaultRoute, async (c) => {
    const { vaultId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.vaults.archive(vaultId);
    return c.json(result as any, 200);
  });
}
