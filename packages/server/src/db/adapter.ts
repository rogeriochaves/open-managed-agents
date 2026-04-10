/**
 * Database adapter interface.
 *
 * Abstracts over SQLite (default, for local/dev) and Postgres (production).
 * Routes should use this interface, never the raw driver.
 *
 * Placeholders: always use `?` in SQL — the adapter translates to `$1..$N` for Postgres.
 *
 * Upserts: use the `upsert` helper since `INSERT OR REPLACE` / `ON CONFLICT` differ
 * between dialects.
 *
 * Datetime: use ISO strings (`new Date().toISOString()`). Both dialects accept them.
 *
 * JSON: both dialects store JSON as text for portability. Encode/decode in route code.
 */

export interface DbAdapter {
  dialect: "sqlite" | "postgres";
  all<T = any>(sql: string, ...params: unknown[]): Promise<T[]>;
  get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  run(sql: string, ...params: unknown[]): Promise<void>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
