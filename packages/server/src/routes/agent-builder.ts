/**
 * Agent builder chat endpoint.
 *
 * Drives the "Describe your agent" chat on the Quickstart page. Takes a
 * conversation history plus the current draft agent config, calls the
 * configured default LLM, and returns an assistant reply plus an updated
 * draft.
 *
 * Contract: the model is instructed to *always* return a fenced JSON code
 * block named ```oma-draft at the end of its reply, containing the
 * current best-guess agent spec. The server extracts that block, merges
 * it into the draft, and returns both the natural-language reply (with
 * the fenced block stripped) and the structured draft.
 *
 * This route is *not* a fake — it hits the real default LLM provider.
 * If no provider is configured or the LLM call fails, the route returns
 * 503 so the UI can show a proper "configure a provider first" error.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getProviderConfig } from "./providers.js";
import { createProvider, type ChatMessage } from "../providers/index.js";

const tags = ["Agent Builder"];

// ── Schemas ────────────────────────────────────────────────────────────────

const BuilderMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const BuilderDraftSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  system: z.string().optional(),
  model: z.string().optional(),
  mcp_servers: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
  tools: z.array(z.record(z.unknown())).optional(),
  // Skills are Anthropic-specific capabilities (web_search,
  // code_execution, etc). The authoritative schema downstream
  // (/v1/agents) only accepts `type: "anthropic" | "custom"`,
  // but we accept `string()` here so a non-Anthropic LLM that
  // hallucinates `type: "openai"` doesn't blow up the chat turn.
  // The invalid entries get silently filtered by the builder
  // before they ever reach the create-agent call — see
  // sanitizeDraft() below.
  skills: z
    .array(
      z.object({
        type: z.string(),
        skill_id: z.string(),
      }),
    )
    .optional(),
});

const BuilderChatRequestSchema = z.object({
  messages: z.array(BuilderMessageSchema),
  draft: BuilderDraftSchema.optional(),
  provider_id: z.string().optional(),
  model: z.string().optional(),
});

const BuilderChatResponseSchema = z.object({
  reply: z.string(),
  draft: BuilderDraftSchema,
  done: z.boolean(),
  provider: z.object({ id: z.string(), name: z.string() }),
});

// ── System prompt ──────────────────────────────────────────────────────────

const BUILDER_SYSTEM_PROMPT = `You are the Agent Builder assistant for Open Managed Agents, a self-hostable platform for running LLM agents.

Your job: help a (possibly non-technical) user design an agent by having a short, friendly conversation. You iteratively refine a JSON draft of the agent's configuration based on what they tell you.

Guidelines:
- Be conversational and welcoming. Ask ONE focused question at a time — never a wall of questions.
- Start by understanding what the agent should *do* (the goal), then figure out which tools/connectors it needs, then its tone and any constraints.
- Suggest sensible defaults. If the user says "a support agent", default the connectors to something like Slack + Notion and explain *why*.
- Keep replies short (2-4 sentences typical).
- You are NOT running the agent. You are helping them *design* it. Do not pretend to execute anything.
- When the user seems happy ("looks good", "ship it", "let's go"), set done=true and thank them.

IMPORTANT — Structured output:
At the VERY END of every reply, you MUST emit a fenced code block with the language tag \`oma-draft\` containing the current best-guess agent config as JSON. Do NOT wrap it in any other text after the closing fence.

Schema for the oma-draft block:
{
  "name": "kebab-case-agent-name",
  "description": "one sentence describing what the agent does",
  "system": "the system prompt the agent will run with — can be multi-paragraph",
  "mcp_servers": [{ "name": "slack", "url": "https://mcp.slack.com/sse", "type": "url" }],
  "skills": [],
  "done": false
}

Skills rules (IMPORTANT — read carefully):
- \`skills\` is ONLY for built-in Anthropic capabilities that piggyback on the Anthropic runtime (web_search, code_execution, computer_use, bash, str_replace_editor).
- The ONLY valid values for skill.type are "anthropic" or "custom". NEVER emit "openai", "gemini", "gpt-4o", or any other provider name — those are not skill types and will be rejected.
- Default skills to \`[]\`. Only add an entry when the user has explicitly asked for a capability that maps to one of the Anthropic built-ins, AND you are confident the active provider is Anthropic.
- If you're unsure whether skills apply to the active provider, omit them entirely. MCP connectors via \`mcp_servers\` cover the equivalent functionality on all providers.

Common connectors you can suggest (use these exact URLs):
- slack: https://mcp.slack.com/sse
- notion: https://mcp.notion.com/sse
- linear: https://mcp.linear.app/sse
- github: https://mcp.github.com/sse
- sentry: https://mcp.sentry.io/sse
- posthog: https://mcp.posthog.com/sse
- intercom: https://mcp.intercom.com/sse
- atlassian: https://mcp.atlassian.com/sse
- asana: https://mcp.asana.com/sse
- amplitude: https://mcp.amplitude.com/sse

Only include connectors that make sense for the user's described goal.
For the first turn, if the user has only given you a short description, ask ONE clarifying question AND emit an initial draft guess.
When done=true, your natural-language reply should confirm what you built and invite them to click "Create agent".`;

// ── Draft parsing ──────────────────────────────────────────────────────────

type Draft = z.infer<typeof BuilderDraftSchema>;

interface ParsedReply {
  reply: string;
  draft: Draft;
  done: boolean;
}

/**
 * Drop any skill entries whose `type` isn't one of the values the
 * downstream /v1/agents schema actually accepts. Non-Anthropic
 * LLMs have been observed creatively extending the example in the
 * system prompt (`type: "anthropic"`) to fabricate entries like
 * `type: "openai"` — which then get rejected with a cryptic zod
 * 400 at agent creation time. Silently dropping the invalid ones
 * keeps the build flow unblocked while still honoring any real
 * anthropic/custom skill the LLM correctly suggested.
 */
