/**
 * LangWatch Scenario test for agent creation flow.
 *
 * Validates that the Open Managed Agents platform can:
 * 1. Create an agent via POST /v1/agents
 * 2. Create a session for that agent
 * 3. Send a user message and get a real LLM response back
 * 4. Stream events correctly
 *
 * Uses @langwatch/scenario to simulate a realistic user interaction
 * and have a judge agent verify the output matches expectations.
 *
 * Requires the server to be running on http://localhost:3001.
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Load .env from project root
for (const p of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

import * as scenario from "@langwatch/scenario";
import type { AgentInput, AgentReturnTypes } from "@langwatch/scenario";
import { openai } from "@ai-sdk/openai";
import { describe, it, expect } from "vitest";

const API_BASE = process.env.OMA_API_BASE ?? "http://localhost:3001";
const ADMIN_EMAIL = process.env.OMA_ADMIN_EMAIL ?? "admin@localhost";
const ADMIN_PASSWORD = process.env.OMA_ADMIN_PASSWORD ?? "admin";

// Use OpenAI directly via the ai-sdk (not the Vercel AI Gateway)
const judgeModel = openai("gpt-5-mini");

/**
 * Log in against the running server and return a Cookie header value
 * so subsequent requests land authenticated. The server has auth
 * enabled by default; without this, every adapter call 401s.
 */
