/**
 * Database layer.
 *
 * Selects the driver based on DATABASE_URL:
 *   - "postgres://..." or "postgresql://..." → Postgres
 *   - anything else or unset → SQLite (default)
 *
 * For SQLite, DATABASE_PATH controls the file location
 * (default: `data/oma.db` relative to cwd).
 */

import { v4 as uuid } from "uuid";
import type { DbAdapter } from "./adapter.js";
import { createSqliteAdapter } from "./sqlite.js";
import { createPostgresAdapter } from "./postgres.js";
import { initSchema } from "./schema.js";

let adapter: DbAdapter | null = null;
let initPromise: Promise<DbAdapter> | null = null;

async function initAdapter(): Promise<DbAdapter> {
  const url = process.env.DATABASE_URL;

  if (url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
    const a = createPostgresAdapter(url);
    await initSchema(a);
    console.log("Database: postgres");
    return a;
  }

  const path = process.env.DATABASE_PATH;
  const a = createSqliteAdapter(path);
  await initSchema(a);
  console.log(`Database: sqlite (${path ?? "data/oma.db"})`);
  return a;
}

/**
 * Get the shared DB adapter. Async — caller should `await getDB()`.
 * Safe to call multiple times.
 */
export async function getDB(): Promise<DbAdapter> {
  if (adapter) return adapter;
  if (!initPromise) {
    initPromise = initAdapter().then((a) => {
      adapter = a;
      return a;
    });
  }
  return initPromise;
}

export function newId(prefix: string): string {
  return `${prefix}_${uuid().replace(/-/g, "")}`;
}

export { uuid };
export type { DbAdapter };
