import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env from project root or server dir
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../.env"),
];
for (const p of envPaths) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerVaultRoutes } from "./routes/vaults.js";
import { registerMCPDiscoveryRoutes } from "./routes/mcp-discovery.js";
import { registerProviderRoutes, seedDefaultProviders } from "./routes/providers.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { getDB } from "./db/index.js";
import { loadGovernanceConfig } from "./lib/governance-config.js";
import { initAuth } from "./lib/auth-session.js";

const app = new OpenAPIHono();

// ── Initialize database and seed providers ─────────────────────────────────

await getDB(); // Ensure schema is created
await seedDefaultProviders(); // Seed from env vars on first run
await initAuth(); // Initialize default admin user password

// Load governance config if specified
const governanceConfigPath = process.env.GOVERNANCE_CONFIG;
if (governanceConfigPath) {
  await loadGovernanceConfig(resolve(process.cwd(), governanceConfigPath));
}

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-api-key", "Cookie"],
    credentials: true,
  })
);

// ── Error handler ──────────────────────────────────────────────────────────

app.onError((err, c) => {
  const status = (err as any)?.status ?? 500;
  const message = err.message ?? "Internal server error";
  const type = (err as any)?.type ?? "internal_error";

  console.error(`[${c.req.method} ${c.req.path}] ${status}: ${message}`);

  const statusCode = Math.max(400, Math.min(status, 599));
  return c.json(
    { error: { type, message } },
    statusCode as any
  );
});

// ── Routes ──────────────────────────────────────────────────────────────────

registerProviderRoutes(app);
registerAgentRoutes(app);
registerEnvironmentRoutes(app);
registerSessionRoutes(app);
registerEventRoutes(app);
registerVaultRoutes(app);
registerMCPDiscoveryRoutes(app);
registerGovernanceRoutes(app);
registerUsageRoutes(app);
registerAuthRoutes(app);

// ── Health check ───────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

// ── OpenAPI spec & Swagger UI ───────────────────────────────────────────────

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Open Managed Agents API",
    version: "0.2.0",
    description:
      "Self-hosted agent management platform with multi-LLM provider support. Compatible with the Anthropic Managed Agents API.",
  },
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// ── Server ──────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3001);

console.log(`\n  Open Managed Agents Server v0.2.0`);
console.log(`  ─────────────────────────────────`);
console.log(`  API:         http://localhost:${port}`);
console.log(`  Swagger UI:  http://localhost:${port}/docs`);
console.log(`  OpenAPI:     http://localhost:${port}/openapi.json\n`);

serve({ fetch: app.fetch, port });
