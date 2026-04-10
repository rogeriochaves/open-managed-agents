import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentDetailPage } from "../pages/agent-detail";

vi.mock("../lib/api", () => ({
  getAgent: vi.fn(),
  updateAgent: vi.fn(),
  archiveAgent: vi.fn(),
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

  it("shows an Edit button next to Archive on an active agent", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
  });

  it("swaps the config view for form inputs when Edit is clicked", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test Agent")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Edit/i }));

    // Form fields appear
    expect(screen.getByDisplayValue("Test Agent")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A test agent")).toBeInTheDocument();
    expect(screen.getByDisplayValue("You are helpful.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("claude-sonnet-4-6")).toBeInTheDocument();
    // Save + Cancel replace Edit + Archive
    expect(
      screen.getByRole("button", { name: /Save changes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancel/i }),
    ).toBeInTheDocument();
  });

  it("calls api.updateAgent with the edited values on Save", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    vi.mocked(api.updateAgent).mockResolvedValue({
      ...mockAgent,
      name: "Renamed Agent",
      description: "Updated desc",
    } as any);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test Agent")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Edit/i }));

    const nameInput = screen.getByDisplayValue("Test Agent");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed Agent");

    const descInput = screen.getByDisplayValue("A test agent");
    await user.clear(descInput);
    await user.type(descInput, "Updated desc");

    await user.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        "agent_test123",
        expect.objectContaining({
          name: "Renamed Agent",
          description: "Updated desc",
          system: "You are helpful.",
          model: "claude-sonnet-4-6",
        }),
      );
    });
  });

  it("reverts unsaved changes on Cancel", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Test Agent")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Edit/i }));

    const nameInput = screen.getByDisplayValue("Test Agent");
    await user.clear(nameInput);
    await user.type(nameInput, "Discarded");

    await user.click(screen.getByRole("button", { name: /Cancel/i }));

    // Back to read-only view, Edit is visible again
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
    });
    expect(api.updateAgent).not.toHaveBeenCalled();
  });

  it("calls api.archiveAgent on Archive click when the user confirms", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    vi.mocked(api.archiveAgent).mockResolvedValue(undefined as any);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Archive/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.archiveAgent).toHaveBeenCalledWith("agent_test123");
    });
    confirmSpy.mockRestore();
  });

  it("does NOT call api.archiveAgent when the user cancels the confirm", async () => {
    vi.mocked(api.getAgent).mockResolvedValue(mockAgent);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Archive/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.archiveAgent).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
