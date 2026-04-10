/**
 * Cursor pagination helper used by every list route.
 *
 * Every list handler used to ignore `after_id` entirely — the
 * client would track a cursorStack and send after_id, the server
 * would happily return the same first page forever, and a user
 * with >20 rows literally couldn't page past the first screen.
 * This helper closes that gap in one place so the four list
 * handlers (agents, sessions, environments, vaults) stay in sync.
 *
 * Strategy: look up the cursor row's `created_at` from the same
 * table, then gate the main query on `created_at < cursor_ts`.
 * We don't use tuple comparison (created_at, id) < (?, ?) because
 * its syntax differs between sqlite and postgres. Same-second ties
 * are rare enough in practice and graceful enough to ignore — a
 * duplicate row at the exact boundary would appear on two pages,
 * which is strictly better than being stuck on page 1.
 *
 * If the cursor id doesn't resolve (the row was deleted between
 * page loads, or the caller passed a bogus id) we fall back to no
 * filter — no cursor is better than a silent empty page.
 */

import type { DbAdapter } from "../db/index.js";

export interface CursorClause {
  where: string; // e.g. "created_at < ?" or ""
  values: unknown[]; // values to splice into the query
}

export async function buildAfterIdClause(
  db: DbAdapter,
  table: string,
  afterId: string | undefined,
): Promise<CursorClause> {
  if (!afterId) return { where: "", values: [] };
  const row = await db.get<{ created_at: string }>(
    `SELECT created_at FROM ${table} WHERE id = ?`,
    afterId,
  );
  if (!row?.created_at) return { where: "", values: [] };
  return { where: "created_at < ?", values: [row.created_at] };
}

/**
 * Build WHERE conditions + values for the `created_at[gt|gte|lt|lte]`
 * query params that AgentListQuerySchema / SessionListQuerySchema
 * already declared. Handlers used to ignore these entirely, so the
 * "Last 24 hours" date filter on the agents/sessions list pages
 * was a visual illusion — the dropdown changed but the rows didn't.
 *
 * Each handler calls this once per request and splices the returned
 * clauses into its own conditions array alongside include_archived,
 * agent_id, and the cursor clause.
 */
export interface DateRangeClauses {
  clauses: string[];
  values: unknown[];
}

export function buildCreatedAtClauses(
  query: Record<string, unknown>,
): DateRangeClauses {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const gte = query["created_at[gte]"];
  const gt = query["created_at[gt]"];
  const lte = query["created_at[lte]"];
  const lt = query["created_at[lt]"];
  if (typeof gte === "string" && gte) {
    clauses.push("created_at >= ?");
    values.push(gte);
  }
  if (typeof gt === "string" && gt) {
    clauses.push("created_at > ?");
    values.push(gt);
  }
  if (typeof lte === "string" && lte) {
    clauses.push("created_at <= ?");
    values.push(lte);
  }
  if (typeof lt === "string" && lt) {
    clauses.push("created_at < ?");
    values.push(lt);
  }
  return { clauses, values };
}
