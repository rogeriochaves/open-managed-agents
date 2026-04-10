import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  AgentSchema,
  AgentCreateBodySchema,
  AgentUpdateBodySchema,
  AgentListQuerySchema,
  AgentIdParamSchema,
} from "../schemas/agents.js";
import { pageCursorResponse } from "../schemas/common.js";
import { getDB, newId } from "../db/index.js";
import { auditLog } from "./governance.js";
import { currentUserId } from "../lib/current-user.js";
import { buildAfterIdClause } from "../lib/pagination.js";

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToAgent(row: any): any {
  const model =
    typeof row.model_id === "string"
      ? { id: row.model_id, speed: row.model_speed ?? "standard" }
      : row.model_id;

  return {
    id: row.id,
    type: "agent" as const,
    name: row.name,
    description: row.description ?? null,
    system: row.system ?? null,
    model,
    model_provider_id: row.model_provider_id ?? null,
    tools: JSON.parse(row.tools ?? "[]"),
    mcp_servers: JSON.parse(row.mcp_servers ?? "[]"),
    skills: JSON.parse(row.skills ?? "[]"),
    metadata: JSON.parse(row.metadata ?? "{}"),
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
  };
}

// ── Register routes ─────────────────────────────────────────────────────────

export function registerAgentRoutes(app: OpenAPIHono) {
  app.openapi(createAgentRoute, async (c) => {
    const body = c.req.valid("json") as any;
    const db = await getDB();
    const id = newId("agent");
    const now = new Date().toISOString();

    const modelId =
      typeof body.model === "string" ? body.model : body.model?.id ?? "claude-sonnet-4-6";
    const modelSpeed =
      typeof body.model === "object" ? body.model?.speed ?? "standard" : "standard";
    const modelProviderId = body.model_provider_id ?? null;

    await db.run(
      `INSERT INTO agents (id, name, description, system, model_id, model_speed, model_provider_id, tools, mcp_servers, skills, metadata, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id,
      body.name,
      body.description ?? null,
      body.system ?? null,
      modelId,
      modelSpeed,
      modelProviderId,
      JSON.stringify(body.tools ?? []),
      JSON.stringify(body.mcp_servers ?? []),
      JSON.stringify(body.skills ?? []),
      JSON.stringify(body.metadata ?? {}),
      now,
      now
    );

    const row = await db.get("SELECT * FROM agents WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "agent", id, JSON.stringify({ name: body.name }));
    return c.json(rowToAgent(row), 200);
  });

  app.openapi(retrieveAgentRoute, async (c) => {
    const { agentId } = c.req.valid("param");
    const db = await getDB();
    const row = await db.get("SELECT * FROM agents WHERE id = ?", agentId);

    if (!row) {
      throw Object.assign(new Error(`Agent ${agentId} not found`), { status: 404, type: "not_found" });
    }

    return c.json(rowToAgent(row), 200);
  });

  app.openapi(updateAgentRoute, async (c) => {
    const { agentId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const db = await getDB();

    const existing = await db.get<any>("SELECT * FROM agents WHERE id = ?", agentId);
    if (!existing) {
      throw Object.assign(new Error(`Agent ${agentId} not found`), { status: 404, type: "not_found" });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.system !== undefined) {
      updates.push("system = ?");
      values.push(body.system);
    }
    if (body.model !== undefined) {
      const modelId = typeof body.model === "string" ? body.model : body.model?.id;
      const modelSpeed = typeof body.model === "object" ? body.model?.speed : undefined;
      if (modelId) { updates.push("model_id = ?"); values.push(modelId); }
      if (modelSpeed) { updates.push("model_speed = ?"); values.push(modelSpeed); }
    }
    if (body.tools !== undefined) {
      updates.push("tools = ?");
      values.push(JSON.stringify(body.tools));
    }
    if (body.mcp_servers !== undefined) {
      updates.push("mcp_servers = ?");
      values.push(JSON.stringify(body.mcp_servers));
    }
    if (body.skills !== undefined) {
      updates.push("skills = ?");
      values.push(JSON.stringify(body.skills));
    }
    if (body.metadata !== undefined) {
      const existingMeta = JSON.parse(existing.metadata ?? "{}");
      const merged = { ...existingMeta, ...body.metadata };
      // Remove null values
      for (const [k, v] of Object.entries(merged)) {
        if (v === null) delete merged[k];
      }
      updates.push("metadata = ?");
      values.push(JSON.stringify(merged));
    }

    updates.push("version = version + 1");
    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(agentId);

    await db.run(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`, ...values);

    const row = await db.get("SELECT * FROM agents WHERE id = ?", agentId);
    await auditLog(await currentUserId(c), "update", "agent", agentId);
    return c.json(rowToAgent(row), 200);
  });

  app.openapi(listAgentsRoute, async (c) => {
    const query = c.req.valid("query") as any;
    const db = await getDB();

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (!query.include_archived) {
      conditions.push("archived_at IS NULL");
    }

    // Honor cursor pagination — handlers used to ignore after_id
    // and a user with >20 agents could never page past screen 1.
    const cursor = await buildAfterIdClause(db, "agents", query.after_id);
    if (cursor.where) {
      conditions.push(cursor.where);
      values.push(...cursor.values);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(query.limit ?? 20, 100);

    const rows = await db.all<any>(
      `SELECT * FROM agents ${where} ORDER BY created_at DESC LIMIT ?`,
      ...values,
      limit + 1
    );

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(rowToAgent);

    return c.json(
      {
        data,
        has_more: hasMore,
        first_id: data[0]?.id ?? null,
        last_id: data[data.length - 1]?.id ?? null,
      },
      200
    );
  });

  app.openapi(archiveAgentRoute, async (c) => {
    const { agentId } = c.req.valid("param");
    const db = await getDB();
    const now = new Date().toISOString();

    await db.run(
      "UPDATE agents SET archived_at = ?, updated_at = ? WHERE id = ?",
      now,
      now,
      agentId
    );

    const row = await db.get("SELECT * FROM agents WHERE id = ?", agentId);
    if (!row) {
      throw Object.assign(new Error(`Agent ${agentId} not found`), { status: 404, type: "not_found" });
    }

    await auditLog(await currentUserId(c), "archive", "agent", agentId);
    return c.json(rowToAgent(row), 200);
  });
}
