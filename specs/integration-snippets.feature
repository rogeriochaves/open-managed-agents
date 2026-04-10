Feature: Integration code snippets
  As a developer using Open Managed Agents
  I want to copy code snippets that integrate with MY server
  So that I can wire my application to my self-hosted instance

  Background:
    Given I am logged in to the Open Managed Agents console
    And I am running the server at "http://localhost:3001"

  Scenario: Quickstart shows code snippets pointing at the self-hosted server
    # Bug: the quickstart template preview shows curl examples pointing at
    # https://api.anthropic.com/v1/agents instead of the user's own server.
    # Since Open Managed Agents is a self-hosted replacement for the Claude
    # Managed Agents API, snippets must reference the user's instance.
    Given I have completed the "Create agent" step
    When I view the curl snippet for the agent creation call
    Then the URL should be the user's server URL (e.g. "http://localhost:3001/v1/agents")
    And the snippet should not reference "api.anthropic.com"
    And there should not be an "anthropic-version" header
    And the x-api-key header should be the OMA server's API key header

  Scenario: Snippets use the current browser origin by default
    Given the console is running at "https://oma.acme.com"
    When I view any code snippet
    Then the base URL should be "https://oma.acme.com"

  Scenario: Python and TypeScript snippets use fetch/httpx against the OMA server
    # The old CLI/SDK examples assumed users would use the Anthropic SDK.
    # Since Open Managed Agents is API-compatible but self-hosted, we should
    # either show generic HTTP client examples (curl, fetch, httpx) or
    # reference an OMA-specific SDK if one exists.
    When I view the Python snippet
    Then it should use httpx or requests against the OMA server URL
    When I view the TypeScript snippet
    Then it should use fetch against the OMA server URL

  Scenario: CLI snippet references the oma binary
    When I view the CLI snippet
    Then it should invoke "oma" not "anthropic"
    And it should point at OMA_API_URL, not ANTHROPIC_API_URL
