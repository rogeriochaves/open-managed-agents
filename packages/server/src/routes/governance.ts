import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDB, newId } from "../db/index.js";
import { currentUserId } from "../lib/current-user.js";

const tags = ["Governance"];

// ── Schemas ────────────────────────────────────────────────────────────────

const OrgSchema = z.object({
  id: z.string(), name: z.string(), slug: z.string(),
  logo_url: z.string().nullable(), sso_provider: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
});

const TeamSchema = z.object({
  id: z.string(), organization_id: z.string(), name: z.string(), slug: z.string(),
  description: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});

const ProjectSchema = z.object({
  id: z.string(), team_id: z.string(), name: z.string(), slug: z.string(),
  description: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});

const UserSchema = z.object({
  id: z.string(), email: z.string(), name: z.string(), role: z.string(),
  organization_id: z.string().nullable(), avatar_url: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
});

const TeamMemberSchema = z.object({
  id: z.string(), team_id: z.string(), user_id: z.string(), role: z.string(),
  user: UserSchema.optional(), created_at: z.string(),
});

const TeamProviderAccessSchema = z.object({
  id: z.string(), team_id: z.string(), provider_id: z.string(),
  enabled: z.boolean(), rate_limit_rpm: z.number().nullable(),
  monthly_budget_usd: z.number().nullable(), created_at: z.string(),
});

const TeamMCPPolicySchema = z.object({
  id: z.string(), team_id: z.string(), connector_id: z.string(),
  policy: z.enum(["allowed", "blocked", "requires_approval"]), created_at: z.string(),
});

// ── Routes ─────────────────────────────────────────────────────────────────

// Organizations
const listOrgsRoute = createRoute({
  method: "get", path: "/v1/organizations", tags, summary: "List organizations",
  responses: { 200: { description: "Organizations", content: { "application/json": { schema: z.object({ data: z.array(OrgSchema) }) } } } },
});

const createOrgRoute = createRoute({
  method: "post", path: "/v1/organizations", tags, summary: "Create organization",
  request: { body: { content: { "application/json": { schema: z.object({ name: z.string(), slug: z.string(), logo_url: z.string().optional(), sso_provider: z.string().optional(), sso_config: z.any().optional() }) } } } },
  responses: { 200: { description: "Created", content: { "application/json": { schema: OrgSchema } } } },
});

// Teams
const listTeamsRoute = createRoute({
  method: "get", path: "/v1/organizations/{orgId}/teams", tags, summary: "List teams",
  request: { params: z.object({ orgId: z.string() }) },
  responses: { 200: { description: "Teams", content: { "application/json": { schema: z.object({ data: z.array(TeamSchema) }) } } } },
});

const createTeamRoute = createRoute({
  method: "post", path: "/v1/organizations/{orgId}/teams", tags, summary: "Create team",
  request: { params: z.object({ orgId: z.string() }), body: { content: { "application/json": { schema: z.object({ name: z.string(), slug: z.string(), description: z.string().optional() }) } } } },
  responses: { 200: { description: "Created", content: { "application/json": { schema: TeamSchema } } } },
});

// Projects
const listProjectsRoute = createRoute({
  method: "get", path: "/v1/teams/{teamId}/projects", tags, summary: "List projects",
  request: { params: z.object({ teamId: z.string() }) },
  responses: { 200: { description: "Projects", content: { "application/json": { schema: z.object({ data: z.array(ProjectSchema) }) } } } },
});

const createProjectRoute = createRoute({
  method: "post", path: "/v1/teams/{teamId}/projects", tags, summary: "Create project",
  request: { params: z.object({ teamId: z.string() }), body: { content: { "application/json": { schema: z.object({ name: z.string(), slug: z.string(), description: z.string().optional() }) } } } },
  responses: { 200: { description: "Created", content: { "application/json": { schema: ProjectSchema } } } },
});

// Team members
const listMembersRoute = createRoute({
  method: "get", path: "/v1/teams/{teamId}/members", tags, summary: "List team members",
  request: { params: z.object({ teamId: z.string() }) },
  responses: { 200: { description: "Members", content: { "application/json": { schema: z.object({ data: z.array(TeamMemberSchema) }) } } } },
});

