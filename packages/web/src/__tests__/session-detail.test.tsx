import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionDetailPage } from "../pages/session-detail";

vi.mock("../lib/api", () => ({
  getSession: vi.fn(),
  listSessionEvents: vi.fn(),
  sendSessionEvents: vi.fn(),
  streamSessionEvents: vi.fn(() => ({ close: vi.fn() })),
}));

import * as api from "../lib/api";

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

function renderPage(sessionId = "sesn_test123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/sessions/${sessionId}`]}>
        <Routes>
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SessionDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no events", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: "sesn_test123",
      type: "session",
      title: "Test Session",
      status: "idle",
      agent: { id: "agent_1", type: "agent", name: "Test Agent", description: null, system: null, model: { id: "claude-sonnet-4-6" }, tools: [], mcp_servers: [], skills: [], version: 1 },
      environment_id: "env_1",
      resources: [],
      usage: {},
      stats: {},
      metadata: {},
      vault_ids: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      archived_at: null,
    });

    vi.mocked(api.listSessionEvents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No events yet/)).toBeInTheDocument();
    });
  });

  it("shows session title and status", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: "sesn_test123",
      type: "session",
      title: "My Test Session",
      status: "idle",
      agent: { id: "agent_1", type: "agent", name: "Test Agent", description: null, system: null, model: { id: "claude-sonnet-4-6" }, tools: [], mcp_servers: [], skills: [], version: 1 },
      environment_id: "env_1",
      resources: [],
      usage: { input_tokens: 500, output_tokens: 100 },
      stats: { active_seconds: 5 },
      metadata: {},
      vault_ids: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      archived_at: null,
    });

    vi.mocked(api.listSessionEvents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("My Test Session")).toBeInTheDocument();
    });
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("Test Agent")).toBeInTheDocument();
  });

  it("renders events in transcript mode", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: "sesn_test123",
      type: "session",
      title: "Test",
      status: "idle",
      agent: { id: "agent_1", type: "agent", name: "Agent", description: null, system: null, model: { id: "claude-sonnet-4-6" }, tools: [], mcp_servers: [], skills: [], version: 1 },
      environment_id: "env_1",
      resources: [],
      usage: {},
      stats: {},
      metadata: {},
      vault_ids: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      archived_at: null,
    });

    // Mock the SSE stream to immediately deliver the events via the callback.
    vi.mocked(api.streamSessionEvents).mockImplementation(
      (_id, onEvent) => {
        onEvent({
          id: "evt_1",
          type: "user.message",
          content: [{ type: "text", text: "Hello agent" }],
          processed_at: "2026-04-01T00:00:01Z",
        } as any);
        onEvent({
          id: "evt_2",
          type: "agent.message",
          content: [{ type: "text", text: "Hello there!" }],
          processed_at: "2026-04-01T00:00:05Z",
        } as any);
        return { close: vi.fn() };
      }
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Hello agent")).toBeInTheDocument();
    });
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
  });

  it("shows transcript/debug toggle", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: "sesn_test123",
      type: "session",
      title: "Test",
      status: "idle",
      agent: { id: "agent_1", type: "agent", name: "Agent", description: null, system: null, model: { id: "claude-sonnet-4-6" }, tools: [], mcp_servers: [], skills: [], version: 1 },
      environment_id: "env_1",
      resources: [],
      usage: {},
      stats: {},
      metadata: {},
      vault_ids: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      archived_at: null,
    });

    vi.mocked(api.listSessionEvents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("transcript")).toBeInTheDocument();
    expect(screen.getByText("debug")).toBeInTheDocument();
  });

  it("shows message input for non-terminated sessions", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: "sesn_test123",
      type: "session",
      title: "Test",
      status: "idle",
      agent: { id: "agent_1", type: "agent", name: "Agent", description: null, system: null, model: { id: "claude-sonnet-4-6" }, tools: [], mcp_servers: [], skills: [], version: 1 },
      environment_id: "env_1",
      resources: [],
      usage: {},
      stats: {},
      metadata: {},
      vault_ids: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      archived_at: null,
    });

    vi.mocked(api.listSessionEvents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(
      screen.getByPlaceholderText("Send a message to the agent")
    ).toBeInTheDocument();
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("calls api.sendSessionEvents when the Send button is clicked", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: "sesn_test123",
      type: "session",
      title: "Test",
      status: "idle",
      agent: {
        id: "agent_1",
        type: "agent",
        name: "Agent",
        description: null,
        system: null,
        model: { id: "claude-sonnet-4-6" },
        tools: [],
        mcp_servers: [],
        skills: [],
        version: 1,
      },
      environment_id: "env_1",
      resources: [],
      usage: {},
      stats: {},
      metadata: {},
      vault_ids: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      archived_at: null,
    });
    vi.mocked(api.listSessionEvents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
    vi.mocked(api.sendSessionEvents).mockResolvedValue({
      data: [],
    } as any);

    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByPlaceholderText(
      "Send a message to the agent",
    );
    await user.type(textarea, "Hello from the test");

    // There's only one Send button on this page
    await user.click(screen.getByRole("button", { name: /^Send$/ }));

    await waitFor(() => {
      expect(api.sendSessionEvents).toHaveBeenCalledWith("sesn_test123", {
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text: "Hello from the test" }],
          },
        ],
      });
    });

    // The composer clears after a successful send so the user can
    // type the next turn without deleting their previous prompt.
    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  // ── Tool result linkage (tool_use ↔ tool_result) ────────────────────
  // Debug tracing improvements: the transcript must pair each
  // agent.tool_result with its matching agent.tool_use so the row
  // shows the tool name, the execution duration, and a red "Error"
  // badge when is_error: true. Before this pairing the page showed
  // just the raw content concatenation with the default badge, so
  // a silently failed tool call looked identical to a successful
  // one (the primary QA pain point).

  const baseSession = {
    id: "sesn_test123",
    type: "session" as const,
    title: "Tool pairing test",
    status: "idle" as const,
    agent: {
      id: "agent_1",
      type: "agent" as const,
      name: "Agent",
      description: null,
      system: null,
      model: { id: "claude-sonnet-4-6" },
      tools: [],
      mcp_servers: [],
      skills: [],
      version: 1,
    },
    environment_id: "env_1",
    resources: [],
    usage: {},
    stats: {},
    metadata: {},
    vault_ids: [],
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    archived_at: null,
  };

  it("renders a red Error badge when agent.tool_result has is_error=true", async () => {
    vi.mocked(api.getSession).mockResolvedValue(baseSession as any);
    vi.mocked(api.streamSessionEvents).mockImplementation((_id, onEvent) => {
      onEvent({
        id: "evt_tu",
        type: "agent.tool_use",
        name: "web_fetch",
        input: { url: "https://broken.example" },
        processed_at: "2026-04-01T00:00:01Z",
      } as any);
      onEvent({
        id: "evt_tr",
        type: "agent.tool_result",
        tool_use_id: "evt_tu",
        content: [
          { type: "text", text: "Failed to fetch https://broken.example" },
        ],
        is_error: true,
        processed_at: "2026-04-01T00:00:03Z",
      } as any);
      return { close: vi.fn() };
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to fetch https:\/\/broken.example/),
      ).toBeInTheDocument();
    });
    // The tool_result row in the transcript carries an "Error" badge
    // in place of the default "Result" badge.
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows the matching tool_use name as a prefix on tool_result rows", async () => {
    vi.mocked(api.getSession).mockResolvedValue(baseSession as any);
    vi.mocked(api.streamSessionEvents).mockImplementation((_id, onEvent) => {
      onEvent({
        id: "evt_tu",
        type: "agent.tool_use",
        name: "web_search",
        input: { query: "weather" },
        processed_at: "2026-04-01T00:00:01Z",
      } as any);
      onEvent({
        id: "evt_tr",
        type: "agent.tool_result",
        tool_use_id: "evt_tu",
        content: [{ type: "text", text: "Sunny, 22°C" }],
        processed_at: "2026-04-01T00:00:02.500Z",
      } as any);
      return { close: vi.fn() };
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Sunny, 22°C")).toBeInTheDocument();
    });
    // Prefix line shows the tool name the result is for
    expect(screen.getByText("→ web_search")).toBeInTheDocument();
  });

  it("shows the tool duration (end - start) on the tool_result row", async () => {
    vi.mocked(api.getSession).mockResolvedValue(baseSession as any);
    vi.mocked(api.streamSessionEvents).mockImplementation((_id, onEvent) => {
      onEvent({
        id: "evt_tu",
        type: "agent.tool_use",
        name: "slow_tool",
        input: {},
        processed_at: "2026-04-01T00:00:00.000Z",
      } as any);
      onEvent({
        id: "evt_tr",
        type: "agent.tool_result",
        tool_use_id: "evt_tu",
        content: [{ type: "text", text: "done" }],
        processed_at: "2026-04-01T00:00:02.500Z",
      } as any);
      return { close: vi.fn() };
    });

    renderPage();

    // 2.5s formatted as "2.5s"
    await waitFor(() => {
      expect(screen.getByText("2.5s")).toBeInTheDocument();
    });
  });

  it("degrades gracefully when a tool_result has no matching tool_use", async () => {
    vi.mocked(api.getSession).mockResolvedValue(baseSession as any);
    vi.mocked(api.streamSessionEvents).mockImplementation((_id, onEvent) => {
      // Orphan result — no matching tool_use was ever streamed
      onEvent({
        id: "evt_orphan",
        type: "agent.tool_result",
        tool_use_id: "nonexistent",
        content: [{ type: "text", text: "orphan result" }],
        processed_at: "2026-04-01T00:00:05Z",
      } as any);
      return { close: vi.fn() };
    });

    renderPage();

    // Content still renders, no crash
    await waitFor(() => {
      expect(screen.getByText("orphan result")).toBeInTheDocument();
    });
    // No "→ <name>" prefix since we don't know the tool name
    expect(screen.queryByText(/^→ /)).not.toBeInTheDocument();
  });

  it("downloads the events JSON when the Download button is clicked", async () => {
    vi.mocked(api.getSession).mockResolvedValue(baseSession as any);
    vi.mocked(api.streamSessionEvents).mockImplementation((_id, onEvent) => {
      onEvent({
        id: "evt_1",
        type: "user.message",
        content: [{ type: "text", text: "hello" }],
        processed_at: "2026-04-01T00:00:01Z",
      } as any);
      return { close: vi.fn() };
    });

    // Stub the DOM bits the download handler touches
    const createObjectURL = vi.fn(() => "blob:stub");
    const revokeObjectURL = vi.fn();
    (globalThis as any).URL.createObjectURL = createObjectURL;
    (globalThis as any).URL.revokeObjectURL = revokeObjectURL;
    const anchorClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "a") {
          (el as HTMLAnchorElement).click = anchorClick;
        }
        return el;
      });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("hello")).toBeInTheDocument();
    });

    await user.click(
      screen.getByTitle(/Download events JSON/i).closest("button")!,
    );

    expect(createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:stub");

    createElementSpy.mockRestore();
  });
});
