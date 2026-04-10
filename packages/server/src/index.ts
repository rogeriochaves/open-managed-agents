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

import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const governanceConfigPath = process.env.GOVERNANCE_CONFIG
  ? resolve(process.cwd(), process.env.GOVERNANCE_CONFIG)
  : undefined;

const app = await createApp({ governanceConfigPath });

const port = Number(process.env.PORT ?? 3001);

console.log(`\n  Open Managed Agents Server v0.2.0`);
console.log(`  ─────────────────────────────────`);
console.log(`  API:         http://localhost:${port}`);
console.log(`  Swagger UI:  http://localhost:${port}/docs`);
console.log(`  OpenAPI:     http://localhost:${port}/openapi.json\n`);

serve({ fetch: app.fetch, port });
