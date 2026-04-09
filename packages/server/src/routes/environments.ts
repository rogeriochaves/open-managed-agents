import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  EnvironmentSchema,
  EnvironmentCreateBodySchema,
  EnvironmentUpdateBodySchema,
  EnvironmentListQuerySchema,
  EnvironmentIdParamSchema,
  EnvironmentDeleteResponseSchema,
} from "../schemas/environments.js";
import { pageCursorResponse } from "../schemas/common.js";

const tags = ["Environments"];

// ── Route definitions ───────────────────────────────────────────────────────

const createEnvironmentRoute = createRoute({
  method: "post",
  path: "/v1/environments",
  tags,
  summary: "Create an environment",
  request: {
    body: {
      content: {
        "application/json": { schema: EnvironmentCreateBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "The created environment",
      content: { "application/json": { schema: EnvironmentSchema } },
    },
  },
});

const retrieveEnvironmentRoute = createRoute({
  method: "get",
  path: "/v1/environments/{environmentId}",
  tags,
  summary: "Retrieve an environment",
  request: {
    params: EnvironmentIdParamSchema,
  },
  responses: {
    200: {
      description: "The environment",
      content: { "application/json": { schema: EnvironmentSchema } },
    },
  },
});

const updateEnvironmentRoute = createRoute({
  method: "post",
  path: "/v1/environments/{environmentId}",
  tags,
  summary: "Update an environment",
  request: {
    params: EnvironmentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: EnvironmentUpdateBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "The updated environment",
      content: { "application/json": { schema: EnvironmentSchema } },
    },
  },
});

const listEnvironmentsRoute = createRoute({
  method: "get",
  path: "/v1/environments",
  tags,
  summary: "List environments",
  request: {
    query: EnvironmentListQuerySchema,
  },
  responses: {
    200: {
      description: "A paginated list of environments",
      content: {
        "application/json": {
          schema: pageCursorResponse(EnvironmentSchema),
        },
      },
    },
  },
});

const deleteEnvironmentRoute = createRoute({
  method: "delete",
  path: "/v1/environments/{environmentId}",
  tags,
  summary: "Delete an environment",
  request: {
    params: EnvironmentIdParamSchema,
  },
  responses: {
    200: {
      description: "Confirmation of deletion",
      content: {
        "application/json": { schema: EnvironmentDeleteResponseSchema },
      },
    },
  },
});

const archiveEnvironmentRoute = createRoute({
  method: "post",
  path: "/v1/environments/{environmentId}/archive",
  tags,
  summary: "Archive an environment",
  request: {
    params: EnvironmentIdParamSchema,
  },
  responses: {
    200: {
      description: "The archived environment",
      content: { "application/json": { schema: EnvironmentSchema } },
    },
  },
});

// ── Register routes ─────────────────────────────────────────────────────────

export function registerEnvironmentRoutes(app: OpenAPIHono) {
  app.openapi(createEnvironmentRoute, async (c) => {
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.environments.create(body);
    return c.json(result as any, 200);
  });

  app.openapi(retrieveEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.environments.retrieve(environmentId);
    return c.json(result as any, 200);
  });

  app.openapi(updateEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.environments.update(environmentId, body);
    return c.json(result as any, 200);
  });

  app.openapi(listEnvironmentsRoute, async (c) => {
    const query = c.req.valid("query");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.environments.list(query);
    return c.json(result as any, 200);
  });

  app.openapi(deleteEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.environments.del(environmentId);
    return c.json(result as any, 200);
  });

  app.openapi(archiveEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.environments.archive(environmentId);
    return c.json(result as any, 200);
  });
}