async function loginAndGetCookie(): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Login failed: ${res.status} — is the server running and the admin password correct?`,
    );
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/oma_session=([^;]+)/);
  if (!match) {
    throw new Error("Login succeeded but no oma_session cookie in response");
  }
  return `oma_session=${match[1]}`;
}

/**
 * Resolve the server's currently-default provider so the scenario
 * test can create agents pointed at whichever backend the user has
 * configured, not a hardcoded Anthropic model. This matters because
 * running scenario tests against a server whose default provider is
 * OpenAI + a hardcoded `claude-sonnet-4-6` model ID would 400 at
 * runtime ("model not found on openai") and make the tests look
 * broken when they're actually pointing at the wrong provider.
 */
async function getDefaultProviderAndModel(
  cookie: string,
): Promise<{ providerId: string; model: string }> {
  const res = await fetch(`${API_BASE}/v1/providers`, {
    headers: { cookie },
  });
  if (!res.ok) {
    throw new Error(`Failed to list providers: ${res.status}`);
  }
  const body = (await res.json()) as {
    data: Array<{
      id: string;
      type: string;
      is_default: boolean;
      default_model: string | null;
      has_api_key: boolean;
    }>;
  };
  const rows = body.data ?? [];
  // Prefer the explicitly-default row. Fall back to any row that
  // actually has credentials configured. Fall back to the first row
  // if nothing else matches.
  const picked =
    rows.find((p) => p.is_default) ??
    rows.find((p) => p.has_api_key) ??
    rows[0];
  if (!picked) {
    throw new Error(
      "No LLM providers configured on the server — cannot run scenario tests.",
    );
  }
  if (!picked.default_model) {
    throw new Error(
      `Provider ${picked.id} has no default_model — configure one under Settings → Providers.`,
    );
  }
  return { providerId: picked.id, model: picked.default_model };
}

/**
 * Adapter that wraps the Open Managed Agents HTTP API as a Scenario agent.
 * Each call creates a fresh agent+session for clean scenario isolation,
 * then sends the user's message and polls for the agent's response.
 */
class OpenManagedAgentAdapter extends scenario.AgentAdapter {
  role = scenario.AgentRole.AGENT;
  name = "OpenManagedAgents";

  private sessionId: string | null = null;
  private agentId: string | null = null;
  private cookie: string | null = null;

  private async authHeaders(): Promise<Record<string, string>> {
    if (!this.cookie) {
      this.cookie = await loginAndGetCookie();
    }
    return { "Content-Type": "application/json", cookie: this.cookie };
  }

  async call(input: AgentInput): Promise<AgentReturnTypes> {
    // First user message: create agent and session
    if (!this.sessionId) {
      const headers = await this.authHeaders();
      // Resolve the default provider + model at runtime so this
      // scenario test works regardless of whether the dev is
      // running with Anthropic, OpenAI, or a local Ollama as the
      // default. Hardcoding "claude-sonnet-4-6" broke the flow
      // the moment OPENAI_API_KEY landed in .env.
      const { providerId, model } = await getDefaultProviderAndModel(this.cookie!);
      const agentRes = await fetch(`${API_BASE}/v1/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "scenario-test-agent",
          description: "Agent created by LangWatch Scenario test",
          model,
          model_provider_id: providerId,
          system: [
            "You are a helpful assistant.",
            "For clear, well-specified questions give a clear, direct, accurate answer.",
            "For ambiguous or under-specified requests (e.g. 'I need help with a programming question' or 'my code doesn't work'), you MUST ask for SPECIFIC details before attempting to help. Always ask at least: (1) the language or stack, (2) the exact error message or unexpected behavior, (3) a minimal code snippet that reproduces the issue. NEVER repeat the same generic 'share your question' prompt — each turn should advance the conversation with concrete asks.",
            "Always stay on topic and keep answers helpful and actionable.",
          ].join(" "),
        }),
      });
      if (!agentRes.ok) {
        throw new Error(`Failed to create agent: ${agentRes.status} ${await agentRes.text()}`);
      }
      const agentData = (await agentRes.json()) as { id: string };
      this.agentId = agentData.id;

      const sessionRes = await fetch(`${API_BASE}/v1/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          agent: this.agentId,
          environment_id: "env_default",
          title: "Scenario test session",
        }),
      });
      if (!sessionRes.ok) {
        throw new Error(`Failed to create session: ${sessionRes.status}`);
      }
      const sessionData = (await sessionRes.json()) as { id: string };
      this.sessionId = sessionData.id;
    }

    // Extract the latest user message text
    const lastUser = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUser) return "";

    const userText =
      typeof lastUser.content === "string"
        ? lastUser.content
        : Array.isArray(lastUser.content)
          ? lastUser.content
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("")
          : "";

    const sendHeaders = await this.authHeaders();
    // Send the message to the session
    const sendRes = await fetch(
      `${API_BASE}/v1/sessions/${this.sessionId}/events`,
      {
        method: "POST",
        headers: sendHeaders,
        body: JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: userText }],
            },
          ],
        }),
      }
    );
    if (!sendRes.ok) {
      throw new Error(`Failed to send message: ${sendRes.status}`);
    }

    // Poll for the agent response (session should go idle after responding)
    const deadline = Date.now() + 30_000;
    let agentResponse = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      const eventsRes = await fetch(
        `${API_BASE}/v1/sessions/${this.sessionId}/events?order=asc&limit=200`,
        { headers: { cookie: this.cookie! } },
      );
      if (!eventsRes.ok) continue;
      const eventsData = (await eventsRes.json()) as { data: any[] };
      const events = eventsData.data ?? [];

      // Check if session went idle after we sent our message
      const idleEvent = events.find((e) => e.type === "session.status_idle");
      if (idleEvent) {
        // Find the most recent agent.message event
        const agentMessages = events.filter((e) => e.type === "agent.message");
        const latest = agentMessages[agentMessages.length - 1];
        if (latest?.content) {
          agentResponse = latest.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("");
          break;
        }
      }
    }

    if (!agentResponse) {
      throw new Error("Agent did not respond within 30s");
    }
    return agentResponse;
  }
}

/**
 * Adapter that wraps the NEW `/v1/agent-builder/chat` endpoint as a
 * Scenario agent. This is the assistant the user talks to on the
 * Quickstart page to iteratively design an agent — distinct from
 * the runtime agent above, which is an already-designed agent
 * answering user questions.
 *
 * Each call accumulates the full conversation + the evolving draft
 * across turns, so the scenario can verify multi-turn refinement
 * end-to-end against the real LLM provider.
 */
interface BuilderDraft {
  name?: string;
  description?: string;
  system?: string;
  mcp_servers?: Array<{ name: string; url?: string; type?: string }>;
}

class AgentBuilderAdapter extends scenario.AgentAdapter {
  role = scenario.AgentRole.AGENT;
  name = "OpenManagedAgents-Builder";

  private cookie: string | null = null;
  private messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  private draft: BuilderDraft = {};
  public lastDone = false;

  private async authHeaders(): Promise<Record<string, string>> {
    if (!this.cookie) {
      this.cookie = await loginAndGetCookie();
    }
    return { "Content-Type": "application/json", cookie: this.cookie };
  }

  async call(input: AgentInput): Promise<AgentReturnTypes> {
    const lastUser = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUser) return "";

    const userText =
      typeof lastUser.content === "string"
        ? lastUser.content
        : Array.isArray(lastUser.content)
          ? lastUser.content
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("")
          : "";

    this.messages.push({ role: "user", content: userText });

    const headers = await this.authHeaders();
    const res = await fetch(`${API_BASE}/v1/agent-builder/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: this.messages,
        draft: this.draft,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `agent-builder/chat failed: ${res.status} ${await res.text()}`,
      );
    }

    const body = (await res.json()) as {
      reply: string;
      draft: BuilderDraft;
      done: boolean;
      provider: { id: string; name: string };
    };

    this.messages.push({ role: "assistant", content: body.reply });
    this.draft = body.draft;
    this.lastDone = body.done;

    // Return both the natural-language reply and the current draft
    // state so the judge can score refinement quality. We inline the
    // draft as a short JSON summary so the judge sees progress even
    // without the fenced block.
    const draftSummary = JSON.stringify({
      name: body.draft.name,
      description: body.draft.description,
      mcp_servers: (body.draft.mcp_servers ?? []).map((s) => s.name),
      done: body.done,
    });
    return `${body.reply}\n\n[internal draft state: ${draftSummary}]`;
  }
}

/**
 * Assert a scenario result passed, and on failure print the judge's
 * reasoning so we can actually see *why* the judge graded it a
 * failure instead of staring at `expected true`.
 */
