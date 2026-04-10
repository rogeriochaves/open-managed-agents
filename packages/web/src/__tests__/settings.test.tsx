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
  listOrganizations: vi.fn(),
  listUsers: vi.fn(),
  listTeams: vi.fn(),
  createTeam: vi.fn(),
  createUser: vi.fn(),
  listTeamProviderAccess: vi.fn(),
  setTeamProviderAccess: vi.fn(),
  listTeamMcpPolicies: vi.fn(),
  setTeamMcpPolicy: vi.fn(),
  listAuditLog: vi.fn(),
}));

import * as api from "../lib/api";

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

    vi.mocked(api.listOrganizations).mockResolvedValue({
      data: [
        {
          id: "org_default",
          name: "Default Organization",
          slug: "default",
          created_at: "2026-04-10T00:00:00Z",
          updated_at: "2026-04-10T00:00:00Z",
        },
      ],
    });

    vi.mocked(api.listUsers).mockResolvedValue({
      data: [
        {
          id: "user_admin",
          email: "admin@localhost",
          name: "Admin",
          role: "admin",
          organization_id: "org_default",
          created_at: "2026-04-10T00:00:00Z",
        },
      ],
    });

    vi.mocked(api.listTeams).mockResolvedValue({
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
    });

    vi.mocked(api.listTeamProviderAccess).mockResolvedValue({
      data: [
        {
          team_id: "team_default",
          provider_id: "provider_anthropic",
          enabled: true,
          rate_limit_rpm: 1000,
          monthly_budget_usd: 500,
        },
      ],
    });

    vi.mocked(api.listTeamMcpPolicies).mockResolvedValue({
      data: [
        {
          team_id: "team_default",
          connector_id: "slack",
          policy: "allowed",
        },
      ],
    });

    vi.mocked(api.createTeam).mockResolvedValue({
      id: "team_new",
      organization_id: "org_default",
      name: "Platform",
      slug: "platform",
      description: null,
      created_at: "2026-04-10T00:00:00Z",
      updated_at: "2026-04-10T00:00:00Z",
    });

    vi.mocked(api.createUser).mockResolvedValue({
      id: "user_new",
      email: "bob@example.com",
      name: "Bob Example",
      role: "member",
      organization_id: "org_default",
      created_at: "2026-04-10T00:00:00Z",
    });

    vi.mocked(api.setTeamProviderAccess).mockResolvedValue({
      team_id: "team_default",
      provider_id: "provider_anthropic",
      enabled: false,
      rate_limit_rpm: 1000,
      monthly_budget_usd: 500,
    });

    vi.mocked(api.setTeamMcpPolicy).mockResolvedValue({
      team_id: "team_default",
      connector_id: "slack",
      policy: "blocked",
    });

    vi.mocked(api.listAuditLog).mockResolvedValue({
      data: [
        {
          id: "audit_1",
          user_id: "user_admin",
          action: "create",
          resource_type: "agent",
          resource_id: "agent_xyz",
          details: { name: "Support agent" },
          created_at: "2026-04-10T10:00:00Z",
        },
        {
          id: "audit_2",
          user_id: "user_admin",
          action: "archive",
          resource_type: "session",
          resource_id: "sesn_abc",
          details: null,
          created_at: "2026-04-10T11:00:00Z",
        },
        {
          id: "audit_3",
          user_id: null,
          action: "update",
          resource_type: "provider",
          resource_id: "provider_anthropic",
          details: null,
          created_at: "2026-04-10T12:00:00Z",
        },
      ],
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

  it("opens Add team modal and calls api.createTeam", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Organization/i }));

    await waitFor(() => {
      expect(screen.getByText("Default Organization")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add team/i }));

    const nameInput = await screen.findByPlaceholderText(/e.g. Platform/i);
    await user.type(nameInput, "Platform");

    expect(screen.getByDisplayValue("platform")).toBeInTheDocument();

    const submitButtons = screen.getAllByRole("button", { name: /^Add team$/ });
    await user.click(submitButtons[submitButtons.length - 1]!);

    await waitFor(() => {
      expect(api.createTeam).toHaveBeenCalledWith(
        "org_default",
        expect.objectContaining({ name: "Platform", slug: "platform" }),
      );
    });
  });

  it("opens Add user modal and calls api.createUser", async () => {
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
    await user.type(
      screen.getByPlaceholderText(/At least 8 characters/i),
      "valid-initial-pw",
    );

    const userSubmitBtns = screen.getAllByRole("button", { name: /^Add user$/ });
    await user.click(userSubmitBtns[userSubmitBtns.length - 1]!);

    await waitFor(() => {
      expect(api.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "bob@example.com",
          name: "Bob Example",
          role: "member",
          organization_id: "org_default",
          password: "valid-initial-pw",
        }),
      );
    });
  });

  it("rejects short initial passwords in the Add user modal without hitting the server", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Organization/i }));

    await waitFor(() => {
      expect(screen.getByText("Default Organization")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add user/i }));

    await user.type(
      await screen.findByPlaceholderText(/alice@example.com/i),
      "short@example.com",
    );
    await user.type(
      screen.getByPlaceholderText(/Alice Example/i),
      "Short PW",
    );
    await user.type(
      screen.getByPlaceholderText(/At least 8 characters/i),
      "short",
    );

    const btns = screen.getAllByRole("button", { name: /^Add user$/ });
    await user.click(btns[btns.length - 1]!);

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeInTheDocument();
    });
    expect(api.createUser).not.toHaveBeenCalled();
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
    await waitFor(
      () => {
        expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
  });

  it("toggles provider access by calling api.setTeamProviderAccess", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Governance/i }));

    const enabledSpan = await screen.findByText(
      "Enabled",
      {},
      { timeout: 3000 },
    );
    const enabledBtn = enabledSpan.closest("button");
    expect(enabledBtn).not.toBeNull();
    await user.click(enabledBtn!);

    await waitFor(() => {
      expect(api.setTeamProviderAccess).toHaveBeenCalledWith(
        "team_default",
        expect.objectContaining({
          provider_id: "provider_anthropic",
          enabled: false,
        }),
      );
    });
  });

  it("cycles MCP policy on badge click", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Governance/i }));

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
      expect(api.setTeamMcpPolicy).toHaveBeenCalledWith(
        "team_default",
        expect.objectContaining({
          connector_id: "slack",
          policy: "blocked",
        }),
      );
    });
  });

  // ── Audit log tab ───────────────────────────────────────────────────
  it("renders the Audit log tab button", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: /Audit log/i }),
    ).toBeInTheDocument();
  });

  it("switches to Audit log tab and fetches the log", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Audit log/i }));
    await waitFor(() => {
      expect(api.listAuditLog).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("heading", { name: "Audit log" }),
    ).toBeInTheDocument();
  });

  it("does NOT fetch the audit log until the tab is opened", async () => {
    renderPage();
    // Let the initial render settle
    await waitFor(() => {
      expect(api.listProviders).toHaveBeenCalled();
    });
    expect(api.listAuditLog).not.toHaveBeenCalled();
  });

  it("renders audit rows with actor name, action badge, resource", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Audit log/i }));

    await waitFor(() => {
      expect(screen.getByText("create")).toBeInTheDocument();
    });
    expect(screen.getByText("archive")).toBeInTheDocument();
    expect(screen.getByText("update")).toBeInTheDocument();
    // Resource IDs
    expect(screen.getByText("agent_xyz")).toBeInTheDocument();
    expect(screen.getByText("sesn_abc")).toBeInTheDocument();
    // Actor: user_admin resolves to "Admin" via the users mock
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    // Null user_id renders as "system"
    expect(screen.getByText("system")).toBeInTheDocument();
  });

  it("refetches the audit log when the resource-type filter changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Audit log/i }));

    await waitFor(() => {
      expect(api.listAuditLog).toHaveBeenCalledWith({ limit: 100 });
    });

    // Change the filter to agent
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "agent");

    await waitFor(() => {
      expect(api.listAuditLog).toHaveBeenCalledWith({
        limit: 100,
        resource_type: "agent",
      });
    });
  });

  it("shows an empty-state message when the audit log has no entries", async () => {
    vi.mocked(api.listAuditLog).mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Audit log/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/No audit entries yet/i),
      ).toBeInTheDocument();
    });
  });
});
