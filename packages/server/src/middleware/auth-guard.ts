/**
 * Global auth guard middleware.
 *
 * Every route in the server except an explicit public-paths list
 * requires a valid session cookie. If the session is missing or
 * invalid, the request is rejected with 401.
 *
 * Disabled by setting `AUTH_ENABLED=false` — the test suites and
 * dev-mode deployments do this. In production (the default) the
 * guard is ON.
 *
 * Historical note: this file was missing for a long time. Tests
 * were setting AUTH_ENABLED=false as if a guard existed, but in
 * fact nothing consulted the flag — every route was publicly
 * reachable. That was the biggest latent security gap in the
 * project. Discovered by audit-traceability testing.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { validateSession, type SessionUser } from "../lib/auth-session.js";

/**
 * Paths that must be reachable without an authenticated session,
 * regardless of AUTH_ENABLED. These are the ones the login UI
 * and external monitors need to call before a cookie exists.
 */
const PUBLIC_PATHS: Array<RegExp> = [
  /^\/$/,
  /^\/health$/,
  /^\/docs$/,
  /^\/openapi\.json$/,
  /^\/v1\/auth\/login$/,
  /^\/v1\/auth\/logout$/,
  /^\/v1\/auth\/me$/, // intentionally public — returns {user: null} when unauth'd
  /^\/v1\/auth\/sso-providers$/,
];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((rx) => rx.test(path));
}

export async function authGuard(c: Context, next: Next) {
  // Flag check: default ON, explicit "false" turns it off for dev/tests.
  if (process.env.AUTH_ENABLED === "false") return next();

  if (isPublic(c.req.path)) return next();

  // CORS preflight — never guarded.
  if (c.req.method === "OPTIONS") return next();

  // Resolve the session token from (in precedence order):
  //   1. oma_session cookie (browsers / the web app)
  //   2. Authorization: Bearer <token>   (CLI / curl / generated clients)
  //   3. x-api-key: <token>              (Anthropic-SDK compatibility)
  //
  // The token value in all cases is the same opaque session token
  // returned by POST /v1/auth/login → Set-Cookie: oma_session=<token>.
  // A CLI user can therefore: curl -X POST /v1/auth/login → extract
  // the cookie → export OMA_API_KEY=<cookie-value> → every subsequent
  // CLI call lands authenticated.
  let token: string | undefined = getCookie(c, "oma_session");

  if (!token) {
    const authHeader = c.req.header("authorization");
    if (authHeader) {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (m) token = m[1];
    }
  }
  if (!token) {
    token = c.req.header("x-api-key");
  }

  const user: SessionUser | null = await validateSession(token);
  if (!user) {
    return c.json(
      { error: { type: "authentication_error", message: "Not authenticated" } },
      401
    );
  }

  // Stash user on the context so downstream handlers can avoid a second DB lookup
  c.set("user" as never, user as never);
  return next();
}
