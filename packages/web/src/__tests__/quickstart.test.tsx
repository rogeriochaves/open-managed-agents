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
  agentBuilderChat: vi.fn(),
  listProviders: vi.fn().mockResolvedValue({
    data: [
      {
        id: "provider_anthropic",
        name: "Anthropic",
        type: "anthropic",
        base_url: null,
        default_model: "claude-sonnet-4-6",
        is_default: true,
        has_api_key: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  }),
  listProviderModels: vi
    .fn()
    .mockResolvedValue({ models: ["claude-sonnet-4-6"] }),
  listMCPConnectors: vi.fn().mockResolvedValue({ data: [] }),
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

  it("renders the 'What do you want to build?' chat heading", () => {
    renderPage();
    expect(screen.getByText("What do you want to build?")).toBeInTheDocument();
  });

  it("renders the chat empty state hint", () => {
    renderPage();
    expect(
      screen.getByText(/Tell me what you want your agent to do/i)
    ).toBeInTheDocument();
  });

  it("renders the chat textarea", () => {
    renderPage();
    expect(
      screen.getByPlaceholderText("Describe your agent...")
    ).toBeInTheDocument();
  });

  it("renders Browse templates heading on the right side", () => {
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

  it("goes back to templates on Back click", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Blank agent config"));
    expect(screen.getByText("Use this template")).toBeInTheDocument();

    await user.click(screen.getByText("Back to templates"));
    expect(screen.getByText("Browse templates")).toBeInTheDocument();
  });

  it("forwards mcp_servers + tools + skills to createAgent when using a template", async () => {
    (api.createAgent as any).mockResolvedValueOnce({
      id: "agent_support_test",
      type: "agent",
      name: "support-agent",
      description: "desc",
      system: "sys",
      model: { id: "claude-sonnet-4-6" },
      tools: [],
      mcp_servers: [],
      skills: [],
      metadata: {},
      version: 1,
      created_at: "2026-04-10T00:00:00Z",
      updated_at: "2026-04-10T00:00:00Z",
      archived_at: null,
    });

    const user = userEvent.setup();
    renderPage();

    // Click the Support agent template (promises Slack + Notion)
    await user.click(screen.getByText("Support agent"));
    expect(screen.getByText("Use this template")).toBeInTheDocument();

    // Click "Use this template"
    await user.click(screen.getByText("Use this template"));

    await waitFor(() => {
      expect(api.createAgent).toHaveBeenCalled();
    });

    // The payload MUST include the template's mcp_servers — previously
    // the handler only sent {name, description, model, system} and
    // dropped the connectors entirely, so a "Support agent" with
    // Slack + Notion in the preview ended up as a bare agent after
    // the click. This is a regression guard against that bug.
    const callArgs = (api.createAgent as any).mock.calls[0]![0];
    expect(callArgs.name).toBe("support-agent");
    expect(Array.isArray(callArgs.mcp_servers)).toBe(true);
    const serverNames = callArgs.mcp_servers.map((s: any) => s.name);
    expect(serverNames).toContain("notion");
    expect(serverNames).toContain("slack");
    // Tools and skills are also forwarded (may be empty, but the
    // field must be present so the backend doesn't default something
    // unexpected).
    expect(callArgs).toHaveProperty("tools");
    expect(callArgs).toHaveProperty("skills");
  });

  it("renders stepper with all 4 steps", () => {
    renderPage();
    expect(screen.getByText("Create agent")).toBeInTheDocument();
    expect(screen.getByText("Configure environment")).toBeInTheDocument();
    expect(screen.getByText("Start session")).toBeInTheDocument();
    expect(screen.getByText("Integrate")).toBeInTheDocument();
  });

  it("sends a message through the agent-builder chat and renders the assistant reply", async () => {
    (api.agentBuilderChat as any).mockResolvedValueOnce({
      reply: "Sure! Tell me what tools it needs.",
      draft: {
        name: "my-agent",
        description: "a helpful assistant",
        system: "You are helpful.",
      },
      done: false,
      provider: { id: "provider_anthropic", name: "Anthropic" },
    });

    const user = userEvent.setup();
    renderPage();

    const textarea = screen.getByPlaceholderText("Describe your agent...");
    await user.type(textarea, "I want a support agent");
    // Enter key submits (Shift+Enter inserts newline)
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        screen.getByText("Sure! Tell me what tools it needs."),
      ).toBeInTheDocument();
    });

    expect(api.agentBuilderChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "I want a support agent" },
        ],
      }),
    );
  });

  it("shows the draft preview on the right after the assistant returns a named draft", async () => {
    (api.agentBuilderChat as any).mockResolvedValueOnce({
      reply: "Got it — here's the draft.",
      draft: {
        name: "support-agent",
        description: "Answers support questions",
        system: "You are a support agent.",
      },
      done: false,
      provider: { id: "provider_anthropic", name: "Anthropic" },
    });

    const user = userEvent.setup();
    renderPage();

    const textarea = screen.getByPlaceholderText("Describe your agent...");
    await user.type(textarea, "support agent");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Draft agent")).toBeInTheDocument();
    });
    expect(screen.getByText("support-agent")).toBeInTheDocument();
    const createBtn = screen.getByRole("button", { name: /Create agent/i });
    // Create button is disabled until done=true
    expect(createBtn).toBeDisabled();
  });

  it("shows a friendly error when the builder chat returns 503 (no provider)", async () => {
    const err: any = new Error("API 503: provider_not_configured");
    err.status = 503;
    (api.agentBuilderChat as any).mockRejectedValueOnce(err);

    const user = userEvent.setup();
    renderPage();

    const textarea = screen.getByPlaceholderText("Describe your agent...");
    await user.type(textarea, "hi");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        screen.getByText(/No LLM provider configured/i),
      ).toBeInTheDocument();
    });
  });
});
