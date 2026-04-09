import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickstartPage } from "../pages/quickstart";

vi.mock("../lib/api", () => ({
  createAgent: vi.fn(),
  createEnvironment: vi.fn(),
  createSession: vi.fn(),
  sendSessionEvents: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/quickstart"]}>
        <QuickstartPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("QuickstartPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the quickstart heading", () => {
    renderPage();
    expect(screen.getByText("What do you want to build?")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    renderPage();
    expect(
      screen.getByText("Describe your agent or start with a template.")
    ).toBeInTheDocument();
  });

  it("renders describe your agent input", () => {
    renderPage();
    expect(
      screen.getByPlaceholderText("Describe your agent...")
    ).toBeInTheDocument();
  });

  it("renders Browse templates heading", () => {
    renderPage();
    expect(screen.getByText("Browse templates")).toBeInTheDocument();
  });

  it("renders template search input", () => {
    renderPage();
    expect(
      screen.getByPlaceholderText("Search templates")
    ).toBeInTheDocument();
  });

  it("renders template cards", () => {
    renderPage();
    expect(screen.getByText("Blank agent config")).toBeInTheDocument();
    expect(screen.getByText("Deep researcher")).toBeInTheDocument();
    expect(screen.getByText("Structured extractor")).toBeInTheDocument();
    expect(screen.getByText("Data analyst")).toBeInTheDocument();
  });

  it("filters templates on search", async () => {
    const user = userEvent.setup();
    renderPage();

    const searchInput = screen.getByPlaceholderText("Search templates");
    await user.type(searchInput, "research");

    expect(screen.getByText("Deep researcher")).toBeInTheDocument();
    expect(screen.queryByText("Blank agent config")).not.toBeInTheDocument();
  });

  it("shows template preview when clicking a template", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Blank agent config"));

    expect(screen.getByText("Back to templates")).toBeInTheDocument();
    expect(screen.getByText("Use this template")).toBeInTheDocument();
    expect(screen.getByText("Template")).toBeInTheDocument();
  });

  it("shows YAML and JSON tabs in template preview", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Blank agent config"));

    expect(screen.getByText("YAML")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
  });

  it("goes back to templates on Back click", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Blank agent config"));
    expect(screen.getByText("Use this template")).toBeInTheDocument();

    await user.click(screen.getByText("Back to templates"));
    expect(screen.getByText("Browse templates")).toBeInTheDocument();
  });

  it("renders stepper with all 4 steps", () => {
    renderPage();
    expect(screen.getByText("Create agent")).toBeInTheDocument();
    expect(screen.getByText("Configure environment")).toBeInTheDocument();
    expect(screen.getByText("Start session")).toBeInTheDocument();
    expect(screen.getByText("Integrate")).toBeInTheDocument();
  });
});
