import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { verifyCredentials, createSession, deleteSession, validateSession, changePassword } from "../lib/auth-session.js";

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

    const token = createSession(user.id);
    setCookie(c, "oma_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return c.json({ user }, 200);
  });

  app.openapi(logoutRoute, (c) => {
    const token = getCookie(c, "oma_session");
    if (token) {
      deleteSession(token);
    }
    deleteCookie(c, "oma_session", { path: "/" });
    return c.json({ ok: true }, 200);
  });

  app.openapi(meRoute, (c) => {
    const token = getCookie(c, "oma_session");
    const user = validateSession(token);
    return c.json({ user }, 200);
  });

  app.openapi(changePasswordRoute, async (c) => {
    const token = getCookie(c, "oma_session");
    const user = validateSession(token);
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
