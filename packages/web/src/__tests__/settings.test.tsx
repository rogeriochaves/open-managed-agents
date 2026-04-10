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

    mockFetch.mockImplementation((url: string, init?: any) => {
      // Order matters: more-specific paths first. /provider-access
      // and /mcp-policies are under /v1/teams/:id/, so we have to
      // match them BEFORE the generic /teams branch.
      if (url.includes("/provider-access")) {
        if (init?.method === "POST") {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        return Promise.resolve({
          ok: true,
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
        if (init?.method === "POST") {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        return Promise.resolve({
          ok: true,
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

  it("opens Add team modal and POSTs to /v1/organizations/:id/teams", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Organization/i }));

    // Wait for the org card to render
    await waitFor(() => {
      expect(screen.getByText("Default Organization")).toBeInTheDocument();
    });

    // Click the card-level trigger (the first "Add team" button)
    await user.click(screen.getByRole("button", { name: /Add team/i }));

    // Modal fields
    const nameInput = await screen.findByPlaceholderText(/e.g. Platform/i);
    await user.type(nameInput, "Platform");

    // Slug auto-fills from name
    expect(screen.getByDisplayValue("platform")).toBeInTheDocument();

    // After opening the modal both buttons are now visible — the
    // card trigger and the modal submit. Pick the submit (the last one).
    const submitButtons = screen.getAllByRole("button", { name: /^Add team$/ });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await waitFor(() => {
      const posts = mockFetch.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/organizations/org_default/teams") &&
          init?.method === "POST",
      );
      expect(posts.length).toBeGreaterThan(0);
      const body = JSON.parse((posts[0]![1] as any).body);
      expect(body).toMatchObject({ name: "Platform", slug: "platform" });
    });
  });

  it("opens Add user modal and POSTs to /v1/users", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Organization/i }));

    await waitFor(() => {
      expect(screen.getByText("Default Organization")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add user/i }));

    await user.type(
      await screen.findByPlaceholderText(/alice@example.com/i),
      "bob@example.com",
    );
    await user.type(
      screen.getByPlaceholderText(/Alice Example/i),
      "Bob Example",
    );

    // Role select — default is "member"
    // Both card trigger + modal submit match; pick the last one (the submit)
    const userSubmitBtns = screen.getAllByRole("button", { name: /^Add user$/ });
    await user.click(userSubmitBtns[userSubmitBtns.length - 1]!);

    await waitFor(() => {
      const posts = mockFetch.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/v1/users") &&
          init?.method === "POST",
      );
      expect(posts.length).toBeGreaterThan(0);
      const body = JSON.parse((posts[0]![1] as any).body);
      expect(body).toMatchObject({
        email: "bob@example.com",
        name: "Bob Example",
        role: "member",
        organization_id: "org_default",
      });
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

  it("renders interactive RPM / budget inputs on Governance tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Governance/i }));
    // Wait for the async provider-access fetch to land
    await waitFor(
      () => {
        expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
  });

  it("toggles provider access by POSTing to /v1/teams/:teamId/provider-access", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Governance/i }));

    // Wait for the Anthropic row's Enabled badge to render
    const enabledSpan = await screen.findByText(
      "Enabled",
      {},
      { timeout: 3000 },
    );
    const enabledBtn = enabledSpan.closest("button");
    expect(enabledBtn).not.toBeNull();
    await user.click(enabledBtn!);

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/provider-access") &&
          init?.method === "POST",
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const [, init] = postCalls[0]!;
      const body = JSON.parse((init as any).body);
      expect(body.provider_id).toBe("provider_anthropic");
      expect(body.enabled).toBe(false);
    });
  });

  it("cycles MCP policy on badge click", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Governance/i }));

    // The Slack policy starts as "allowed". Multiple elements match
    // (the explainer <strong> + the badge span), so find the one
    // inside a button — that's the clickable badge.
    await waitFor(
      () => {
        const badges = screen.getAllByText("allowed");
        const inBtn = badges.find((el) => el.closest("button"));
        expect(inBtn).toBeTruthy();
      },
      { timeout: 3000 },
    );
    const policyBtn = screen
      .getAllByText("allowed")
      .find((el) => el.closest("button"))!
      .closest("button");
    expect(policyBtn).not.toBeNull();
    await user.click(policyBtn!);

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/mcp-policies") &&
          init?.method === "POST",
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const [, init] = postCalls[0]!;
      const body = JSON.parse((init as any).body);
      expect(body.connector_id).toBe("slack");
      expect(body.policy).toBe("blocked");
    });
  });
});
