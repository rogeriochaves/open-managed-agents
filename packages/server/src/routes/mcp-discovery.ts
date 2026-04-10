import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDB, newId } from "../db/index.js";
import { encrypt } from "../lib/encryption.js";
import { currentUser } from "../lib/current-user.js";
import { auditLog } from "./governance.js";

const tags = ["MCP Discovery"];

// ── Connector registry (built-in known connectors) ─────────────────────────

interface MCPConnector {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  category: string;
  auth_type: "oauth" | "token" | "none";
}

const CONNECTORS: MCPConnector[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, read channels, manage workflows in Slack.",
    url: "https://mcp.slack.com/sse",
    icon: "slack",
    category: "communication",
    auth_type: "oauth",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write Notion pages, databases, and blocks.",
    url: "https://mcp.notion.com/sse",
    icon: "notion",
    category: "knowledge-base",
    auth_type: "oauth",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and code.",
    url: "https://mcp.github.com/sse",
    icon: "github",
    category: "development",
    auth_type: "token",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Create and manage issues, projects, and sprints.",
    url: "https://mcp.linear.app/sse",
    icon: "linear",
    category: "project-management",
    auth_type: "oauth",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Monitor errors, performance, and application health.",
    url: "https://mcp.sentry.io/sse",
    icon: "sentry",
    category: "monitoring",
    auth_type: "token",
  },
  {
    id: "asana",
    name: "Asana",
    description: "Manage tasks, projects, and team workflows.",
    url: "https://mcp.asana.com/sse",
    icon: "asana",
    category: "project-management",
    auth_type: "oauth",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    description: "Query analytics data, events, and user behavior.",
    url: "https://mcp.amplitude.com/sse",
    icon: "amplitude",
    category: "analytics",
    auth_type: "token",
  },
  {
    id: "intercom",
    name: "Intercom",
    description: "Read conversations, manage contacts, and support tickets.",
    url: "https://mcp.intercom.com/sse",
    icon: "intercom",
    category: "support",
    auth_type: "oauth",
  },
  {
    id: "atlassian",
    name: "Atlassian (Jira/Confluence)",
    description: "Manage Jira issues, Confluence pages, and Bitbucket repos.",
    url: "https://mcp.atlassian.com/sse",
    icon: "atlassian",
    category: "project-management",
    auth_type: "oauth",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Read and write files in Google Drive, Docs, and Sheets.",
    url: "https://mcp.google.com/drive/sse",
    icon: "google-drive",
    category: "storage",
    auth_type: "oauth",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query and manage PostgreSQL databases.",
    url: "https://mcp.postgres.example.com/sse",
    icon: "postgres",
    category: "database",
    auth_type: "token",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Manage payments, subscriptions, and customer data.",
    url: "https://mcp.stripe.com/sse",
    icon: "stripe",
    category: "payments",
    auth_type: "token",
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Query product analytics, feature flags, session recordings, and user data.",
    url: "https://mcp.posthog.com/sse",
    icon: "posthog",
    category: "analytics",
    auth_type: "token",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Manage contacts, deals, tickets, and marketing automation.",
    url: "https://mcp.hubspot.com/sse",
    icon: "hubspot",
    category: "support",
    auth_type: "oauth",
  },
  {
    id: "zendesk",
    name: "Zendesk",
    description: "Manage support tickets, users, and knowledge base articles.",
    url: "https://mcp.zendesk.com/sse",
    icon: "zendesk",
    category: "support",
    auth_type: "oauth",
  },
  {
    id: "datadog",
    name: "Datadog",
    description: "Query metrics, logs, traces, and monitor infrastructure health.",
    url: "https://mcp.datadog.com/sse",
    icon: "datadog",
    category: "monitoring",
    auth_type: "token",
  },
];

// ── Schemas ────────────────────────────────────────────────────────────────

const ConnectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  icon: z.string(),
  category: z.string(),
  auth_type: z.enum(["oauth", "token", "none"]),
  connected: z.boolean().optional(),
});

const ConnectBodySchema = z.object({
  token: z.string().min(1),
  auth_type: z.enum(["token", "oauth_bearer"]).optional(),
});

const ConnectorListQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
});

// ── Routes ─────────────────────────────────────────────────────────────────

const listConnectorsRoute = createRoute({
  method: "get",
  path: "/v1/mcp/connectors",
  tags,
  summary: "List available MCP connectors",
  request: {
    query: ConnectorListQuerySchema,
  },
  responses: {
    200: {
      description: "List of MCP connectors",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(ConnectorSchema),
          }),
        },
      },
    },
  },
});

const getConnectorRoute = createRoute({
  method: "get",
  path: "/v1/mcp/connectors/{connectorId}",
  tags,
  summary: "Get a specific MCP connector",
  request: {
    params: z.object({ connectorId: z.string() }),
  },
  responses: {
    200: {
      description: "Connector details",
      content: {
        "application/json": { schema: ConnectorSchema },
      },
    },
  },
});