const addMemberRoute = createRoute({
  method: "post", path: "/v1/teams/{teamId}/members", tags, summary: "Add team member",
  request: { params: z.object({ teamId: z.string() }), body: { content: { "application/json": { schema: z.object({ user_id: z.string(), role: z.enum(["admin", "member", "viewer"]).optional() }) } } } },
  responses: { 200: { description: "Added", content: { "application/json": { schema: TeamMemberSchema } } } },
});

// Provider access
const listProviderAccessRoute = createRoute({
  method: "get", path: "/v1/teams/{teamId}/provider-access", tags, summary: "List team provider access",
  request: { params: z.object({ teamId: z.string() }) },
  responses: { 200: { description: "Access rules", content: { "application/json": { schema: z.object({ data: z.array(TeamProviderAccessSchema) }) } } } },
});

const setProviderAccessRoute = createRoute({
  method: "post", path: "/v1/teams/{teamId}/provider-access", tags, summary: "Set team provider access",
  request: { params: z.object({ teamId: z.string() }), body: { content: { "application/json": { schema: z.object({ provider_id: z.string(), enabled: z.boolean().optional(), rate_limit_rpm: z.number().nullable().optional(), monthly_budget_usd: z.number().nullable().optional() }) } } } },
  responses: { 200: { description: "Set", content: { "application/json": { schema: TeamProviderAccessSchema } } } },
});

// MCP policies
const listMCPPoliciesRoute = createRoute({
  method: "get", path: "/v1/teams/{teamId}/mcp-policies", tags, summary: "List MCP policies",
  request: { params: z.object({ teamId: z.string() }) },
  responses: { 200: { description: "Policies", content: { "application/json": { schema: z.object({ data: z.array(TeamMCPPolicySchema) }) } } } },
});

const setMCPPolicyRoute = createRoute({
  method: "post", path: "/v1/teams/{teamId}/mcp-policies", tags, summary: "Set MCP policy",
  request: { params: z.object({ teamId: z.string() }), body: { content: { "application/json": { schema: z.object({ connector_id: z.string(), policy: z.enum(["allowed", "blocked", "requires_approval"]) }) } } } },
  responses: { 200: { description: "Set", content: { "application/json": { schema: TeamMCPPolicySchema } } } },
});

// Users
const listUsersRoute = createRoute({
  method: "get", path: "/v1/users", tags, summary: "List users",
  responses: { 200: { description: "Users", content: { "application/json": { schema: z.object({ data: z.array(UserSchema) }) } } } },
});

const createUserRoute = createRoute({
  method: "post", path: "/v1/users", tags, summary: "Create user",
  request: { body: { content: { "application/json": { schema: z.object({ email: z.string(), name: z.string(), role: z.enum(["admin", "member", "viewer"]).optional(), organization_id: z.string().optional() }) } } } },
  responses: { 200: { description: "Created", content: { "application/json": { schema: UserSchema } } } },
});

