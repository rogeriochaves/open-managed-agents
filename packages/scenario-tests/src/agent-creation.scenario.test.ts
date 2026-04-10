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

// Use OpenAI directly via the ai-sdk (not the Vercel AI Gateway)
const judgeModel = openai("gpt-5-mini");

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

  async call(input: AgentInput): Promise<AgentReturnTypes> {
    // First user message: create agent and session
    if (!this.sessionId) {
      const agentRes = await fetch(`${API_BASE}/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "scenario-test-agent",
          description: "Agent created by LangWatch Scenario test",
          model: "claude-sonnet-4-6",
          system:
            "You are a helpful assistant. Give clear, direct, accurate answers.",
        }),
      });
      if (!agentRes.ok) {
        throw new Error(`Failed to create agent: ${agentRes.status} ${await agentRes.text()}`);
      }
      const agentData = (await agentRes.json()) as { id: string };
      this.agentId = agentData.id;

      const sessionRes = await fetch(`${API_BASE}/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Send the message to the session
    const sendRes = await fetch(
      `${API_BASE}/v1/sessions/${this.sessionId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        `${API_BASE}/v1/sessions/${this.sessionId}/events?order=asc&limit=200`
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

      expect(result.success).toBe(true);
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
        script: [
          scenario.user("I need help with a programming question"),
          scenario.agent(),
          scenario.proceed(3),
          scenario.judge(),
        ],
        maxTurns: 8,
      });

      expect(result.success).toBe(true);
    },
    180_000
  );
});
