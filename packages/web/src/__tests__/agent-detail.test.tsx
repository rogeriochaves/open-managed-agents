import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentDetailPage } from "../pages/agent-detail";

vi.mock("../lib/api", () => ({
  getAgent: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage(agentId = "agent_test123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/agents/${agentId}`]}>
        <Routes>
          <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockAgent = {
  id: "agent_test123",
  type: "agent" as const,
  name: "Test Agent",
  description: "A test agent",
  system: "You are helpful.",
  model: { id: "claude-sonnet-4-6", speed: "standard" as const },
  tools: [{ type: "agent_toolset_20260401" as const, configs: [], default_config: { enabled: true, permission_policy: { type: "always_allow" as const } } }],
  mcp_servers: [],
  skills: [],
  metadata: {},
  version: 1,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T12:00:00Z",
  archived_at: null,
};

describe("AgentDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state", () => {
    vi.mocked(api.getAgent).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading agent...")).toBeInTheDocument();
  });

  it("shows agent name", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Test Agent")).toBeInTheDocument();
    });
  });

  it("shows active status badge", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("active")).toBeInTheDocument();
    });
  });

  it("shows version and model", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("v1")).toBeInTheDocument();
    });
    expect(screen.getAllByText("claude-sonnet-4-6").length).toBeGreaterThan(0);
  });

  it("shows yaml and json tabs", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("yaml")).toBeInTheDocument();
    });
    expect(screen.getByText("json")).toBeInTheDocument();
  });

  it("shows Copy code button", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Copy code")).toBeInTheDocument();
    });
  });

  it("shows agent ID in details sidebar", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Agent ID")).toBeInTheDocument();
    });
    // Agent ID appears multiple times (header + sidebar)
    expect(screen.getAllByText("agent_test123").length).toBeGreaterThan(0);
  });

  it("shows Archive button", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Archive")).toBeInTheDocument();
    });
  });

  it("shows YAML config content", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/name: Test Agent/)).toBeInTheDocument();
    });
  });

  it("shows details sidebar fields", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Agent ID")).toBeInTheDocument();
    });
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });
});
