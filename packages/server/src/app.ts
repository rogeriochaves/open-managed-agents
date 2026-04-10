/**
 * App factory. Builds a fully-wired Hono app without starting a listener,
 * so tests (and any embedder) can use `app.request()` against it.
 *
 * `src/index.ts` imports this and calls `serve()` to run the production
 * HTTP server.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";

import { registerAgentRoutes } from "./routes/agents.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerVaultRoutes } from "./routes/vaults.js";
import { registerMCPDiscoveryRoutes } from "./routes/mcp-discovery.js";
import {
  registerProviderRoutes,
  seedDefaultProviders,
} from "./routes/providers.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { getDB } from "./db/index.js";
import { loadGovernanceConfig } from "./lib/governance-config.js";
import { initAuth } from "./lib/auth-session.js";

export interface CreateAppOptions {
  /** Path to a governance config JSON file to load on boot. */
  governanceConfigPath?: string;
  /** Skip the default-provider seed pass (for clean test dbs). */
  skipProviderSeed?: boolean;
}

/**
 * Builds a fully-wired OpenAPIHono app instance.
 * Safe to call multiple times — each call reuses the shared DB adapter.
 */
export async function createApp(
  options: CreateAppOptions = {}
): Promise<OpenAPIHono> {
  // Initialize database schema and default seeds
  await getDB();
  if (!options.skipProviderSeed) {
    await seedDefaultProviders();
  }
  await initAuth();

  if (options.governanceConfigPath) {
    await loadGovernanceConfig(options.governanceConfigPath);
  }

  const app = new OpenAPIHono();

  // ── Middleware ─────────────────────────────────────────────────────────
  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "x-api-key", "Cookie"],
      credentials: true,
    })
  );

  // ── Error handler ─────────────────────────────────────────────────────
  app.onError((err, c) => {
    const status = (err as any)?.status ?? 500;
    const message = err.message ?? "Internal server error";
    const type = (err as any)?.type ?? "internal_error";

    console.error(`[${c.req.method} ${c.req.path}] ${status}: ${message}`);

    const statusCode = Math.max(400, Math.min(status, 599));
    return c.json({ error: { type, message } }, statusCode as any);
  });

  // ── Routes ────────────────────────────────────────────────────────────
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

  // ── Health check ──────────────────────────────────────────────────────
  app.get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() })
  );

  // ── OpenAPI spec & Swagger UI ────────────────────────────────────────
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

  return app;
}
