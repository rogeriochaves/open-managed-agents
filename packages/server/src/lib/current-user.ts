/**
 * Tiny helper for routes that want to know which user performed
 * the current action — primarily for audit log entries.
 *
 * Returns the user id from the session cookie, or null if the
 * request is unauthenticated (or if auth is disabled globally).
 */

import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { validateSession, type SessionUser } from "./auth-session.js";

export async function currentUserId(c: Context): Promise<string | null> {
  const token = getCookie(c, "oma_session");
  const user = await validateSession(token);
  return user?.id ?? null;
}

export async function currentUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, "oma_session");
  return validateSession(token);
}
