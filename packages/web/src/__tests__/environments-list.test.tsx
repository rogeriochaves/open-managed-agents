import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnvironmentsListPage } from "../pages/environments-list";

vi.mock("../lib/api", () => ({
  listEnvironments: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/environments"]}>
        <EnvironmentsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EnvironmentsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and subtitle", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Environments")).toBeInTheDocument();
    expect(
      screen.getByText(/Configuration template for containers/)
    ).toBeInTheDocument();
  });

  it("shows Add environment button", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();
    expect(screen.getByText("Add environment")).toBeInTheDocument();
  });

  it("shows All/Active filter", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
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
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No environments yet")).toBeInTheDocument();
    });
  });

  it("shows table headers", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    renderPage();

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
  });
});
