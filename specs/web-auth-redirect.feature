Feature: Mid-session 401 redirects to /login, not the API-key dialog
  As a logged-in operator of Open Managed Agents
  I want an expired session to bounce me back to /login
  So that I don't see a confusing "paste your Anthropic API key" prompt
  for an endpoint that has nothing to do with Anthropic

  # Prior state: main.tsx mounted an ApiKeyDialog that popped whenever
  # any React Query query returned 401 and localStorage had no
  # "oma_api_key". The dialog was doubly wrong:
  #   1) Copy-wise — it instructed users to paste an **Anthropic**
  #      API key into an OMA prompt and linked to console.anthropic.com,
  #      which is stale from before the multi-provider refactor. The
  #      x-api-key header on our server is an Anthropic-SDK-compat alias
  #      for an OMA session token, not an Anthropic key.
  #   2) Flow-wise — AppLayout ALREADY redirects unauthenticated users
  #      to /login via useEffect([user, loading]), so the dialog only
  #      ever showed up on a mid-session cookie expiry — the exact
  #      moment a redirect to /login is the correct answer.
  # Fix: delete the dialog entirely, install a QueryCache onError hook
  # that redirects to /login on any 401 that isn't already on /login,
  # and switch api.ts to `credentials: "include"` so cookies flow
  # across origins if the server is ever hosted cross-site.

  Background:
    Given the web app is loaded and I am authenticated
    And my session cookie "oma_session" is set on the browser

  Scenario: Session cookie expires mid-app
    Given I am on /agents
    When my cookie is cleared by the server (invalidated, expired, etc)
    And the next api.listAgents() call returns 401
    Then the QueryCache onError hook fires
    And window.location is navigated to "/login"
    And no "API Key Required" modal appears
    And I do NOT see a link to console.anthropic.com

  Scenario: The ApiKeyDialog component does not exist
    When I search the web package for "api-key-dialog"
    Then no source file, test file, or wiring imports the component
    And the component file itself is deleted
    And the 8 ApiKeyDialog vitest cases are removed from the suite

  Scenario: Already on /login, a 401 must not redirect-loop
    Given I am on /login
    When a query on /login fires and 401s (e.g. /v1/auth/me for a
      signed-out user)
    Then the onError hook sees window.location.pathname === "/login"
    And it does NOT navigate — no redirect loop

  Scenario: api.ts always sends credentials cross-origin
    Given the server is hosted on a different origin than the web app
    When any api.* helper fires a fetch
    Then the RequestInit carries credentials: "include"
    And the oma_session cookie reaches the server
    And the server does not return 401 for a valid cookie