function expectScenarioSuccess(
  result: { success: boolean; reasoning?: string },
  label: string,
) {
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error(
      `[scenario:${label}] judge verdict = failure. reasoning:\n${
        result.reasoning ?? "(none)"
      }`,
    );
  }
  expect(result.success, `${label}: ${result.reasoning ?? "(no reasoning)"}`).toBe(
    true,
  );
}

describe("LangWatch Scenario: Agent creation flow", () => {
  // Only run if explicitly enabled - requires server + ANTHROPIC_API_KEY + OPENAI for judge
  const ENABLED =
    !!process.env.OMA_SCENARIO_ENABLED && !!process.env.OPENAI_API_KEY;

  it.skipIf(!ENABLED)(
    "agent answers a simple factual question correctly",
    async () => {
      const result = await scenario.run({
        name: "simple-factual-question",
        description:
          "User asks a simple factual question. The agent should respond with an accurate, concise answer.",
        agents: [
          new OpenManagedAgentAdapter(),
          scenario.userSimulatorAgent({
            model: judgeModel,
          }),
          scenario.judgeAgent({
            model: judgeModel,
            criteria: [
              "The agent provides a factually correct answer",
              "The agent's answer is concise and direct",
              "The agent does not refuse to answer",
            ],
          }),
        ],
        script: [
          scenario.user("What is the capital of France? One word answer."),
          scenario.agent(),
          scenario.judge(),
        ],
        maxTurns: 5,
      });

      expectScenarioSuccess(result, "simple-factual");
    },
    120_000
  );

  it.skipIf(!ENABLED)(
    "agent handles a multi-turn clarification dialogue",
    async () => {
      const result = await scenario.run({
        name: "multi-turn-dialogue",
        description:
          "User asks an ambiguous question, the agent should ask for clarification, then give a helpful response.",
        agents: [
          new OpenManagedAgentAdapter(),
          scenario.userSimulatorAgent({
            model: judgeModel,
          }),
          scenario.judgeAgent({
            model: judgeModel,
            criteria: [
              "The agent stays on topic throughout the conversation",
              "The agent provides helpful, relevant responses",
            ],
          }),
        ],
        // NB: each `proceed(n)` spends `n` simulated turns (user + agent
        // pairs), so proceed(3) already eats 6 turns on top of the
        // initial user + agent + judge. `maxTurns` has to be GENEROUSLY
        // larger than that, otherwise the script hits maxTurns before
        // the judge step ever runs and the whole test fails with
        // "Reached end of script without conclusion". Prior versions of
        // this file set maxTurns=8 which left zero headroom — that's
        // the root cause of the "flaky" judge failures.
        script: [
          scenario.user("I need help with a programming question"),
          scenario.agent(),
          scenario.proceed(3),
          scenario.judge(),
        ],
        maxTurns: 20,
      });

      expectScenarioSuccess(result, "multi-turn-clarification");
    },
    180_000
  );

  it.skipIf(!ENABLED)(
    "agent-builder chat iteratively refines a support-agent draft",
    async () => {
      const builder = new AgentBuilderAdapter();

      const result = await scenario.run({
        name: "agent-builder-support-agent",
        description:
          "A non-technical user wants to build a customer support agent that reads from Notion docs and escalates hard questions to Slack. The agent-builder chat should ask one clarifying question at a time, propose sensible defaults (slack + notion connectors), and eventually mark the draft done so the user can click Create agent.",
        agents: [
          builder,
          scenario.userSimulatorAgent({
            model: judgeModel,
          }),
          scenario.judgeAgent({
            model: judgeModel,
            criteria: [
              "The builder asks focused clarifying questions rather than dumping a wall of questions at once",
              "The builder suggests sensible default connectors for a support use case (e.g. Slack, Notion)",
              "The draft agent config evolves coherently across turns (name, description, system prompt get more specific)",
              "By the end of the conversation the builder signals the draft is done (done:true in the internal state)",
              "The builder does not pretend to execute anything — it's designing the agent, not running it",
            ],
          }),
        ],
        // maxTurns budgeted generously above the proceed(4) window so
        // the judge step always gets to run. Setting it to 10 (one
        // above script length) is exactly where the prior
        // "flakiness" was coming from — the script ended before the
        // judge ran and the scenario library returned
        // "Reached end of script without conclusion".
        // Script ends with an explicit "ship it" user turn so the
        // builder's LLM actually emits done=true. Without this, the
        // user simulator keeps iterating and the test fails criterion
        // 4 because the draft never gets marked done.
        script: [
          scenario.user(
            "I want to build a customer support agent that reads our Notion docs and escalates hard questions to Slack",
          ),
          scenario.agent(),
          scenario.proceed(3),
          scenario.user("That looks great — let's ship it!"),
          scenario.agent(),
          scenario.judge(),
        ],
        maxTurns: 25,
      });

      expectScenarioSuccess(result, "agent-builder");
      // Also assert the builder reached done=true on at least one turn.
      // This guards against the LLM being infinitely conversational
      // without ever signaling readiness.
      expect(builder.lastDone).toBe(true);
    },
    240_000,
  );
});