const connectConnectorRoute = createRoute({
  method: "post",
  path: "/v1/mcp/connectors/{connectorId}/connect",
  tags,
  summary:
    "Connect an MCP connector by storing an encrypted token for the current organization",
  request: {
    params: z.object({ connectorId: z.string() }),
    body: {
      content: { "application/json": { schema: ConnectBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Connector connected",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            connector_id: z.string(),
            auth_type: z.string(),
            created_at: z.string(),
          }),
        },
      },
    },
  },
});

const disconnectConnectorRoute = createRoute({
  method: "delete",
  path: "/v1/mcp/connectors/{connectorId}/connect",
  tags,
  summary: "Disconnect an MCP connector (deletes the stored credential)",
  request: {
    params: z.object({ connectorId: z.string() }),
  },
  responses: {
    200: {
      description: "Connector disconnected",
      content: {
        "application/json": {
          schema: z.object({ deleted: z.boolean() }),
        },
      },
    },
  },
});

// ── Helper: which connectors does the current org have credentials for? ──

async function getConnectedIds(organizationId: string): Promise<Set<string>> {
  try {
    const db = await getDB();
    const rows = await db.all<{ connector_id: string }>(
      "SELECT connector_id FROM mcp_connections WHERE organization_id = ?",
      organizationId,
    );
    return new Set(rows.map((r) => r.connector_id));
  } catch {
    return new Set();
  }
}

export function registerMCPDiscoveryRoutes(app: OpenAPIHono) {
  app.openapi(listConnectorsRoute, async (c) => {
    const { search, category } = c.req.valid("query");
    let results = [...CONNECTORS];

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.id.includes(q)
      );
    }

    if (category) {
      results = results.filter((r) => r.category === category);
    }

    const user = await currentUser(c);
    const organizationId = user?.organization_id ?? "org_default";
    const connected = await getConnectedIds(organizationId);

    return c.json(
      {
        data: results.map((r) => ({ ...r, connected: connected.has(r.id) })),
      },
      200,
    );
  });

  app.openapi(getConnectorRoute, async (c) => {
    const { connectorId } = c.req.valid("param");
    const connector = CONNECTORS.find((r) => r.id === connectorId);

    if (!connector) {
      throw Object.assign(
        new Error(`Connector ${connectorId} not found`),
        { status: 404, type: "not_found" }
      );
    }

    const user = await currentUser(c);
    const organizationId = user?.organization_id ?? "org_default";
    const connected = await getConnectedIds(organizationId);

    return c.json({ ...connector, connected: connected.has(connector.id) }, 200);
  });

  app.openapi(connectConnectorRoute, async (c) => {
    const { connectorId } = c.req.valid("param");
    const body = c.req.valid("json");

    const connector = CONNECTORS.find((r) => r.id === connectorId);
    if (!connector) {
      throw Object.assign(
        new Error(`Connector ${connectorId} not found`),
        { status: 404, type: "not_found" },
      );
    }

    const user = await currentUser(c);
    const organizationId = user?.organization_id ?? "org_default";

    const db = await getDB();

    // Upsert: delete any existing row for this (org, connector) first
    await db.run(
      "DELETE FROM mcp_connections WHERE organization_id = ? AND connector_id = ?",
      organizationId,
      connectorId,
    );

    const id = newId("mcpconn");
    const tokenEncrypted = encrypt(body.token);
    const authType = body.auth_type ?? connector.auth_type ?? "token";

    await db.run(
      "INSERT INTO mcp_connections (id, organization_id, connector_id, auth_type, token_encrypted, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      organizationId,
      connectorId,
      authType,
      tokenEncrypted,
      user?.id ?? null,
    );

    await auditLog(
      user?.id ?? null,
      "connect",
      "mcp_connector",
      connectorId,
      JSON.stringify({ auth_type: authType }),
    );

    const row = await db.get<{ id: string; connector_id: string; auth_type: string; created_at: string }>(
      "SELECT id, connector_id, auth_type, created_at FROM mcp_connections WHERE id = ?",
      id,
    );

    return c.json(
      {
        id: row!.id,
        connector_id: row!.connector_id,
        auth_type: row!.auth_type,
        created_at: row!.created_at,
      },
      200,
    );
  });

  app.openapi(disconnectConnectorRoute, async (c) => {
    const { connectorId } = c.req.valid("param");
    const user = await currentUser(c);
    const organizationId = user?.organization_id ?? "org_default";

    const db = await getDB();
    await db.run(
      "DELETE FROM mcp_connections WHERE organization_id = ? AND connector_id = ?",
      organizationId,
      connectorId,
    );

    await auditLog(
      user?.id ?? null,
      "disconnect",
      "mcp_connector",
      connectorId,
    );

    return c.json({ deleted: true }, 200);
  });
}
