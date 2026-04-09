import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

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

export function registerMCPDiscoveryRoutes(app: OpenAPIHono) {
  app.openapi(listConnectorsRoute, (c) => {
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

    return c.json({ data: results }, 200);
  });

  app.openapi(getConnectorRoute, (c) => {
    const { connectorId } = c.req.valid("param");
    const connector = CONNECTORS.find((r) => r.id === connectorId);

    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    return c.json(connector, 200);
  });
}
