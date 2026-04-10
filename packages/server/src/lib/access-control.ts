/**
 * Runtime access-control enforcement for team-scoped resources.
 *
 * The governance schema already lets admins say "team X can use
 * provider Y" via the team_provider_access table. This file reads
 * those rows when a user is about to use a provider and denies the
 * request if none of the user's teams grant access.
 *
 * Semantics:
 *
 * - Admins (role="admin") bypass all checks. There is no way for an
 *   admin to lock themselves out of their own install.
 *
 * - Unauthenticated requests (null user) bypass all checks. This is
 *   the AUTH_ENABLED=false case and the open "no admin has set
 *   anything up yet" case. If you want strict checks in those
 *   modes, enable auth + seed team_provider_access rows.
 *
 * - If the user is authenticated and not admin AND there is at
 *   least one team_provider_access row for the target provider
 *   across any team membership the user has, access is allowed.
 *
 * - Otherwise, access is denied.
 */

import type { DbAdapter } from "../db/index.js";

export interface AccessCheckInput {
  db: DbAdapter;
  userId: string | null;
  userRole: string | null;
  providerId: string;
}

export async function canUseProvider(
  input: AccessCheckInput
): Promise<boolean> {
  // Unauthenticated or auth disabled → no check
  if (!input.userId) return true;
  // Admins always pass
  if (input.userRole === "admin") return true;

  const rows = await input.db.all<any>(
    `SELECT tpa.id
     FROM team_provider_access tpa
     JOIN team_members tm ON tm.team_id = tpa.team_id
     WHERE tm.user_id = ?
       AND tpa.provider_id = ?
       AND tpa.enabled = 1
     LIMIT 1`,
    input.userId,
    input.providerId
  );
  return rows.length > 0;
}
