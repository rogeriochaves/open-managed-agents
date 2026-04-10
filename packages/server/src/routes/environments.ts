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
import { getDB, newId } from "../db/index.js";
import { auditLog } from "./governance.js";
import { currentUserId } from "../lib/current-user.js";
import { buildAfterIdClause } from "../lib/pagination.js";

const tags = ["Environments"];

const createEnvironmentRoute = createRoute({
  method: "post", path: "/v1/environments", tags, summary: "Create an environment",
  request: { body: { content: { "application/json": { schema: EnvironmentCreateBodySchema } } } },
  responses: { 200: { description: "The created environment", content: { "application/json": { schema: EnvironmentSchema } } } },
});
const retrieveEnvironmentRoute = createRoute({
  method: "get", path: "/v1/environments/{environmentId}", tags, summary: "Retrieve an environment",
  request: { params: EnvironmentIdParamSchema },
  responses: { 200: { description: "The environment", content: { "application/json": { schema: EnvironmentSchema } } } },
});
const updateEnvironmentRoute = createRoute({
  method: "post", path: "/v1/environments/{environmentId}", tags, summary: "Update an environment",
  request: { params: EnvironmentIdParamSchema, body: { content: { "application/json": { schema: EnvironmentUpdateBodySchema } } } },
  responses: { 200: { description: "The updated environment", content: { "application/json": { schema: EnvironmentSchema } } } },
});
const listEnvironmentsRoute = createRoute({
  method: "get", path: "/v1/environments", tags, summary: "List environments",
  request: { query: EnvironmentListQuerySchema },
  responses: { 200: { description: "A paginated list of environments", content: { "application/json": { schema: pageCursorResponse(EnvironmentSchema) } } } },
});
const deleteEnvironmentRoute = createRoute({
  method: "delete", path: "/v1/environments/{environmentId}", tags, summary: "Delete an environment",
  request: { params: EnvironmentIdParamSchema },
  responses: { 200: { description: "Confirmation", content: { "application/json": { schema: EnvironmentDeleteResponseSchema } } } },
});
const archiveEnvironmentRoute = createRoute({
  method: "post", path: "/v1/environments/{environmentId}/archive", tags, summary: "Archive an environment",
  request: { params: EnvironmentIdParamSchema },
  responses: { 200: { description: "The archived environment", content: { "application/json": { schema: EnvironmentSchema } } } },
});

function rowToEnvironment(row: any): any {
  const networking = JSON.parse(row.networking ?? '{"type":"unrestricted"}');
  const packages = JSON.parse(row.packages ?? '{}');

  return {
    id: row.id,
    type: "environment",
    name: row.name,
    description: row.description ?? "",
    config: {
      type: "cloud",
      networking,
      packages: {
        apt: packages.apt ?? [],
        cargo: packages.cargo ?? [],
        gem: packages.gem ?? [],
        go: packages.go ?? [],
        npm: packages.npm ?? [],
        pip: packages.pip ?? [],
      },
    },
    metadata: JSON.parse(row.metadata ?? "{}"),
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
  };
}

export function registerEnvironmentRoutes(app: OpenAPIHono) {
  app.openapi(createEnvironmentRoute, async (c) => {
    const body = c.req.valid("json") as any;
    const db = await getDB();
    const id = newId("env");
    const now = new Date().toISOString();

    const networking = body.config?.networking ?? { type: "unrestricted" };
    const packages = body.config?.packages ?? {};

    await db.run(
      `INSERT INTO environments (id, name, description, networking, packages, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, body.name, body.description ?? "",
      JSON.stringify(networking), JSON.stringify(packages),
      JSON.stringify(body.metadata ?? {}), now, now
    );

    const row = await db.get("SELECT * FROM environments WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "environment", id, JSON.stringify({ name: body.name }));
    return c.json(rowToEnvironment(row), 200);
  });

  app.openapi(retrieveEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const db = await getDB();
    const row = await db.get("SELECT * FROM environments WHERE id = ?", environmentId);
    if (!row) throw Object.assign(new Error(`Environment ${environmentId} not found`), { status: 404, type: "not_found" });
    return c.json(rowToEnvironment(row), 200);
  });

  app.openapi(updateEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const db = await getDB();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) { updates.push("name = ?"); values.push(body.name); }
    if (body.description !== undefined) { updates.push("description = ?"); values.push(body.description); }
    if (body.config?.networking !== undefined) { updates.push("networking = ?"); values.push(JSON.stringify(body.config.networking)); }
    if (body.config?.packages !== undefined) { updates.push("packages = ?"); values.push(JSON.stringify(body.config.packages)); }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(environmentId);
      await db.run(`UPDATE environments SET ${updates.join(", ")} WHERE id = ?`, ...values);
    }

    const row = await db.get("SELECT * FROM environments WHERE id = ?", environmentId);
    if (!row) throw Object.assign(new Error(`Environment ${environmentId} not found`), { status: 404, type: "not_found" });
    return c.json(rowToEnvironment(row), 200);
  });

  app.openapi(listEnvironmentsRoute, async (c) => {
    const query = c.req.valid("query") as any;
    const db = await getDB();
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (!query.include_archived) conditions.push("archived_at IS NULL");

    // Cursor pagination — previously ignored so page 2 returned page 1.
    const cursor = await buildAfterIdClause(db, "environments", query.after_id);
    if (cursor.where) {
      conditions.push(cursor.where);
      values.push(...cursor.values);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(query.limit ?? 20, 100);
    const rows = await db.all<any>(
      `SELECT * FROM environments ${where} ORDER BY created_at DESC LIMIT ?`,
      ...values,
      limit + 1,
    );
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(rowToEnvironment);
    return c.json({ data, has_more: hasMore, first_id: data[0]?.id ?? null, last_id: data[data.length - 1]?.id ?? null }, 200);
  });

  app.openapi(deleteEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const db = await getDB();
    await db.run("DELETE FROM environments WHERE id = ?", environmentId);
    await auditLog(await currentUserId(c), "delete", "environment", environmentId);
    return c.json({ id: environmentId, type: "environment_deleted" }, 200);
  });

  app.openapi(archiveEnvironmentRoute, async (c) => {
    const { environmentId } = c.req.valid("param");
    const db = await getDB();
    const now = new Date().toISOString();
    await db.run("UPDATE environments SET archived_at = ?, updated_at = ? WHERE id = ?", now, now, environmentId);
    const row = await db.get("SELECT * FROM environments WHERE id = ?", environmentId);
    if (!row) throw Object.assign(new Error(`Environment ${environmentId} not found`), { status: 404, type: "not_found" });
    await auditLog(await currentUserId(c), "archive", "environment", environmentId);
    return c.json(rowToEnvironment(row), 200);
  });
}
