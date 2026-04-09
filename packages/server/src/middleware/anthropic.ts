import Anthropic from "@anthropic-ai/sdk";
import { createMiddleware } from "hono/factory";
import { resolveAuth, getApiKeyForRequest, type AuthConfig } from "../lib/auth.js";

type AnthropicEnv = {
  Variables: {
    anthropic: Anthropic;
  };
};

// Resolve auth once at startup
let authConfig: AuthConfig | null = null;

function getAuth(): AuthConfig {
  if (!authConfig) {
    authConfig = resolveAuth();
    if (authConfig.source !== "none") {
      console.log(`Auth: using ${authConfig.source}`);
    }
  }
  return authConfig;
}

export const anthropicMiddleware = createMiddleware<AnthropicEnv>(
  async (c, next) => {
    const auth = getAuth();
    const apiKey = getApiKeyForRequest(
      c.req.header("x-api-key"),
      auth
    );

    if (!apiKey) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message:
              "No API key provided. Set ANTHROPIC_API_KEY in .env, pass x-api-key header, or configure Claude Code auth.",
          },
        },
        401
      );
    }

    const client = new Anthropic({
      apiKey,
      defaultHeaders: {
        "anthropic-beta": "managed-agents-2026-04-01",
      },
    });

    c.set("anthropic", client);

    await next();
  }
);
