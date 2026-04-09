import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MCPConnectorBrowser } from "../components/mcp-connector-browser";

vi.mock("../lib/api", () => ({
  listMCPConnectors: vi.fn(),
}));

import * as api from "../lib/api";

const mockConnectors = [
  {
    id: "slack",
    name: "Slack",
    description: "Send messages in Slack",
    url: "https://mcp.slack.com/sse",
    icon: "slack",
    category: "communication",
    auth_type: "oauth" as const,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories",
    url: "https://mcp.github.com/sse",
    icon: "github",
    category: "development",
    auth_type: "token" as const,
  },
];

function renderBrowser(selected: string[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onToggle = vi.fn();
  return {
    onToggle,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MCPConnectorBrowser
          selectedConnectors={selected}
          onToggle={onToggle}
        />
      </QueryClientProvider>
    ),
  };
}

describe("MCPConnectorBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listMCPConnectors).mockResolvedValue({
      data: mockConnectors,
    });
  });

  it("renders heading", () => {
    renderBrowser();
    expect(screen.getByText("Available Connectors")).toBeInTheDocument();
  });

  it("renders search input", () => {
    renderBrowser();
    expect(
      screen.getByPlaceholderText("Search connectors...")
    ).toBeInTheDocument();
  });

  it("renders category filters", () => {
    renderBrowser();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Communication")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
  });

  it("renders connectors from API", async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("shows auth type badges", async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("oauth")).toBeInTheDocument();
    });
    expect(screen.getByText("token")).toBeInTheDocument();
  });

  it("calls onToggle when clicking a connector", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderBrowser();

    await waitFor(() => {
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Slack"));
    expect(onToggle).toHaveBeenCalledWith(mockConnectors[0]);
  });

  it("shows check mark for selected connectors", async () => {
    renderBrowser(["slack"]);
    await waitFor(() => {
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });
    // The selected connector card should have accent styling
    const slackCard = screen.getByText("Slack").closest("button");
    expect(slackCard?.className).toContain("border-accent-blue");
  });

  it("shows empty state when no connectors found", async () => {
    vi.mocked(api.listMCPConnectors).mockResolvedValue({ data: [] });
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("No connectors found.")).toBeInTheDocument();
    });
  });
});