// Audit log
const listAuditLogRoute = createRoute({
  method: "get", path: "/v1/audit-log", tags, summary: "List audit log entries",
  request: { query: z.object({ limit: z.coerce.number().optional(), resource_type: z.string().optional() }) },
  responses: { 200: { description: "Audit log", content: { "application/json": { schema: z.object({ data: z.array(z.object({ id: z.string(), user_id: z.string().nullable(), action: z.string(), resource_type: z.string(), resource_id: z.string().nullable(), details: z.record(z.unknown()).nullable(), created_at: z.string() })) }) } } } },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowClean(row: any) {
  if (!row) return row;
  const r = { ...row };
  // Convert SQLite integers to booleans where needed
  if ("enabled" in r) r.enabled = !!r.enabled;
  return r;
}

// ── Register ───────────────────────────────────────────────────────────────

export function registerGovernanceRoutes(app: OpenAPIHono) {
  // Organizations
  app.openapi(listOrgsRoute, async (c) => {
    const db = await getDB();
    const rows = await db.all<any>("SELECT * FROM organizations ORDER BY name");
    return c.json({ data: rows.map(rowClean) }, 200);
  });

  app.openapi(createOrgRoute, async (c) => {
    const db = await getDB();
    const body = c.req.valid("json") as any;
    const id = newId("org");
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO organizations (id, name, slug, logo_url, sso_provider, sso_config, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
      id, body.name, body.slug, body.logo_url ?? null, body.sso_provider ?? null, body.sso_config ? JSON.stringify(body.sso_config) : null, now, now
    );
    const row = await db.get("SELECT * FROM organizations WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "organization", id, JSON.stringify({ slug: body.slug }));
    return c.json(rowClean(row), 200);
  });

  // Teams
  app.openapi(listTeamsRoute, async (c) => {
    const db = await getDB();
    const { orgId } = c.req.valid("param");
    const rows = await db.all<any>("SELECT * FROM teams WHERE organization_id = ? ORDER BY name", orgId);
    return c.json({ data: rows.map(rowClean) }, 200);
  });

  app.openapi(createTeamRoute, async (c) => {
    const db = await getDB();
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const id = newId("team");
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO teams (id, organization_id, name, slug, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      id, orgId, body.name, body.slug, body.description ?? null, now, now
    );
    const row = await db.get("SELECT * FROM teams WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "team", id, JSON.stringify({ organization_id: orgId, slug: body.slug }));
    return c.json(rowClean(row), 200);
  });

  // Projects
  app.openapi(listProjectsRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const rows = await db.all<any>("SELECT * FROM projects WHERE team_id = ? ORDER BY name", teamId);
    return c.json({ data: rows.map(rowClean) }, 200);
  });

  app.openapi(createProjectRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const id = newId("proj");
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO projects (id, team_id, name, slug, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      id, teamId, body.name, body.slug, body.description ?? null, now, now
    );
    const row = await db.get("SELECT * FROM projects WHERE id = ?", id);
    await auditLog(await currentUserId(c), "create", "project", id, JSON.stringify({ team_id: teamId, slug: body.slug }));
    return c.json(rowClean(row), 200);
  });

  // Team members
  app.openapi(listMembersRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const rows = await db.all<any>(
      `SELECT tm.*, u.email, u.name as user_name, u.role as user_role, u.avatar_url
       FROM team_members tm
       LEFT JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ?
       ORDER BY tm.created_at`,
      teamId
    );

    const members = rows.map((r) => ({
      id: r.id, team_id: r.team_id, user_id: r.user_id, role: r.role, created_at: r.created_at,
      user: { id: r.user_id, email: r.email, name: r.user_name, role: r.user_role, avatar_url: r.avatar_url, organization_id: null, created_at: r.created_at, updated_at: r.created_at },
    }));
    return c.json({ data: members }, 200);
  });

  app.openapi(addMemberRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const now = new Date().toISOString();
    // Portable upsert: check-then-update-or-insert
    const existing = await db.get<any>(
      "SELECT id FROM team_members WHERE team_id = ? AND user_id = ?",
      teamId, body.user_id
    );
    let id: string;
    if (existing) {
      id = existing.id;
      await db.run("UPDATE team_members SET role = ? WHERE id = ?", body.role ?? "member", id);
    } else {
      id = newId("tm");
      await db.run(
        "INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES (?,?,?,?,?)",
        id, teamId, body.user_id, body.role ?? "member", now
      );
    }
    const row = await db.get("SELECT * FROM team_members WHERE id = ?", id);
    return c.json(rowClean(row), 200);
  });

  // Provider access
  app.openapi(listProviderAccessRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const rows = await db.all<any>("SELECT * FROM team_provider_access WHERE team_id = ?", teamId);
    return c.json({ data: rows.map(rowClean) }, 200);
  });

  app.openapi(setProviderAccessRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const existing = await db.get<any>(
      "SELECT * FROM team_provider_access WHERE team_id = ? AND provider_id = ?",
      teamId, body.provider_id
    );

    if (existing) {
      const updates: string[] = [];
      const values: any[] = [];
      if (body.enabled !== undefined) { updates.push("enabled = ?"); values.push(body.enabled ? 1 : 0); }
      if (body.rate_limit_rpm !== undefined) { updates.push("rate_limit_rpm = ?"); values.push(body.rate_limit_rpm); }
      if (body.monthly_budget_usd !== undefined) { updates.push("monthly_budget_usd = ?"); values.push(body.monthly_budget_usd); }
      if (updates.length > 0) {
        values.push(existing.id);
        await db.run(`UPDATE team_provider_access SET ${updates.join(", ")} WHERE id = ?`, ...values);
      }
      const row = await db.get("SELECT * FROM team_provider_access WHERE id = ?", existing.id);
      return c.json(rowClean(row), 200);
    }

    const id = newId("tpa");
    await db.run(
      "INSERT INTO team_provider_access (id, team_id, provider_id, enabled, rate_limit_rpm, monthly_budget_usd) VALUES (?,?,?,?,?,?)",
      id, teamId, body.provider_id, body.enabled !== false ? 1 : 0, body.rate_limit_rpm ?? null, body.monthly_budget_usd ?? null
    );
    const row = await db.get("SELECT * FROM team_provider_access WHERE id = ?", id);
    return c.json(rowClean(row), 200);
  });

  // MCP policies
  app.openapi(listMCPPoliciesRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const rows = await db.all<any>("SELECT * FROM team_mcp_policies WHERE team_id = ?", teamId);
    return c.json({ data: rows.map(rowClean) }, 200);
  });

  app.openapi(setMCPPolicyRoute, async (c) => {
    const db = await getDB();
    const { teamId } = c.req.valid("param");
    const body = c.req.valid("json") as any;
    const existing = await db.get<any>(
      "SELECT * FROM team_mcp_policies WHERE team_id = ? AND connector_id = ?",
      teamId, body.connector_id
    );

    if (existing) {
      await db.run("UPDATE team_mcp_policies SET policy = ? WHERE id = ?", body.policy, existing.id);
      const row = await db.get("SELECT * FROM team_mcp_policies WHERE id = ?", existing.id);
      return c.json(rowClean(row), 200);
    }

    const id = newId("mcp_pol");
    await db.run(
      "INSERT INTO team_mcp_policies (id, team_id, connector_id, policy) VALUES (?,?,?,?)",
      id, teamId, body.connector_id, body.policy
    );
    const row = await db.get("SELECT * FROM team_mcp_policies WHERE id = ?", id);
    return c.json(rowClean(row), 200);
  });

  // Users
  app.openapi(listUsersRoute, async (c) => {
    const db = await getDB();
    const rows = await db.all<any>(
      "SELECT id, email, name, role, organization_id, avatar_url, created_at, updated_at FROM users ORDER BY name"
    );
    return c.json({ data: rows.map(rowClean) }, 200);
  });

  app.openapi(createUserRoute, async (c) => {
    const db = await getDB();
    const body = c.req.valid("json") as any;
    const id = newId("user");
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO users (id, email, name, role, organization_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      id, body.email, body.name, body.role ?? "member", body.organization_id ?? "org_default", now, now
    );
    const row = await db.get(
      "SELECT id, email, name, role, organization_id, avatar_url, created_at, updated_at FROM users WHERE id = ?",
      id
    );
    await auditLog(await currentUserId(c), "create", "user", id, JSON.stringify({ email: body.email, role: body.role ?? "member" }));
    return c.json(rowClean(row), 200);
  });

  // Audit log
  app.openapi(listAuditLogRoute, async (c) => {
    const db = await getDB();
    const query = c.req.valid("query") as any;
    const limit = Math.min(query.limit ?? 50, 500);
    const conditions: string[] = [];
    const values: any[] = [];
    if (query.resource_type) { conditions.push("resource_type = ?"); values.push(query.resource_type); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db.all<any>(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`,
      ...values, limit
    );
    // Parse the details JSON blob at the boundary — matches how
    // agents/sessions routes return their JSON columns as objects.
    // Malformed blobs degrade to null rather than crashing the listing.
    const data = rows.map((row) => {
      const cleaned = rowClean(row);
      if (cleaned?.details) {
        try {
          cleaned.details = JSON.parse(cleaned.details);
        } catch {
          cleaned.details = null;
        }
      } else {
        cleaned.details = null;
      }
      return cleaned;
    });
    return c.json({ data }, 200);
  });
}

/**
 * Log an action to the audit log.
 */
export async function auditLog(
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: string
) {
  const db = await getDB();
  const id = newId("audit");
  await db.run(
    "INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details) VALUES (?,?,?,?,?,?)",
    id, userId, action, resourceType, resourceId ?? null, details ?? null
  );
}
