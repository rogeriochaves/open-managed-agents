import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  SessionSchema,
  SessionCreateBodySchema,
  SessionUpdateBodySchema,
  SessionListQuerySchema,
  SessionIdParamSchema,
  DeletedSessionSchema,
} from "../schemas/sessions.js";
import { pageCursorResponse } from "../schemas/common.js";

const tags = ["Sessions"];

// ── Route definitions ───────────────────────────────────────────────────────

const createSessionRoute = createRoute({
  method: "post",
  path: "/v1/sessions",
  tags,
  summary: "Create a session",
  request: {
    body: {
      content: { "application/json": { schema: SessionCreateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The created session",
      content: { "application/json": { schema: SessionSchema } },
    },
  },
});

const retrieveSessionRoute = createRoute({
  method: "get",
  path: "/v1/sessions/{sessionId}",
  tags,
  summary: "Retrieve a session",
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "The session",
      content: { "application/json": { schema: SessionSchema } },
    },
  },
});

const updateSessionRoute = createRoute({
  method: "post",
  path: "/v1/sessions/{sessionId}",
  tags,
  summary: "Update a session",
  request: {
    params: SessionIdParamSchema,
    body: {
      content: { "application/json": { schema: SessionUpdateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated session",
      content: { "application/json": { schema: SessionSchema } },
    },
  },
});

const listSessionsRoute = createRoute({
  method: "get",
  path: "/v1/sessions",
  tags,
  summary: "List sessions",
  request: {
    query: SessionListQuerySchema,
  },
  responses: {
    200: {
      description: "A paginated list of sessions",
      content: {
        "application/json": { schema: pageCursorResponse(SessionSchema) },
      },
    },
  },
});

const deleteSessionRoute = createRoute({
  method: "delete",
  path: "/v1/sessions/{sessionId}",
  tags,
  summary: "Delete a session",
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "Confirmation of deletion",
      content: {
        "application/json": { schema: DeletedSessionSchema },
      },
    },
  },
});

const archiveSessionRoute = createRoute({
  method: "post",
  path: "/v1/sessions/{sessionId}/archive",
  tags,
  summary: "Archive a session",
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "The archived session",
      content: { "application/json": { schema: SessionSchema } },
    },
  },
});

// ── Register routes ─────────────────────────────────────────────────────────

export function registerSessionRoutes(app: OpenAPIHono) {
  app.openapi(createSessionRoute, async (c) => {
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.create(body);
    return c.json(result as any, 200);
  });

  app.openapi(retrieveSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.retrieve(sessionId);
    return c.json(result as any, 200);
  });

  app.openapi(updateSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.update(sessionId, body);
    return c.json(result as any, 200);
  });

  app.openapi(listSessionsRoute, async (c) => {
    const query = c.req.valid("query");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.list(query);
    return c.json(result as any, 200);
  });

  app.openapi(deleteSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.del(sessionId);
    return c.json(result as any, 200);
  });

  app.openapi(archiveSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.sessions.archive(sessionId);
    return c.json(result as any, 200);
  });
}
