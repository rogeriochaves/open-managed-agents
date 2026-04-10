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
import { getDB, newId } from "../db/index.js";
import { auditLog } from "./governance.js";
import { currentUser, currentUserId } from "../lib/current-user.js";
import { canUseProvider, canUseConnector } from "../lib/access-control.js";

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

const stopSessionRoute = createRoute({
  method: "post",
  path: "/v1/sessions/{sessionId}/stop",
  tags,
  summary:
    "Stop a running session — marks it terminated and the engine will bail between iterations",
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: "The stopped session",
      content: { "application/json": { schema: SessionSchema } },
    },
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToSession(row: any): any {
  return {
    id: row.id,
    type: "session",
    title: row.title ?? null,
    agent: JSON.parse(row.agent_snapshot ?? "{}"),
    environment_id: row.environment_id,
    status: row.status,
    resources: JSON.parse(row.resources ?? "[]"),
    usage: JSON.parse(row.usage ?? "{}"),
    stats: JSON.parse(row.stats ?? "{}"),
    metadata: JSON.parse(row.metadata ?? "{}"),
    vault_ids: JSON.parse(row.vault_ids ?? "[]"),
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
  };
}

// ── Register routes ─────────────────────────────────────────────────────────

export function registerSessionRoutes(app: OpenAPIHono) {
  app.openapi(createSessionRoute, async (c) => {
    const body = c.req.valid("json") as any;
    const db = await getDB();
    const id = newId("session");
    const now = new Date().toISOString();

    // Resolve agent
    const agentId = typeof body.agent === "string" ? body.agent : body.agent?.id;
    const agent = await db.get<any>("SELECT * FROM agents WHERE id = ?", agentId);

    if (!agent) {
      throw Object.assign(new Error(`Agent ${agentId} not found`), { status: 404, type: "not_found" });
    }

    // Enforce team_provider_access + team_mcp_policies. Admins and
    // unauthenticated requests (auth disabled) bypass these checks.
    const user = await currentUser(c);
    if (agent.model_provider_id) {
      const allowed = await canUseProvider({
        db,
        userId: user?.id ?? null,
        userRole: user?.role ?? null,
        providerId: agent.model_provider_id,
      });
      if (!allowed) {
        throw Object.assign(
          new Error(`Not authorized to use provider ${agent.model_provider_id}`),
          { status: 403, type: "forbidden" }
        );
      }
    }

    const agentMcps = JSON.parse(agent.mcp_servers ?? "[]") as Array<{
      name?: string;
    }>;
    for (const mcp of agentMcps) {
      if (!mcp?.name) continue;
      const allowed = await canUseConnector({
        db,
        userId: user?.id ?? null,
        userRole: user?.role ?? null,
        connectorId: mcp.name,
      });
      if (!allowed) {
        throw Object.assign(
          new Error(
            `MCP connector "${mcp.name}" is blocked for your team(s)`
          ),
          { status: 403, type: "forbidden" }
        );
      }
    }

    // Build agent snapshot
    const agentSnapshot = {
      id: agent.id,
      type: "agent",
      name: agent.name,
      description: agent.description,
      system: agent.system,
      model: { id: agent.model_id, speed: agent.model_speed ?? "standard" },
      model_provider_id: agent.model_provider_id ?? null,
      tools: JSON.parse(agent.tools ?? "[]"),
      mcp_servers: JSON.parse(agent.mcp_servers ?? "[]"),
      skills: JSON.parse(agent.skills ?? "[]"),
      version: agent.version,
    };

    const environmentId = body.environment_id ?? "env_default";

    await db.run(
      `INSERT INTO sessions (id, title, agent_id, agent_snapshot, environment_id, status, resources, metadata, vault_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?, ?)`,
      id,
      body.title ?? null,
      agentId,
      JSON.stringify(agentSnapshot),
      environmentId,
      JSON.stringify(body.resources ?? []),
      JSON.stringify(body.metadata ?? {}),
      JSON.stringify(body.vault_ids ?? []),
      now,
      now
    );

    const row = await db.get("SELECT * FROM sessions WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "session", id, JSON.stringify({ agent_id: agentId }));
    return c.json(rowToSession(row), 200);
  });

  app.openapi(retrieveSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const db = await getDB();
    const row = await db.get("SELECT * FROM sessions WHERE id = ?", sessionId);

    if (!row) {
      throw Object.assign(new Error(`Session ${sessionId} not found`), { status: 404, type: "not_found" });
    }

    return c.json(rowToSession(row), 200);
  });

  app.openapi(updateSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const db = await getDB();

    const updates: string[] = [];
    const values: any[] = [];

    if (body.title !== undefined) {
      updates.push("title = ?");
      values.push(body.title);
    }
    if (body.metadata !== undefined) {
      updates.push("metadata = ?");
      values.push(JSON.stringify(body.metadata));
    }
    if (body.vault_ids !== undefined) {
      updates.push("vault_ids = ?");
      values.push(JSON.stringify(body.vault_ids));
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(sessionId);
      await db.run(`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`, ...values);
    }

    const row = await db.get("SELECT * FROM sessions WHERE id = ?", sessionId);
    if (!row) {
      throw Object.assign(new Error(`Session ${sessionId} not found`), { status: 404, type: "not_found" });
    }

    return c.json(rowToSession(row), 200);
  });

  app.openapi(listSessionsRoute, async (c) => {
    const query = c.req.valid("query") as any;
    const db = await getDB();

    const conditions: string[] = [];
    const values: any[] = [];

    if (query.agent_id) {
      conditions.push("agent_id = ?");
      values.push(query.agent_id);
    }
    if (!query.include_archived) {
      conditions.push("archived_at IS NULL");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = query.order === "asc" ? "ASC" : "DESC";
    const limit = Math.min(query.limit ?? 20, 100);

    const rows = await db.all<any>(
      `SELECT * FROM sessions ${where} ORDER BY created_at ${order} LIMIT ?`,
      ...values,
      limit + 1
    );

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(rowToSession);

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

  app.openapi(deleteSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const db = await getDB();

    // Delete events first
    await db.run("DELETE FROM events WHERE session_id = ?", sessionId);
    await db.run("DELETE FROM sessions WHERE id = ?", sessionId);

    await auditLog(await currentUserId(c), "delete", "session", sessionId);
    return c.json({ id: sessionId, type: "session_deleted" }, 200);
  });

  app.openapi(archiveSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const db = await getDB();
    const now = new Date().toISOString();

    await db.run(
      "UPDATE sessions SET archived_at = ?, updated_at = ? WHERE id = ?",
      now,
      now,
      sessionId
    );

    const row = await db.get("SELECT * FROM sessions WHERE id = ?", sessionId);
    if (!row) {
      throw Object.assign(new Error(`Session ${sessionId} not found`), { status: 404, type: "not_found" });
    }

    await auditLog(await currentUserId(c), "archive", "session", sessionId);
    return c.json(rowToSession(row), 200);
  });

  app.openapi(stopSessionRoute, async (c) => {
    const { sessionId } = c.req.valid("param");
    const db = await getDB();
    const now = new Date().toISOString();

    // Flip the status to terminated. The engine loop (when it owns
    // this session) checks session.status between iterations and
    // bails if it's no longer "running". The in-flight LLM call
    // for the current iteration cannot be cancelled mid-generation,
    // so the stop takes effect at the next iteration boundary —
    // which in practice is seconds, not minutes.
    await db.run(
      "UPDATE sessions SET status = 'terminated', updated_at = ? WHERE id = ?",
      now,
      sessionId,
    );

    // Persist a terminated event so the transcript reflects that a
    // human clicked Stop (vs the agent naturally going idle).
    await db.run(
      "INSERT INTO events (id, session_id, type, data, processed_at) VALUES (?, ?, ?, ?, ?)",
      newId("evt"),
      sessionId,
      "session.status_terminated",
      JSON.stringify({ reason: "user_requested" }),
      now,
    );

    const row = await db.get("SELECT * FROM sessions WHERE id = ?", sessionId);
    if (!row) {
      throw Object.assign(new Error(`Session ${sessionId} not found`), {
        status: 404,
        type: "not_found",
      });
    }

    await auditLog(await currentUserId(c), "stop", "session", sessionId);
    return c.json(rowToSession(row), 200);
  });
}
