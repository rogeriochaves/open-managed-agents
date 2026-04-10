import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env from the package dir first (highest precedence), then
// walk up to the monorepo root. dotenv's default override:false
// means each subsequent load only fills keys that earlier files
// didn't already set — so a package-level .env wins for the keys
// it cares about, and the root .env fills in everything else.
//
// We used to `break` on the first file found, which meant a tiny
// package .env shadowed the root .env entirely. A monorepo where
// the root owns API keys and a package owns a per-service secret
// (like VAULT_ENCRYPTION_KEY) would silently miss the API keys.
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
];
for (const p of envPaths) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
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
