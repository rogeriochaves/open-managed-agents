import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UsagePage } from "../pages/usage";

vi.mock("../lib/api", () => ({
  getUsageSummary: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsagePage />
    </QueryClientProvider>
  );
}

describe("UsagePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    vi.mocked(api.getUsageSummary).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading usage data...")).toBeInTheDocument();
  });

  it("renders summary cards with data", async () => {
    vi.mocked(api.getUsageSummary).mockResolvedValue({
      total_sessions: 5,
      total_events: 42,
      total_input_tokens: 1500,
      total_output_tokens: 300,
      estimated_cost_usd: 0.0123,
      by_agent: [],
      by_provider: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    expect(screen.getByText("42")).toBeInTheDocument(); // events
    expect(screen.getByText("$0.01")).toBeInTheDocument(); // cost
  });

  it("renders provider breakdown table", async () => {
    vi.mocked(api.getUsageSummary).mockResolvedValue({
      total_sessions: 2,
      total_events: 10,
      total_input_tokens: 1000,
      total_output_tokens: 200,
      estimated_cost_usd: 0.005,
      by_provider: [
        {
          provider_id: "provider_anthropic",
          provider_name: "Anthropic",
          provider_type: "anthropic",
          session_count: 2,
          input_tokens: 1000,
          output_tokens: 200,
          estimated_cost_usd: 0.005,
        },
      ],
      by_agent: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("By Provider")).toBeInTheDocument();
    });

    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("anthropic")).toBeInTheDocument();
  });

  it("renders agent breakdown table", async () => {
    vi.mocked(api.getUsageSummary).mockResolvedValue({
      total_sessions: 1,
      total_events: 5,
      total_input_tokens: 500,
      total_output_tokens: 100,
      estimated_cost_usd: 0.002,
      by_provider: [],
      by_agent: [
        {
          agent_id: "agent_123",
          agent_name: "Support Agent",
          session_count: 1,
          input_tokens: 500,
          output_tokens: 100,
          estimated_cost_usd: 0.002,
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("By Agent")).toBeInTheDocument();
    });

    expect(screen.getByText("Support Agent")).toBeInTheDocument();
  });

  it("shows empty state when no data", async () => {
    vi.mocked(api.getUsageSummary).mockResolvedValue({
      total_sessions: 0,
      total_events: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      estimated_cost_usd: 0,
      by_provider: [],
      by_agent: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("By Provider")).toBeInTheDocument();
    });

    expect(screen.getAllByText("No usage data yet.")).toHaveLength(2);
  });

  it("shows token summary label", async () => {
    vi.mocked(api.getUsageSummary).mockResolvedValue({
      total_sessions: 1,
      total_events: 3,
      total_input_tokens: 100,
      total_output_tokens: 50,
      estimated_cost_usd: 0,
      by_provider: [],
      by_agent: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("100 in / 50 out")).toBeInTheDocument();
    });
  });
});
