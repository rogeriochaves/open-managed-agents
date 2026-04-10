Feature: LoginPage has regression coverage for the auth entry point
  As the only gate into the product
  I want the login form to have the same test rigor as every other page
  So that a regression in submit, error display, or redirect can't ship

  # Prior state: login.tsx was the only page in packages/web/src/pages
  # without a dedicated test file. Every other page (agents, sessions,
  # environments, vaults, settings, usage, quickstart, session detail,
  # agent detail, environment detail, vault detail) had react-testing-
  # library coverage. Login — the entry point every user hits first —
  # shipped with none. A broken onSubmit handler, a typo in the /v1/auth/
  # login URL, or a missing credentials:include would lock every user
  # out and we wouldn't know until someone tried logging in fresh.

  Background:
    Given the login form POSTs /v1/auth/login directly via fetch
      (NOT through api.ts — api.ts would redirect to /login on 401
       and cause a redirect loop when the user typed the wrong password)
    And the form uses native `required` on both inputs for local validation
    And the button shows "Signing in…" while the fetch is in-flight

  Scenario: Initial render
    Given I navigate to /login
    Then I see the brand "Open Managed Agents" and the subtitle
    And the email field is prefilled with "admin@localhost"
    And the password field is empty
    And the "Sign in" button is enabled

  Scenario: Successful login navigates to /quickstart
    Given I enter valid credentials
    When the server responds 200
    Then the app navigates to /quickstart

  Scenario: 401 with a server-provided message surfaces inline
    Given the server responds 401 with
      { error: { type: "invalid_credentials", message: "Wrong password" } }
    When I submit
    Then I see "Wrong password" in the error strip
    And the app does NOT navigate away from /login

  Scenario: Non-JSON failure falls back to "Login failed"
    Given the server returns a 500 with an unparseable body
    When I submit
    Then the catch chain surfaces "Login failed" instead of crashing
    And the user sees a message instead of a blank error strip

  Scenario: In-flight state
    Given I've submitted the form and the fetch hasn't resolved
    Then the button text reads "Signing in…"
    And the button is disabled
    When the response arrives
    Then the button re-enables and the navigation fires

  Scenario: Empty password is blocked by native `required`
    Given I clear the prefilled email and leave the password empty
    When I click Sign in
    Then the form's local validation rejects the submit
    And fetch is NOT called
    # Important guard — without this, the client would POST an
    # empty password and the server would waste a bcrypt round
    # comparing it.

  Scenario: Credentials flow through the cookie
    Given the fetch is fired with credentials: "include"
    Then the oma_session cookie set by the server flows through
    And subsequent api.* calls (via request() with credentials:"include")
      will see the authenticated session
