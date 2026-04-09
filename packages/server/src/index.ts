import "dotenv/config";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { anthropicMiddleware } from "./middleware/anthropic.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerVaultRoutes } from "./routes/vaults.js";

const app = new OpenAPIHono();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
  })
);

app.use("/v1/*", anthropicMiddleware);

// ── Routes ──────────────────────────────────────────────────────────────────

registerAgentRoutes(app);
registerEnvironmentRoutes(app);
registerSessionRoutes(app);
registerEventRoutes(app);
registerVaultRoutes(app);

// ── OpenAPI spec & Swagger UI ───────────────────────────────────────────────

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Open Managed Agents API",
    version: "0.1.0",
    description:
      "A proxy server for the Anthropic Managed Agents API with OpenAPI documentation.",
  },
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// ── Server ──────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3001);

console.log(`Server listening on http://localhost:${port}`);
console.log(`Swagger UI: http://localhost:${port}/docs`);
console.log(`OpenAPI spec: http://localhost:${port}/openapi.json`);

serve({ fetch: app.fetch, port });
