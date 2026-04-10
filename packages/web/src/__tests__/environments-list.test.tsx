import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnvironmentsListPage } from "../pages/environments-list";

vi.mock("../lib/api", () => ({
  listEnvironments: vi.fn(),
  createEnvironment: vi.fn(),
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

  it("opens the create dialog when Add environment is clicked", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Add environment/i }));

    expect(
      screen.getByPlaceholderText(/e.g. production-web/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Unrestricted/)).toBeInTheDocument();
    expect(screen.getByText(/^Limited$/)).toBeInTheDocument();
  });

  it("calls api.createEnvironment with the form values on submit", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
    vi.mocked(api.createEnvironment).mockResolvedValue({
      id: "env_new",
      type: "environment",
      name: "prod-web",
      description: "The production env",
    } as any);

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Add environment/i }));

    await user.type(
      screen.getByPlaceholderText(/e.g. production-web/i),
      "prod-web",
    );
    await user.type(
      screen.getByPlaceholderText(/^Optional$/i),
      "The production env",
    );

    await user.click(
      screen.getByRole("button", { name: /Create environment/i }),
    );

    await waitFor(() => {
      expect(api.createEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "prod-web",
          description: "The production env",
          config: expect.objectContaining({
            type: "cloud",
            networking: { type: "unrestricted" },
          }),
        }),
      );
    });
  });

  it("closes the dialog on Cancel without calling createEnvironment", async () => {
    vi.mocked(api.listEnvironments).mockResolvedValue({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Add environment/i }));
    expect(
      screen.getByPlaceholderText(/e.g. production-web/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/e.g. production-web/i),
      ).not.toBeInTheDocument();
    });
    expect(api.createEnvironment).not.toHaveBeenCalled();
  });
});
