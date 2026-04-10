Feature: CLI points at the self-hosted server
  As an operator running `oma` against my own deployment
  I want the CLI to hit my OMA server, not api.anthropic.com
  So that the self-hosting promise in the README is actually true

  Background:
    # Bug: the initial CLI copy-pasted the Anthropic SDK client with
    # no baseURL override, so every `oma agents list` went to
    # api.anthropic.com and required ANTHROPIC_API_KEY — directly
    # contradicting the project's self-hosting story. The client now
    # resolves an OMA base URL from env and passes it to the SDK.

  Scenario: Default base URL is localhost:3001
    Given no OMA_API_BASE or ANTHROPIC_API_KEY env vars are set
    When getApiBase() is called
    Then it returns "http://localhost:3001"

  Scenario: OMA_API_BASE overrides the default
    Given OMA_API_BASE="https://oma.acme.internal"
    Then getApiBase() returns "https://oma.acme.internal"

  Scenario: OPEN_MANAGED_AGENTS_API_BASE is accepted as an alias
    Given OPEN_MANAGED_AGENTS_API_BASE="https://agents.example.com"
    Then getApiBase() returns "https://agents.example.com"

  Scenario: The SDK client's baseURL is set to the OMA server
    Given OMA_API_BASE="http://oma.test:9999"
    When getClient() is called
    Then client.baseURL is "http://oma.test:9999"

  Scenario: API key precedence
    Given all three env vars are set
    Then OMA_API_KEY wins
    When OMA_API_KEY is unset
    Then ANTHROPIC_API_KEY is used
    When both are unset
    Then the placeholder "oma-local" is used
    # The SDK requires *some* non-empty api key string even when the
    # OMA server does not validate it.
