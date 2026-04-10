import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "../pages/settings";

vi.mock("../lib/api", () => ({
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  listMCPConnectors: vi.fn(),
}));

import * as api from "../lib/api";

// Mock fetch for governance endpoints
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    vi.mocked(api.listProviders).mockResolvedValue({
      data: [
        {
          id: "provider_anthropic",
          name: "Anthropic",
          type: "anthropic",
          base_url: null,
          default_model: "claude-sonnet-4-6",
          is_default: true,
          has_api_key: true,
          created_at: "2026-04-10T00:00:00Z",
          updated_at: "2026-04-10T00:00:00Z",
        },
      ],
    });

    vi.mocked(api.listMCPConnectors).mockResolvedValue({
      data: [
        {
          id: "slack",
          name: "Slack",
          description: "Slack",
          url: "https://mcp.slack.com/sse",
          icon: "slack",
          category: "communication",
          auth_type: "oauth",
        },
      ],
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/organizations") && !url.includes("/teams")) {
        return Promise.resolve({
          json: async () => ({
            data: [
              {
                id: "org_default",
                name: "Default Organization",
                slug: "default",
                logo_url: null,
                sso_provider: null,
                created_at: "2026-04-10T00:00:00Z",
                updated_at: "2026-04-10T00:00:00Z",
              },
            ],
          }),
        });
      }
      if (url.includes("/users")) {
        return Promise.resolve({
          json: async () => ({
            data: [
              {
                id: "user_admin",
                email: "admin@localhost",
                name: "Admin",
                role: "admin",
                organization_id: "org_default",
                avatar_url: null,
                created_at: "2026-04-10T00:00:00Z",
                updated_at: "2026-04-10T00:00:00Z",
              },
            ],
          }),
        });
      }
      if (url.includes("/teams")) {
        return Promise.resolve({
          json: async () => ({
            data: [
              {
                id: "team_default",
                organization_id: "org_default",
                name: "Default Team",
                slug: "default",
                description: null,
                created_at: "2026-04-10T00:00:00Z",
                updated_at: "2026-04-10T00:00:00Z",
              },
            ],
          }),
        });
      }
      if (url.includes("/provider-access")) {
        return Promise.resolve({
          json: async () => ({
            data: [
              {
                id: "tpa_1",
                team_id: "team_default",
                provider_id: "provider_anthropic",
                enabled: true,
                rate_limit_rpm: 1000,
                monthly_budget_usd: 500,
                created_at: "2026-04-10T00:00:00Z",
              },
            ],
          }),
        });
      }
      if (url.includes("/mcp-policies")) {
        return Promise.resolve({
          json: async () => ({
            data: [
              {
                id: "pol_1",
                team_id: "team_default",
                connector_id: "slack",
                policy: "allowed",
                created_at: "2026-04-10T00:00:00Z",
              },
            ],
          }),
        });
      }
      return Promise.resolve({ json: async () => ({ data: [] }) });
    });
  });

  it("renders Settings heading", async () => {
    renderPage();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders three tabs", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Providers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Organization/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Governance/i })).toBeInTheDocument();
  });

  it("shows Providers tab by default with LLM Providers heading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("LLM Providers")).toBeInTheDocument();
    });
  });

  it("lists configured providers", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText(/API key configured/i)).toBeInTheDocument();
  });

  it("shows Add Provider button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add Provider/i })).toBeInTheDocument();
    });
  });

  it("opens add provider form when button clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add Provider/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Add Provider/i }));
    expect(screen.getByText("Add LLM Provider")).toBeInTheDocument();
  });

  it("switches to Organization tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Organization/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Organization" })).toBeInTheDocument();
    });
  });

  it("switches to Governance tab and shows provider access section", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Governance/i }));
    await waitFor(() => {
      expect(screen.getByText("Provider Access")).toBeInTheDocument();
    });
    expect(screen.getByText("MCP Integration Policies")).toBeInTheDocument();
  });
});
