import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VaultsListPage } from "../pages/vaults-list";

vi.mock("../lib/api", () => ({
  listVaults: vi.fn(),
  createVault: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/vaults"]}>
        <VaultsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VaultsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and subtitle", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Credential vaults")).toBeInTheDocument();
    expect(
      screen.getByText(/Manage credential vaults/)
    ).toBeInTheDocument();
  });

  it("shows New vault button", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();
    expect(screen.getByText("New vault")).toBeInTheDocument();
  });

  it("shows All/Active filter", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No vaults yet")).toBeInTheDocument();
    });
  });

  it("renders vaults in the table", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [
        {
          id: "vlt_001",
          display_name: "Production Secrets",
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
          archived_at: null,
          metadata: {},
          type: "vault",
        },
      ] as any,
      has_more: false,
      first_id: "vlt_001",
      last_id: "vlt_001",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Production Secrets")).toBeInTheDocument();
    });
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("opens the create dialog when New vault is clicked", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /New vault/i }));

    expect(
      screen.getByPlaceholderText(/Support Stack Credentials/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create vault/i }),
    ).toBeInTheDocument();
  });

  it("calls api.createVault with the display name on submit", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
    vi.mocked(api.createVault).mockResolvedValue({
      id: "vlt_new",
      display_name: "My Secrets",
    } as any);

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /New vault/i }));

    await user.type(
      screen.getByPlaceholderText(/Support Stack Credentials/i),
      "My Secrets",
    );
    await user.click(screen.getByRole("button", { name: /Create vault/i }));

    await waitFor(() => {
      expect(api.createVault).toHaveBeenCalledWith({
        display_name: "My Secrets",
      });
    });
  });

  it("closes the dialog on Cancel without calling createVault", async () => {
    vi.mocked(api.listVaults).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /New vault/i }));
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/Support Stack Credentials/i),
      ).not.toBeInTheDocument();
    });
    expect(api.createVault).not.toHaveBeenCalled();
  });
});
