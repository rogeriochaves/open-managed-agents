Feature: Agent update and archive
  As a user
  I want to iterate on an agent definition
  So that I can tune its prompt, tools, and MCPs over time

  Background:
    Given an agent has been created with name, description, system
    prompt, and metadata {env: "dev", owner: "alice"}
    And its initial version is 1

  Scenario: Single-field update increments version
    When I POST /v1/agents/{id} with {version: 1, description: "updated"}
    Then the response is 200
    And version is now 2
    And description is "updated"
    And name is unchanged

  Scenario: Partial update leaves other fields untouched
    When I POST /v1/agents/{id} with only {version: 2, name: "renamed"}
    Then name is "renamed"
    And system prompt is still the original
    And version is now 3

  Scenario: Metadata is merged not replaced
    Given metadata is {env: "dev", owner: "alice"}
    When I POST /v1/agents/{id} with {version: 3, metadata: {region: "eu-west-1"}}
    Then metadata still contains env, owner, AND region

  Scenario: Metadata keys set to null are removed
    When I POST /v1/agents/{id} with {version: 4, metadata: {owner: null}}
    Then owner is no longer present
    And other keys are unaffected

  Scenario: Tools, mcp_servers, and skills arrays can be replaced wholesale
    When I POST with a new tools/mcp_servers/skills payload
    Then the agent returns the new arrays

  Scenario: Updating an unknown agent returns 404
    When I POST /v1/agents/agent_does_not_exist
    Then the response is 404

  Scenario: Archive hides from default list
    When I POST /v1/agents/{id}/archive
    Then archived_at is set
    And listing /v1/agents no longer includes it

  Scenario: include_archived=true reveals archived agents
    When I GET /v1/agents?include_archived=true
    Then the archived agent is present with archived_at populated
