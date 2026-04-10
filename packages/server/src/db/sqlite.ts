import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { DbAdapter } from "./adapter.js";

export function createSqliteAdapter(dbPath?: string): DbAdapter {
  const path = dbPath ?? join(process.cwd(), "data", "oma.db");

  // Ensure data directory exists
  const dir = path.substring(0, path.lastIndexOf("/"));
  if (dir) mkdirSync(dir, { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return {
    dialect: "sqlite",

    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      return db.prepare(sql).all(...(params as any[])) as T[];
    },

    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      return db.prepare(sql).get(...(params as any[])) as T | undefined;
    },

    async run(sql: string, ...params: unknown[]): Promise<void> {
      db.prepare(sql).run(...(params as any[]));
    },

    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
