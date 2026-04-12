/**
 * Unit tests for buildMessagesFromEvents() skip-pending logic.
 *
 * Verifies that agent.tool_use entries with evaluated_permission="pending"
 * are excluded from the LLM message history, while allowed/denied entries
 * are included.
 *
 * Uses a direct unit test approach: mock getDB() to return synthetic event
 * rows, call the function, assert the returned messages.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

const tmpDir = mkdtempSync(join(tmpdir(), "oma-build-messages-test-"));
process.env.DATABASE_PATH = join(tmpDir, "oma.db");
process.env.AUTH_ENABLED = "***";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const mockDB = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getDB: async () => mockDB,
}));

// Import after vi.mock is set up
const { buildMessagesFromEvents } = await import("../engine/index.js");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeAll(() => {
  vi.restoreAllMocks();
});

describe("buildMessagesFromEvents — skip pending tool_use entries", () => {
  it("skips agent.tool_use with evaluated_permission=pending", async () => {
    const events = [
      { type: "user.message", data: JSON.stringify({ content: [{ type: "text", text: "do it" }] }) },
      { type: "agent.message", data: JSON.stringify({ content: [{ type: "text", text: "I'll help with that" }] }) },
      // pending tool_use — should be skipped
      {
        type: "agent.tool_use",
        data: JSON.stringify({
          tool_use_id: "pending_tool",
          name: "mcp_github_create_issue",
          input: { title: "bug" },
          evaluated_permission: "pending",
        }),
      },
    ];
    mockDB.all.mockResolvedValueOnce(events);

    const messages = await buildMessagesFromEvents("sess_pending");

    // Should have user message and agent message, but NOT the pending tool_use
    const roles = messages.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    // No pending tool_use in the assistant message
    const assistant = messages.find((m) => m.role === "assistant");
    if (Array.isArray(assistant?.content)) {
      const toolNames = assistant.content
        .filter((b) => b.type === "tool_use")
        .map((b) => b.name);
      expect(toolNames).not.toContain("mcp_github_create_issue");
    }
  });

  it("includes agent.tool_use with evaluated_permission=allow", async () => {
    const events = [
      { type: "user.message", data: JSON.stringify({ content: [{ type: "text", text: "list issues" }] }) },
      { type: "agent.message", data: JSON.stringify({ content: [{ type: "text", text: "Fetching issues..." }] }) },
      {
        type: "agent.tool_use",
        data: JSON.stringify({
          tool_use_id: "allowed_tool",
          name: "mcp_github_list_issues",
          input: {},
          evaluated_permission: "allow",
        }),
      },
      {
        type: "agent.tool_result",
        data: JSON.stringify({
          tool_use_id: "allowed_tool",
          content: [{ type: "text", text: "2 issues found" }],
          is_error: false,
        }),
      },
    ];
    mockDB.all.mockResolvedValueOnce(events);

    const messages = await buildMessagesFromEvents("sess_allow");

    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    if (Array.isArray(assistant?.content)) {
      const toolNames = assistant.content
        .filter((b) => b.type === "tool_use")
        .map((b) => b.name);
      expect(toolNames).toContain("mcp_github_list_issues");
    }
  });

  it("skips multiple pending tools, includes allowed ones", async () => {
    const events = [
      { type: "user.message", data: JSON.stringify({ content: [{ type: "text", text: "hi" }] }) },
      {
        type: "agent.tool_use",
        data: JSON.stringify({
          tool_use_id: "p1",
          name: "mcp_slack_send_message",
          input: { text: "hello" },
          evaluated_permission: "pending",
        }),
      },
      {
        type: "agent.tool_use",
        data: JSON.stringify({
          tool_use_id: "a1",
          name: "mcp_github_list_issues",
          input: {},
          evaluated_permission: "allow",
        }),
      },
      {
        type: "agent.tool_use",
        data: JSON.stringify({
          tool_use_id: "p2",
          name: "mcp_slack_upload",
          input: {},
          evaluated_permission: "pending",
        }),
      },
    ];
    mockDB.all.mockResolvedValueOnce(events);

    const messages = await buildMessagesFromEvents("sess_mixed");

    // Only the allowed tool should appear
    const allToolNames: string[] = [];
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_use") allToolNames.push(block.name as string);
        }
      }
    }
    expect(allToolNames).toContain("mcp_github_list_issues");
    expect(allToolNames).not.toContain("mcp_slack_send_message");
    expect(allToolNames).not.toContain("mcp_slack_upload");
  });

  it("agent.tool_result is always included regardless of evaluated_permission", async () => {
    const events = [
      { type: "user.message", data: JSON.stringify({ content: [{ type: "text", text: "hi" }] }) },
      {
        type: "agent.tool_result",
        data: JSON.stringify({
          tool_use_id: "denied_result",
          content: [{ type: "text", text: "Tool execution was denied by the user." }],
          is_error: true,
        }),
      },
    ];
    mockDB.all.mockResolvedValueOnce(events);

    const messages = await buildMessagesFromEvents("sess_deny_result");

    const toolResults = messages
      .filter((m) => m.role === "user")
      .flatMap((m) =>
        Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result") : []
      );

    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as any).is_error).toBe(true);
    expect((toolResults[0] as any).content).toContain("denied");
  });
});
