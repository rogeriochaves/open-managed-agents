import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnvironmentDetailPage } from "../pages/environment-detail";

vi.mock("../lib/api", () => ({
  getEnvironment: vi.fn(),
  archiveEnvironment: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage(envId = "env_test123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/environments/${envId}`]}>
        <Routes>
          <Route
            path="/environments/:environmentId"
            element={<EnvironmentDetailPage />}
          />
          <Route path="/environments" element={<div>Environments list stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockEnv = {
  id: "env_test123",
  type: "environment" as const,
  name: "Default Cloud",
  description: "Standard cloud sandbox",
  config: {
    type: "cloud" as const,
    networking: { type: "unrestricted" as const },
    packages: {
      type: "packages" as const,
      apt: [],
      cargo: [],
      gem: [],
      go: [],
      npm: ["lodash", "zod"],
      pip: ["requests"],
    },
  },
  metadata: {},
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T12:00:00Z",
  archived_at: null,
};

describe("EnvironmentDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state", () => {
    vi.mocked(api.getEnvironment).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading environment...")).toBeInTheDocument();
  });

  it("shows not-found state when the env query resolves to nothing", async () => {
    vi.mocked(api.getEnvironment).mockRejectedValue(new Error("not found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Environment not found")).toBeInTheDocument();
    });
  });

  it("shows environment name and active badge in the header", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Default Cloud")).toBeInTheDocument();
    });
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows environment ID in the header and details sidebar", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Environment ID")).toBeInTheDocument();
    });
    // Appears in header strip + sidebar dd
    expect(screen.getAllByText("env_test123").length).toBeGreaterThan(0);
  });

  it("shows unrestricted networking section", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Networking:\s*unrestricted/i),
      ).toBeInTheDocument();
    });
  });

  it("shows limited networking with allowed hosts and mcp/pkg toggles", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue({
      ...mockEnv,
      config: {
        ...mockEnv.config,
        networking: {
          type: "limited",
          allowed_hosts: ["api.github.com", "api.slack.com"],
          allow_mcp_servers: true,
          allow_package_managers: false,
        },
      },
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Networking:\s*limited/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("api.github.com")).toBeInTheDocument();
    expect(screen.getByText("api.slack.com")).toBeInTheDocument();
    expect(screen.getByText(/MCP servers:\s*allowed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Package managers:\s*blocked/i),
    ).toBeInTheDocument();
  });

  it("lists configured packages grouped by manager", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("lodash")).toBeInTheDocument();
    });
    expect(screen.getByText("zod")).toBeInTheDocument();
    expect(screen.getByText("requests")).toBeInTheDocument();
    // Manager labels render (case-insensitive match — the UI uppercases them)
    expect(screen.getByText(/npm/i)).toBeInTheDocument();
    expect(screen.getByText(/pip/i)).toBeInTheDocument();
    // apt/cargo/gem/go are empty arrays and should NOT render their headings
    expect(screen.queryByText(/^apt$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^cargo$/i)).not.toBeInTheDocument();
  });

  it("shows empty packages message when all lists are empty", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue({
      ...mockEnv,
      config: {
        ...mockEnv.config,
        packages: {
          type: "packages",
          apt: [],
          cargo: [],
          gem: [],
          go: [],
          npm: [],
          pip: [],
        },
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No packages configured.")).toBeInTheDocument();
    });
  });

  it("shows Archive button on an active environment", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Archive/i }),
      ).toBeInTheDocument();
    });
  });

  it("hides Archive button on an archived environment", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue({
      ...mockEnv,
      archived_at: "2026-04-05T00:00:00Z",
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("archived")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Archive/i }),
    ).not.toBeInTheDocument();
  });

  it("calls api.archiveEnvironment when the user confirms archive", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    vi.mocked(api.archiveEnvironment).mockResolvedValue({
      ...mockEnv,
      archived_at: "2026-04-10T00:00:00Z",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Archive/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Archive/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.archiveEnvironment).toHaveBeenCalledWith("env_test123");
    });
    confirmSpy.mockRestore();
  });

  it("does NOT archive when the user cancels the archive confirm", async () => {
    vi.mocked(api.getEnvironment).mockResolvedValue(mockEnv);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Archive/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Archive/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.archiveEnvironment).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
