import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { verifyCredentials, createSession, deleteSession, validateSession, changePassword } from "../lib/auth-session.js";
import { getDB } from "../db/index.js";

const tags = ["Auth"];

const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  organization_id: z.string().nullable(),
});

const loginRoute = createRoute({
  method: "post",
  path: "/v1/auth/login",
  tags,
  summary: "Login with email and password",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            email: z.string(),
            password: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Login successful",
      content: { "application/json": { schema: z.object({ user: UserSchema }) } },
    },
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/v1/auth/logout",
  tags,
  summary: "Logout",
  responses: {
    200: {
      description: "Logged out",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/v1/auth/me",
  tags,
  summary: "Get current user",
  responses: {
    200: {
      description: "Current user",
      content: { "application/json": { schema: z.object({ user: UserSchema.nullable() }) } },
    },
  },
});

const SSOProviderSchema = z.object({
  organization_id: z.string(),
  organization_name: z.string(),
  organization_slug: z.string(),
  provider: z.string(),
  login_url: z.string().nullable(),
});

const listSSOProvidersRoute = createRoute({
  method: "get",
  path: "/v1/auth/sso-providers",
  tags,
  summary: "List configured SSO providers",
  responses: {
    200: {
      description: "SSO providers configured per organization",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(SSOProviderSchema) }),
        },
      },
    },
  },
});

const changePasswordRoute = createRoute({
  method: "post",
  path: "/v1/auth/change-password",
  tags,
  summary: "Change password",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            current_password: z.string(),
            new_password: z.string().min(6),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password changed",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

export function registerAuthRoutes(app: OpenAPIHono) {
  app.openapi(loginRoute, async (c) => {
    const { email, password } = c.req.valid("json") as any;
    const user = await verifyCredentials(email, password);
    if (!user) {
      throw Object.assign(new Error("Invalid credentials"), { status: 401, type: "authentication_error" });
    }

    const token = await createSession(user.id);
    setCookie(c, "oma_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return c.json({ user }, 200);
  });

  app.openapi(logoutRoute, async (c) => {
    const token = getCookie(c, "oma_session");
    if (token) {
      await deleteSession(token);
    }
    deleteCookie(c, "oma_session", { path: "/" });
    return c.json({ ok: true }, 200);
  });

  app.openapi(meRoute, async (c) => {
    const token = getCookie(c, "oma_session");
    const user = await validateSession(token);
    return c.json({ user }, 200);
  });

  app.openapi(listSSOProvidersRoute, async (c) => {
    const db = await getDB();
    // Only orgs with a non-null sso_provider are exposed. sso_config
    // is deliberately NOT returned — it may contain secret fields
    // like client_secret_env. Only a derived login_url (if the
    // config supplies one) is exposed so the web login page can
    // render a "Sign in with X" button.
    const rows = await db.all<any>(
      `SELECT id, name, slug, sso_provider, sso_config
       FROM organizations
       WHERE sso_provider IS NOT NULL`
    );
    const data = rows.map((row) => {
      let loginUrl: string | null = null;
      if (row.sso_config) {
        try {
          const cfg = JSON.parse(row.sso_config) as Record<string, unknown>;
          if (typeof cfg.login_url === "string") loginUrl = cfg.login_url;
        } catch {
          // malformed config — ignore, don't leak the raw blob
        }
      }
      return {
        organization_id: row.id,
        organization_name: row.name,
        organization_slug: row.slug,
        provider: row.sso_provider,
        login_url: loginUrl,
      };
    });
    return c.json({ data }, 200);
  });

  app.openapi(changePasswordRoute, async (c) => {
    const token = getCookie(c, "oma_session");
    const user = await validateSession(token);
    if (!user) {
      throw Object.assign(new Error("Not authenticated"), { status: 401, type: "authentication_error" });
    }

    const { current_password, new_password } = c.req.valid("json") as any;
    const valid = await verifyCredentials(user.email, current_password);
    if (!valid) {
      throw Object.assign(new Error("Current password is incorrect"), { status: 400, type: "invalid_request_error" });
    }

    await changePassword(user.id, new_password);
    return c.json({ ok: true }, 200);
  });
}
