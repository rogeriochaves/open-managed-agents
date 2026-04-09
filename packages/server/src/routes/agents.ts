import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  AgentSchema,
  AgentCreateBodySchema,
  AgentUpdateBodySchema,
  AgentListQuerySchema,
  AgentIdParamSchema,
} from "../schemas/agents.js";
import { pageCursorResponse } from "../schemas/common.js";

const tags = ["Agents"];

// ── Route definitions ───────────────────────────────────────────────────────

const createAgentRoute = createRoute({
  method: "post",
  path: "/v1/agents",
  tags,
  summary: "Create an agent",
  request: {
    body: {
      content: { "application/json": { schema: AgentCreateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The created agent",
      content: { "application/json": { schema: AgentSchema } },
    },
  },
});

const retrieveAgentRoute = createRoute({
  method: "get",
  path: "/v1/agents/{agentId}",
  tags,
  summary: "Retrieve an agent",
  request: {
    params: AgentIdParamSchema,
  },
  responses: {
    200: {
      description: "The agent",
      content: { "application/json": { schema: AgentSchema } },
    },
  },
});

const updateAgentRoute = createRoute({
  method: "post",
  path: "/v1/agents/{agentId}",
  tags,
  summary: "Update an agent",
  request: {
    params: AgentIdParamSchema,
    body: {
      content: { "application/json": { schema: AgentUpdateBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated agent",
      content: { "application/json": { schema: AgentSchema } },
    },
  },
});

const listAgentsRoute = createRoute({
  method: "get",
  path: "/v1/agents",
  tags,
  summary: "List agents",
  request: {
    query: AgentListQuerySchema,
  },
  responses: {
    200: {
      description: "A paginated list of agents",
      content: {
        "application/json": { schema: pageCursorResponse(AgentSchema) },
      },
    },
  },
});

const archiveAgentRoute = createRoute({
  method: "post",
  path: "/v1/agents/{agentId}/archive",
  tags,
  summary: "Archive an agent",
  request: {
    params: AgentIdParamSchema,
  },
  responses: {
    200: {
      description: "The archived agent",
      content: { "application/json": { schema: AgentSchema } },
    },
  },
});

// ── Register routes ─────────────────────────────────────────────────────────

export function registerAgentRoutes(app: OpenAPIHono) {
  app.openapi(createAgentRoute, async (c) => {
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.agents.create(body);
    return c.json(result as any, 200);
  });

  app.openapi(retrieveAgentRoute, async (c) => {
    const { agentId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.agents.retrieve(agentId);
    return c.json(result as any, 200);
  });

  app.openapi(updateAgentRoute, async (c) => {
    const { agentId } = c.req.valid("param");
    const body = c.req.valid("json");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.agents.update(agentId, body);
    return c.json(result as any, 200);
  });

  app.openapi(listAgentsRoute, async (c) => {
    const query = c.req.valid("query");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.agents.list(query);
    return c.json(result as any, 200);
  });

  app.openapi(archiveAgentRoute, async (c) => {
    const { agentId } = c.req.valid("param");
    const client = c.get("anthropic" as never) as any;
    const result = await client.beta.agents.archive(agentId);
    return c.json(result as any, 200);
  });
}
