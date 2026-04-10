import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "../components/layout/sidebar";

function renderSidebar(collapsed = false) {
  const onToggle = () => {};
  return render(
    <MemoryRouter initialEntries={["/quickstart"]}>
      <Sidebar collapsed={collapsed} onToggle={onToggle} />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("renders Open Agents branding", () => {
    renderSidebar();
    expect(screen.getByText("Open Agents")).toBeInTheDocument();
  });

  it("renders workspace selector", () => {
    renderSidebar();
    expect(screen.getByText("Default workspace")).toBeInTheDocument();
  });

  it("renders Managed Agents section", () => {
    renderSidebar();
    expect(screen.getByText("Managed Agents")).toBeInTheDocument();
  });

  it("renders all nav items", () => {
    renderSidebar();
    expect(screen.getByText("Quickstart")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Environments")).toBeInTheDocument();
    expect(screen.getByText("Credential vaults")).toBeInTheDocument();
  });

  it("highlights active link", () => {
    renderSidebar();
    const quickstartLink = screen.getByText("Quickstart").closest("a");
    expect(quickstartLink?.className).toContain("text-orange-700");
  });

  it("has collapse button", () => {
    renderSidebar();
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" })
    ).toBeInTheDocument();
  });

  it("hides labels when collapsed", () => {
    renderSidebar(true);
    expect(screen.queryByText("Quickstart")).not.toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
  });

  it("shows expand button when collapsed", () => {
    renderSidebar(true);
    expect(
      screen.getByRole("button", { name: "Expand sidebar" })
    ).toBeInTheDocument();
  });
});
