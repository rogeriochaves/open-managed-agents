Feature: MCP connector credential storage
  As an operator configuring agents with Slack, Notion, Linear, GitHub…
  I want to store a token for each connector securely
  So that my agents can actually authenticate and the connector browser
  isn't just cosmetic pretend UI

  # User complaint that drove this: "I can't oauth with those connectors
  # — it's all fake, all pretend on the frontend". The browser showed
  # dozens of connectors but clicking Connect did nothing. This feature
  # is the minimum real primitive underneath a later full OAuth flow:
  # organization-scoped encrypted credential storage, surfaced as a
  # `connected: boolean` on the list endpoint so the UI can render
  # "Connected" state + a disconnect path.

  Background:
    Given the MCP discovery registry contains slack, notion, github, …

  Scenario: Fresh install — every connector reports connected=false
    When I GET /v1/mcp/connectors
    Then every item has connected=false

  Scenario: Connecting a connector stores an encrypted token
    When I POST /v1/mcp/connectors/slack/connect with token="xoxb-super-secret"
    Then the response is 200 with connector_id=slack and auth_type=oauth
    And the row in mcp_connections has token_encrypted ≠ "xoxb-super-secret"
    And the token is encrypted with AES-256-GCM via lib/encryption.encrypt()

  Scenario: Subsequent GETs report connected=true
    Given slack is connected for my organization
    When I GET /v1/mcp/connectors
    Then the slack item has connected=true
    When I GET /v1/mcp/connectors/slack
    Then the single-connector GET also reports connected=true

  Scenario: Re-connecting upserts — only one row per (org, connector)
    Given notion is already connected with token="first-token"
    When I POST /v1/mcp/connectors/notion/connect with token="second-token"
    Then the response is 200
    And mcp_connections contains exactly one row for notion

  Scenario: Connecting an unknown connector returns 404
    When I POST /v1/mcp/connectors/does-not-exist/connect with token="whatever"
    Then the response is 404 with error.type="not_found"

  Scenario: Disconnecting removes the row and flips connected back to false
    Given slack is connected
    When I DELETE /v1/mcp/connectors/slack/connect
    Then the response is {deleted: true}
    And mcp_connections has no row for slack
    And GET /v1/mcp/connectors shows slack with connected=false

  Scenario: Credentials are organization-scoped
    Given two organizations: acme and globex
    And acme connects slack with token="acme-token"
    When globex GETs /v1/mcp/connectors
    Then slack is connected=false for globex
    # Acme's token is NEVER visible to globex

  Scenario: UI shows Connect button and a paste-token dialog
    Given the MCPConnectorBrowser is mounted
    And slack is not connected
    When I click "Connect" on the slack card
    Then a modal opens titled "Connect Slack"
    And the modal has a password-type input labeled "API token"
    When I paste a token and click Save credential
    Then the modal closes
    And the slack card now shows a "Connected" badge (green)
    And the badge doubles as a disconnect button on hover (red)
