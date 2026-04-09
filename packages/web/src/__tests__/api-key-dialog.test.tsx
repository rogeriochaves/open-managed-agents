import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ApiKeyDialog } from "../components/ui/api-key-dialog";

describe("ApiKeyDialog", () => {
  it("does not render when closed", () => {
    render(
      <ApiKeyDialog open={false} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByText("API Key Required")).not.toBeInTheDocument();
  });

  it("renders when open", () => {
    render(
      <ApiKeyDialog open={true} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("API Key Required")).toBeInTheDocument();
  });

  it("shows input field", () => {
    render(
      <ApiKeyDialog open={true} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByPlaceholderText("sk-ant-api03-...")).toBeInTheDocument();
  });

  it("shows Save Key and Cancel buttons", () => {
    render(
      <ApiKeyDialog open={true} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("Save Key")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onClose when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ApiKeyDialog open={true} onSave={vi.fn()} onClose={onClose} />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSave with key when Save Key clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ApiKeyDialog open={true} onSave={onSave} onClose={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText("sk-ant-api03-..."), "test-key");
    await user.click(screen.getByText("Save Key"));
    expect(onSave).toHaveBeenCalledWith("test-key");
  });

  it("disables Save Key when input is empty", () => {
    render(
      <ApiKeyDialog open={true} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("Save Key").closest("button")).toBeDisabled();
  });

  it("shows link to Anthropic console", () => {
    render(
      <ApiKeyDialog open={true} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("Get one from Anthropic")).toBeInTheDocument();
  });
});
