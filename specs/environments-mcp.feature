Feature: Environments and MCP connector discovery
  As an enterprise operator
  I want to define per-team execution environments and browse
  the MCP connector catalog
  So that I can govern networking, package access and integrations

  Scenario: Default environment is seeded on first boot
    When I GET /v1/environments/env_default
    Then the response is 200 and type is "environment"

  Scenario: Create an unrestricted environment
    When I POST /v1/environments with networking.type="unrestricted"
    Then the created environment has the same networking config

  Scenario: Create a limited environment with an allow-list
    When I POST /v1/environments with networking.type="limited"
    And I supply allowed_hosts and allow_package_managers=false
    Then those fields are persisted and returned unchanged

  Scenario: List environments
    When I GET /v1/environments
    Then the default and all custom environments are returned

  Scenario: Update an environment name
    When I POST /v1/environments/{id} with a new name
    Then the response reflects the new name

  Scenario: Archive an environment
    When I POST /v1/environments/{id}/archive
    Then archived_at is set
    And the environment is hidden from the default list
    And it reappears when include_archived=true

  Scenario: List MCP connector catalog
    When I GET /v1/mcp/connectors
    Then the data array includes slack, notion, github, linear, sentry

  Scenario: Search connectors by name
    When I GET /v1/mcp/connectors?search=slack
    Then every returned connector's id contains "slack"

  Scenario: Filter connectors by category
    Given the first connector's category is X
    When I GET /v1/mcp/connectors?category=X
    Then every returned connector has category X

  Scenario: Retrieve a specific connector by id
    When I GET /v1/mcp/connectors/slack
    Then the response is 200 with id, name, description

  Scenario: Unknown connector returns 404
    # Fix: previously the route threw a bare Error which the global
    # handler coerced to 500. It now throws with status=404 so the
    # handler returns the correct HTTP status and `not_found` type.
    When I GET /v1/mcp/connectors/does-not-exist
    Then the response is 404
