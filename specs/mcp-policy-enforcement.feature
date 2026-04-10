Feature: Team-scoped MCP connector enforcement
  As an admin
  I want to block specific MCP connectors for specific teams
  So that I can keep sensitive integrations out of untrusted teams

  # Sixth latent gap found and fixed: team_mcp_policies was written
  # and read via the governance APIs but nothing consulted it at
  # request time. Any user could create a session with any MCP
  # connector regardless of the admin's policy. Session create now
  # checks each mcp_server on the agent against canUseConnector()
  # and returns 403 if any connector is blocked for the caller.

  Background:
    Given auth is enabled and a non-admin user is logged in
    And an agent "slack-agent" has mcp_servers: [{ name: "slack" }]

  Scenario: Default-allow — no policy row means allowed
    Given no team_mcp_policies row exists for (team, "slack")
    When I POST /v1/sessions with agent=slack-agent
    Then the response is 200

  Scenario: Explicit block denies with 403
    When admin sets team policy slack=blocked
    And the user POSTs /v1/sessions with agent=slack-agent
    Then the response is 403

  Scenario: requires_approval also denies (no approval flow yet)
    When admin sets team policy slack=requires_approval
    And the user POSTs /v1/sessions with agent=slack-agent
    Then the response is 403

  Scenario: Explicit allow re-opens access
    When admin sets team policy slack=allowed
    And the user POSTs /v1/sessions with agent=slack-agent
    Then the response is 200

  Scenario: Admins bypass
    # No way to lock yourself out
    Given a slack=blocked policy exists
    When the admin POSTs /v1/sessions with agent=slack-agent
    Then the response is 200 (admin bypass)
