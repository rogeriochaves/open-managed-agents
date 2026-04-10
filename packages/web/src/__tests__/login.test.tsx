import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LoginPage } from "../pages/login";

// The login form POSTs /v1/auth/login directly via fetch (not api.ts)
// because api.ts goes through the request() helper that would
// redirect to /login on 401, causing a loop when login credentials
// are wrong. So we stub global.fetch here.
const originalFetch = globalThis.fetch;

function renderPage(initial = "/login") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/quickstart"
          element={<div data-testid="quickstart-landing">Quickstart</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    (globalThis as any).fetch = vi.fn();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it("renders the brand, form fields, and default email", () => {
    renderPage();
    expect(screen.getByText("Open Managed Agents")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument();
    expect(screen.getByDisplayValue("admin@localhost")).toBeInTheDocument();
    // Password field uses type="password"; grab by its label text instead
    expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
  });

  it("posts email + password to /v1/auth/login on submit", async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    renderPage();

    const emailInput = screen.getByDisplayValue("admin@localhost");
    const passwordInput = screen.getByPlaceholderText("Your password");
    await user.clear(emailInput);
    await user.type(emailInput, "alice@example.com");
    await user.type(passwordInput, "hunter22");

    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe("/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      email: "alice@example.com",
      password: "hunter22",
    });
  });

  it("navigates to /quickstart on successful login", async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Your password"),
      "correct-horse-battery-staple",
    );
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId("quickstart-landing")).toBeInTheDocument();
    });
  });

  it("surfaces the server-provided error message on a 401", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse(
        { error: { type: "invalid_credentials", message: "Wrong password" } },
        401,
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Your password"), "wrong");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Wrong password")).toBeInTheDocument();
    });
    // Still on /login — did NOT navigate
    expect(screen.queryByTestId("quickstart-landing")).not.toBeInTheDocument();
  });

  it("falls back to a generic message when the server returns no body on failure", async () => {
    // Broken response — no parseable body. The login form catches
    // the json() reject and surfaces "Login failed" so the user
    // isn't stuck staring at a blank error.
    (globalThis.fetch as any).mockResolvedValue(
      new Response("not json", { status: 500 }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Your password"), "whatever");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Login failed")).toBeInTheDocument();
    });
  });

  it("shows 'Signing in…' and disables the button while in-flight", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    (globalThis.fetch as any).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Your password"), "pw");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    // While in-flight
    expect(screen.getByText("Signing in…")).toBeInTheDocument();
    const btn = screen.getByText("Signing in…").closest("button")!;
    expect(btn).toBeDisabled();

    // Resolve the promise so the component settles before cleanup
    resolveFetch(jsonResponse({ ok: true }));
    await waitFor(() => {
      expect(screen.getByTestId("quickstart-landing")).toBeInTheDocument();
    });
  });

  it("validates locally — empty email or password does not hit the server", async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    renderPage();

    // Clear the prefilled email
    const emailInput = screen.getByDisplayValue("admin@localhost");
    await user.clear(emailInput);
    // Password left empty. The native `required` on both inputs
    // stops the form from firing its onSubmit handler.
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
