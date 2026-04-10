Feature: Global auth guard middleware
  As an enterprise operator
  I want every non-public route to require a valid session
  So that my self-hosted deployment isn't wide open to the network

  # Seventh and most serious latent gap: every route was publicly
  # reachable because no middleware read AUTH_ENABLED. Tests were
  # setting the flag but no code consulted it. The README
  # prominently promised auth + RBAC; in reality anyone who could
  # reach the server could list agents, read audit logs, or hit
  # vault credentials. Fixed by adding middleware/auth-guard.ts
  # and wiring it into createApp() before route registration.

  Background:
    Given auth is enabled (AUTH_ENABLED != "false")
    And an admin user exists with a known password

  Scenario: Public paths don't require a cookie
    When I GET /health without a cookie
    Then the response is 200
    When I POST /v1/auth/login without a cookie
    Then the response is 200 (with valid creds)
    When I GET /v1/auth/me without a cookie
    Then the response is 200 and user is null
    When I GET /v1/auth/sso-providers without a cookie
    Then the response is 200
    When I GET /openapi.json without a cookie
    Then the response is 200

  Scenario: Private paths require a valid session
    When I GET /v1/agents without a cookie
    Then the response is 401 with type="authentication_error"
    When I GET /v1/sessions, /v1/vaults, /v1/providers, /v1/audit-log
    Then each returns 401

  Scenario: A valid session cookie unlocks private paths
    Given I logged in as admin and have a session cookie
    When I GET /v1/agents with that cookie
    Then the response is 200

  Scenario: A bogus session cookie does not unlock anything
    When I GET /v1/agents with cookie=oma_session=not-a-real-token
    Then the response is 401

  Scenario: AUTH_ENABLED=false bypasses the guard
    # Existing test suites set this to keep their setup simple
    # (they would otherwise need to log in before every call).
    # Honoring the flag on the opt-out path keeps those tests
    # passing and matches the pre-fix semantics.
    When the env has AUTH_ENABLED="false"
    Then every route is reachable without a cookie
