import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentsListPage } from "../pages/agents-list";

// Mock the api module
vi.mock("../lib/api", () => ({
  listAgents: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage(initialRoute = "/agents") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AgentsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AgentsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and subtitle", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByText("Create and manage autonomous agents.")
    ).toBeInTheDocument();
  });

  it("shows New agent button", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("New agent")).toBeInTheDocument();
  });

  it("shows Go to agent ID input", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByPlaceholderText("Go to agent ID")).toBeInTheDocument();
  });

  it("shows empty state when no agents exist", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No agents yet")).toBeInTheDocument();
    });

    expect(screen.getByText("Get started with agents")).toBeInTheDocument();
  });

  it("shows table headers", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Last updated")).toBeInTheDocument();
  });

  it("renders agents in the table", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [
        {
          id: "agent_001",
          name: "My Agent",
          model: { id: "claude-sonnet-4-6" },
          version: 1,
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
          archived_at: null,
        },
      ] as any,
      has_more: false,
      first_id: "agent_001",
      last_id: "agent_001",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("My Agent")).toBeInTheDocument();
    });

    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows Show archived toggle", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Show archived")).toBeInTheDocument();
  });

  it("has disabled pagination buttons when no data", async () => {
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Previous page").closest("button")).toBeDisabled();
      expect(screen.getByText("Next page").closest("button")).toBeDisabled();
    });
  });
});
