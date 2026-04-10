import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VaultDetailPage } from "../pages/vault-detail";

vi.mock("../lib/api", () => ({
  getVault: vi.fn(),
  archiveVault: vi.fn(),
  listVaultCredentials: vi.fn(),
  createVaultCredential: vi.fn(),
  deleteVaultCredential: vi.fn(),
}));

import * as api from "../lib/api";

function renderPage(vaultId = "vlt_test123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/vaults/${vaultId}`]}>
        <Routes>
          <Route path="/vaults/:vaultId" element={<VaultDetailPage />} />
          <Route path="/vaults" element={<div>Vaults list stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockVault = {
  id: "vlt_test123",
  type: "vault" as const,
  display_name: "Production Secrets",
  metadata: {},
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T12:00:00Z",
  archived_at: null,
};

describe("VaultDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listVaultCredentials).mockResolvedValue({ data: [] });
  });

  it("shows loading state", () => {
    vi.mocked(api.getVault).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading vault...")).toBeInTheDocument();
  });

  it("shows vault display name in the header and details sidebar", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    renderPage();
    // Appears both in the h1 header and in the Vault Details dl
    await waitFor(() => {
      expect(screen.getAllByText("Production Secrets").length).toBeGreaterThan(
        0,
      );
    });
    expect(screen.getAllByText("Production Secrets")).toHaveLength(2);
  });

  it("shows active status badge and vault id", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("active")).toBeInTheDocument();
    });
    expect(screen.getAllByText("vlt_test123").length).toBeGreaterThan(0);
  });

  it("shows empty state when vault has no credentials", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No credentials yet")).toBeInTheDocument();
    });
  });

  it("lists credentials from the server", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    vi.mocked(api.listVaultCredentials).mockResolvedValue({
      data: [
        {
          id: "cred_1",
          vault_id: "vlt_test123",
          name: "SLACK_BOT_TOKEN",
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "cred_2",
          vault_id: "vlt_test123",
          name: "NOTION_API_KEY",
          created_at: "2026-04-02T00:00:00Z",
          updated_at: "2026-04-02T00:00:00Z",
        },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("SLACK_BOT_TOKEN")).toBeInTheDocument();
    });
    expect(screen.getByText("NOTION_API_KEY")).toBeInTheDocument();
    // Credential count is rendered next to the heading
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("shows Archive button on an active vault", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Archive/i }),
      ).toBeInTheDocument();
    });
  });

  it("hides Archive button on an already-archived vault", async () => {
    vi.mocked(api.getVault).mockResolvedValue({
      ...mockVault,
      archived_at: "2026-04-05T00:00:00Z",
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("archived")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Archive/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the Add credential modal", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add credential/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Add credential/i }));
    // Modal field headers
    expect(
      screen.getByPlaceholderText(/e\.g\. SLACK_BOT_TOKEN/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste the secret/i)).toBeInTheDocument();
  });

  it("disables Save credential when name or value is empty", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add credential/i }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Add credential/i }));

    const saveBtn = screen.getByRole("button", { name: /Save credential/i });
    expect(saveBtn).toBeDisabled();

    // Fill in the name only — still disabled (value empty)
    await user.type(
      screen.getByPlaceholderText(/e\.g\. SLACK_BOT_TOKEN/i),
      "NOTION_API_KEY",
    );
    expect(saveBtn).toBeDisabled();

    // Fill in the value — now enabled
    await user.type(
      screen.getByPlaceholderText(/Paste the secret/i),
      "secret_xyz",
    );
    expect(saveBtn).toBeEnabled();
  });

  it("calls api.createVaultCredential with the form values on Save", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    vi.mocked(api.createVaultCredential).mockResolvedValue({
      id: "cred_new",
      vault_id: "vlt_test123",
      name: "NOTION_API_KEY",
      created_at: "2026-04-10T00:00:00Z",
      updated_at: "2026-04-10T00:00:00Z",
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add credential/i }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Add credential/i }));
    await user.type(
      screen.getByPlaceholderText(/e\.g\. SLACK_BOT_TOKEN/i),
      "NOTION_API_KEY",
    );
    await user.type(
      screen.getByPlaceholderText(/Paste the secret/i),
      "secret_xyz",
    );
    await user.click(screen.getByRole("button", { name: /Save credential/i }));

    await waitFor(() => {
      expect(api.createVaultCredential).toHaveBeenCalledWith("vlt_test123", {
        name: "NOTION_API_KEY",
        value: "secret_xyz",
      });
    });
  });

  it("surfaces a server error inside the modal instead of closing it", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    vi.mocked(api.createVaultCredential).mockRejectedValue(
      new Error("API 409: credential name already exists"),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add credential/i }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Add credential/i }));
    await user.type(
      screen.getByPlaceholderText(/e\.g\. SLACK_BOT_TOKEN/i),
      "DUPLICATE",
    );
    await user.type(
      screen.getByPlaceholderText(/Paste the secret/i),
      "whatever",
    );
    await user.click(screen.getByRole("button", { name: /Save credential/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/credential name already exists/i),
      ).toBeInTheDocument();
    });
    // Modal stays open — Cancel button still present
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("calls api.deleteVaultCredential when the user confirms delete", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    vi.mocked(api.listVaultCredentials).mockResolvedValue({
      data: [
        {
          id: "cred_1",
          vault_id: "vlt_test123",
          name: "SLACK_BOT_TOKEN",
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(api.deleteVaultCredential).mockResolvedValue({ deleted: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("SLACK_BOT_TOKEN")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.deleteVaultCredential).toHaveBeenCalledWith(
        "vlt_test123",
        "cred_1",
      );
    });
    confirmSpy.mockRestore();
  });

  it("does NOT call deleteVaultCredential when the user cancels the confirm", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    vi.mocked(api.listVaultCredentials).mockResolvedValue({
      data: [
        {
          id: "cred_1",
          vault_id: "vlt_test123",
          name: "SLACK_BOT_TOKEN",
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("SLACK_BOT_TOKEN")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.deleteVaultCredential).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("calls api.archiveVault when the user confirms archive", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    vi.mocked(api.archiveVault).mockResolvedValue({
      ...mockVault,
      archived_at: "2026-04-10T00:00:00Z",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Archive/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Archive/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.archiveVault).toHaveBeenCalledWith("vlt_test123");
    });
    confirmSpy.mockRestore();
  });

  it("does NOT archive when the user cancels the archive confirm", async () => {
    vi.mocked(api.getVault).mockResolvedValue(mockVault);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Archive/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Archive/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.archiveVault).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
