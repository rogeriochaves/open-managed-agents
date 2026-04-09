Feature: Authentication
  As a user
  I want flexible authentication options
  So that I can use my existing Anthropic API key or Claude Code subscription

  # ── API Key authentication ────────────────────────────────────────────────

  Scenario: Authenticate with ANTHROPIC_API_KEY environment variable
    Given ANTHROPIC_API_KEY is set in the environment
    When I make an API request
    Then the request is proxied to Anthropic using that API key

  Scenario: Authenticate with x-api-key header (per-request)
    Given a request includes the "x-api-key" header
    When the request is processed
    Then the header API key is used for that request
    And it takes precedence over the environment variable

  Scenario: Authenticate with .env file
    Given a .env file exists with ANTHROPIC_API_KEY
    When the server starts
    Then the API key is loaded from .env

  # ── Claude Code authentication ────────────────────────────────────────────

  Scenario: Detect Claude Code installation
    Given Claude Code is installed on the machine
    Then the server detects the OAuth token in the Claude config
    And logs a message about detected Claude Code installation

  Scenario: Claude Code OAuth token (future)
    Given Claude Code is installed and the user is logged in
    When the server can access the macOS Keychain via keytar
    Then it decrypts the OAuth token from Claude's config
    And uses it as the API bearer token
    And this allows Claude Max/Pro subscribers to use their existing subscription

  # ── Frontend authentication ───────────────────────────────────────────────

  Scenario: API key input in the UI
    Given I open the application without an API key configured
    When the first API request fails with 401
    Then I see an API key input dialog
    And I can enter my API key
    And it is stored in the browser (localStorage)
    And subsequent requests use this key via x-api-key header

  # ── CLI authentication ────────────────────────────────────────────────────

  Scenario: CLI uses ANTHROPIC_API_KEY
    Given ANTHROPIC_API_KEY is set
    When I run any oma command
    Then it authenticates with that key

  Scenario: CLI reports missing authentication
    Given no API key is configured
    When I run any oma command
    Then I see "ANTHROPIC_API_KEY environment variable is required"
    And the exit code is 1
