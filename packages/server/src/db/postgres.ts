import pg from "pg";
import type { DbAdapter } from "./adapter.js";

/**
 * Translate SQL with `?` placeholders to Postgres `$1..$N` form.
 * Keeps `?` inside single-quoted strings untouched.
 */
function translateSql(sql: string): string {
  let out = "";
  let i = 0;
  let n = 1;
  let inString: '"' | "'" | null = null;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (inString) {
      out += ch;
      if (ch === inString && sql[i - 1] !== "\\") inString = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "?") {
      out += `$${n++}`;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function createPostgresAdapter(connectionString: string): DbAdapter {
  const pool = new pg.Pool({ connectionString });

  return {
    dialect: "postgres",

    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const result = await pool.query(translateSql(sql), params as any[]);
      return result.rows as T[];
    },

    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const result = await pool.query(translateSql(sql), params as any[]);
      return result.rows[0] as T | undefined;
    },

    async run(sql: string, ...params: unknown[]): Promise<void> {
      await pool.query(translateSql(sql), params as any[]);
    },

    async exec(sql: string): Promise<void> {
      // Postgres can execute multi-statement scripts in one query call
      await pool.query(sql);
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
