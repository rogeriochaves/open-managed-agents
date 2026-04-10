import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionsListPage } from "../pages/sessions-list";

vi.mock("../lib/api", () => ({
  listSessions: vi.fn(),
  listAgents: vi.fn(),
  archiveSession: vi.fn(),
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
      screen.getByText(
        "Trace and debug agent sessions — every turn, tool call, and token.",
      ),
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

  // ── Bulk archive ────────────────────────────────────────────────────
  // The multi-select checkboxes existed in the UI from day one but
  // weren't wired to anything — checking rows did nothing. These
  // tests lock in the bulk archive behavior so the feature can't
  // silently regress back to dead-UI.

  const twoRows = {
    data: [
      {
        id: "sesn_001",
        title: "First",
        status: "idle",
        agent: { id: "agent_1", name: "Agent A" },
        created_at: "2026-04-01T00:00:00Z",
        archived_at: null,
      },
      {
        id: "sesn_002",
        title: "Second",
        status: "idle",
        agent: { id: "agent_1", name: "Agent A" },
        created_at: "2026-04-02T00:00:00Z",
        archived_at: null,
      },
    ] as any,
    has_more: false,
    first_id: "sesn_001",
    last_id: "sesn_002",
  };

  it("does NOT show the Archive bulk button when nothing is selected", async () => {
    vi.mocked(api.listSessions).mockResolvedValue(twoRows);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Archive \d+ selected/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Archive N selected' after checking a row", async () => {
    vi.mocked(api.listSessions).mockResolvedValue(twoRows);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    // Grab the checkbox inside the first row directly rather than
    // relying on document-order indexing — the filter bar has its
    // own "Show archived" checkbox that sits ahead of the table.
    const firstRow = screen.getByText("First").closest("tr")!;
    const rowCheckbox = firstRow.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    await user.click(rowCheckbox);

    expect(
      screen.getByRole("button", { name: /Archive 1 selected/i }),
    ).toBeInTheDocument();
  });

  it("selectAll checks every row and Archive N reflects the count", async () => {
    vi.mocked(api.listSessions).mockResolvedValue(twoRows);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Select all rows"));

    expect(
      screen.getByRole("button", { name: /Archive 2 selected/i }),
    ).toBeInTheDocument();
  });

  it("calls api.archiveSession for each selected row on confirm", async () => {
    vi.mocked(api.listSessions).mockResolvedValue(twoRows);
    vi.mocked(api.archiveSession).mockResolvedValue({} as any);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Select all rows"));
    await user.click(
      screen.getByRole("button", { name: /Archive 2 selected/i }),
    );

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.archiveSession).toHaveBeenCalledTimes(2);
    });
    expect(api.archiveSession).toHaveBeenCalledWith("sesn_001");
    expect(api.archiveSession).toHaveBeenCalledWith("sesn_002");
    confirmSpy.mockRestore();
  });

  it("does NOT archive when the user cancels the confirm", async () => {
    vi.mocked(api.listSessions).mockResolvedValue(twoRows);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Select all rows"));
    await user.click(
      screen.getByRole("button", { name: /Archive 2 selected/i }),
    );

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.archiveSession).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("clicking a row checkbox does NOT navigate to the session", async () => {
    vi.mocked(api.listSessions).mockResolvedValue(twoRows);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    const firstRow = screen.getByText("First").closest("tr")!;
    const rowCheckbox = firstRow.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    await user.click(rowCheckbox);

    // Still on the sessions list — the bulk button appeared, which
    // proves the checkbox toggled state AND the row click handler
    // was stopped by the inner stopPropagation. If navigation had
    // fired we'd be on /sessions/sesn_001 and the "Archive N" button
    // would not be in the DOM because the list would be unmounted.
    expect(
      screen.getByRole("button", { name: /Archive 1 selected/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
  });
});
