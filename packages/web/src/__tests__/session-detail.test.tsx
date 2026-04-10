import { render, screen, waitFor } from "@testing-library/react";
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
});