function sanitizeDraft(draft: Draft): Draft {
  const validSkillTypes = new Set(["anthropic", "custom"]);
  if (!draft.skills) return draft;
  const filtered = draft.skills.filter((s) => validSkillTypes.has(s.type));
  if (filtered.length === draft.skills.length) return draft;
  return { ...draft, skills: filtered };
}

function parseAssistantReply(
  rawText: string,
  previousDraft: Draft,
): ParsedReply {
  const fenceMatch = rawText.match(/```oma-draft\s*\n([\s\S]*?)\n?```/);

  if (!fenceMatch) {
    return { reply: rawText.trim(), draft: previousDraft, done: false };
  }

  const reply = rawText.replace(fenceMatch[0], "").trim();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(fenceMatch[1]!) as Record<string, unknown>;
  } catch {
    return { reply, draft: previousDraft, done: false };
  }

  const done = parsed.done === true;
  delete parsed.done;

  const merged: Draft = sanitizeDraft({
    ...previousDraft,
    ...(parsed as Draft),
  });

  return { reply, draft: merged, done };
}

// ── Route ──────────────────────────────────────────────────────────────────

const chatRoute = createRoute({
  method: "post",
  path: "/v1/agent-builder/chat",
  tags,
  summary:
    "Chat with the agent-builder assistant to iteratively refine a draft agent config",
  request: {
    body: {
      content: {
        "application/json": { schema: BuilderChatRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Assistant reply + updated draft",
      content: {
        "application/json": { schema: BuilderChatResponseSchema },
      },
    },
    503: {
      description: "No LLM provider configured",
      content: {
        "application/json": {
          schema: z.object({
            error: z.object({ type: z.string(), message: z.string() }),
          }),
        },
      },
    },
  },
});

export function registerAgentBuilderRoutes(app: OpenAPIHono) {
  app.openapi(chatRoute, async (c) => {
    const body = c.req.valid("json");

    const providerConfig = await getProviderConfig(body.provider_id);
    if (!providerConfig) {
      return c.json(
        {
          error: {
            type: "provider_not_configured",
            message:
              "No LLM provider is configured. Add one at Settings → Providers or set ANTHROPIC_API_KEY / OPENAI_API_KEY and restart the server.",
          },
        },
        503,
      );
    }

    const provider = createProvider(providerConfig);

    const messages: ChatMessage[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (messages.length === 0) {
      return c.json(
        {
          error: {
            type: "empty_conversation",
            message: "messages[] must contain at least one user message",
          },
        },
        // zod-openapi is strict about response types, so reuse 503 bucket
        503,
      );
    }

    const model = body.model ?? providerConfig.defaultModel ?? "claude-sonnet-4-6";

    const result = await provider.chat({
      model,
      system: BUILDER_SYSTEM_PROMPT,
      messages,
      max_tokens: 2048,
      temperature: 0.4,
    });

    const text = result.content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("\n");

    const parsed = parseAssistantReply(text, body.draft ?? {});

    return c.json(
      {
        reply: parsed.reply,
        draft: parsed.draft,
        done: parsed.done,
        provider: { id: providerConfig.id, name: providerConfig.name },
      },
      200,
    );
  });
}
