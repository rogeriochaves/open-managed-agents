import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionsListPage } from "../pages/sessions-list";

vi.mock("../lib/api", () => ({
  listSessions: vi.fn(),
  listAgents: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/sessions"]}>
        <SessionsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SessionsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAgents).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
  });

  it("renders heading and subtitle", async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(
      screen.getByText("Trace and debug Claude Managed Agents sessions.")
    ).toBeInTheDocument();
  });

  it("shows New session button", async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();
    expect(screen.getByText("New session")).toBeInTheDocument();
  });

  it("shows empty state when no sessions", async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No sessions yet")).toBeInTheDocument();
    });
  });

  it("shows table headers including checkbox", async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByLabelText("Select all rows")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("shows Go to session ID input", async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByPlaceholderText("Go to session ID")).toBeInTheDocument();
  });

  it("renders sessions with status badges", async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      data: [
        {
          id: "sesn_001",
          title: "Test Session",
          status: "idle",
          agent: { id: "agent_001", name: "My Agent" },
          created_at: "2026-04-01T00:00:00Z",
          archived_at: null,
        },
      ] as any,
      has_more: false,
      first_id: "sesn_001",
      last_id: "sesn_001",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test Session")).toBeInTheDocument();
    });
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("My Agent")).toBeInTheDocument();
  });
});
