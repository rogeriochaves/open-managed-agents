Feature: Server integration tests
  As a maintainer
  I want the server package to have its own test suite
  So that route changes and DB refactors cannot regress silently

  Background:
    Given the server exposes a createApp() factory (no serve() side effect)
    And tests set DATABASE_PATH to a temp file before importing app.ts
    And AUTH_ENABLED is "false" so tests bypass the auth guard
    And provider seeding is skipped for a clean deterministic DB

  Scenario: Health check
    When I GET /health
    Then the response is 200
    And the body status is "ok"

  Scenario: Create and retrieve an agent
    When I POST /v1/agents with a name, model, system prompt
    Then the response is 200
    And the agent id starts with "agent_"
    When I GET /v1/agents/{id}
    Then I get back the same agent

  Scenario: List agents
    When I GET /v1/agents
    Then the response is 200
    And the data array contains at least one agent

  Scenario: Rejects agent without name
    When I POST /v1/agents with only a model
    Then the response is a 4xx error

  Scenario: Environments seeded with default
    When I GET /v1/environments
    Then the data contains an environment with id "env_default"

  Scenario: Providers list endpoint
    When I GET /v1/providers
    Then the response is 200
    And the body has a data array

  Scenario: OpenAPI document is served
    When I GET /openapi.json
    Then the response is 200
    And the openapi version is 3.x
    And there are more than 5 documented paths
