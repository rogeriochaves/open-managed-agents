Feature: Agents API
  As a developer
  I want to manage agent configurations via the API
  So that I can create reusable, versioned agent definitions

  Background:
    Given the API server is running
    And I have a valid API key

  # ── Create ────────────────────────────────────────────────────────────────

  Scenario: Create an agent with minimal config
    When I POST /v1/agents with:
      """json
      {
        "name": "My Agent",
        "model": "claude-sonnet-4-6"
      }
      """
    Then the response status is 200
    And the response body has:
      | field       | value                  |
      | type        | agent                  |
      | name        | My Agent               |
      | model.id    | claude-sonnet-4-6      |
      | version     | 1                      |
      | description | null                   |
      | system      | null                   |
    And "id" matches pattern "agent_*"
    And "created_at" is a valid RFC 3339 timestamp
    And "updated_at" is a valid RFC 3339 timestamp
    And "archived_at" is null
    And "tools" is an empty array
    And "mcp_servers" is an empty array
    And "skills" is an empty array
    And "metadata" is an empty object

  Scenario: Create an agent with full config
    When I POST /v1/agents with:
      """json
      {
        "name": "Coding Assistant",
        "model": {"id": "claude-sonnet-4-6", "speed": "fast"},
        "description": "Helps write code",
        "system": "You are a helpful coding assistant.",
        "tools": [{"type": "agent_toolset_20260401"}],
        "mcp_servers": [{"type": "url", "name": "my-server", "url": "https://mcp.example.com/sse"}],
        "skills": [{"type": "anthropic", "skill_id": "xlsx"}],
        "metadata": {"team": "engineering"}
      }
      """
    Then the response status is 200
    And the agent has tools with type "agent_toolset_20260401"
    And the agent has 1 MCP server named "my-server"
    And the agent has 1 anthropic skill "xlsx"
    And metadata.team is "engineering"

  Scenario: Create agent validates name length
    When I POST /v1/agents with name "" (empty)
    Then the response status is 400
    When I POST /v1/agents with a name longer than 256 characters
    Then the response status is 400

  Scenario: Create agent validates model
    When I POST /v1/agents without a model field
    Then the response status is 400

  Scenario: Create agent with tool configurations
    When I POST /v1/agents with tools:
      """json
      {
        "tools": [{
          "type": "agent_toolset_20260401",
          "configs": [
            {"name": "bash", "enabled": true, "permission_policy": {"type": "always_allow"}},
            {"name": "web_search", "enabled": false}
          ],
          "default_config": {"enabled": true, "permission_policy": {"type": "always_allow"}}
        }]
      }
      """
    Then the agent's tools[0].configs includes bash (enabled) and web_search (disabled)

  Scenario: Create agent with MCP toolset
    When I POST /v1/agents with:
      """json
      {
        "mcp_servers": [{"type": "url", "name": "slack", "url": "https://mcp.slack.com/sse"}],
        "tools": [{
          "type": "mcp_toolset",
          "mcp_server_name": "slack",
          "default_config": {"enabled": true, "permission_policy": {"type": "always_allow"}}
        }]
      }
      """
    Then the agent has an MCP toolset referencing "slack"

  Scenario: Create agent with custom tool
    When I POST /v1/agents with:
      """json
      {
        "tools": [{
          "type": "custom",
          "name": "get_weather",
          "description": "Get current weather for a location",
          "input_schema": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"]
          }
        }]
      }
      """
    Then the agent has a custom tool "get_weather"

  # ── Retrieve ──────────────────────────────────────────────────────────────

  Scenario: Retrieve an agent by ID
    Given an agent "test-agent" exists
    When I GET /v1/agents/:agentId
    Then the response status is 200
    And the response body matches the agent

  Scenario: Retrieve a specific version of an agent
    Given an agent "test-agent" exists at version 3
    When I GET /v1/agents/:agentId?version=2
    Then the response returns the agent at version 2

  Scenario: Retrieve a non-existent agent
    When I GET /v1/agents/agent_nonexistent
    Then the response status is 404

  # ── Update ────────────────────────────────────────────────────────────────

  Scenario: Update an agent
    Given an agent "test-agent" exists at version 1
    When I POST /v1/agents/:agentId with:
      """json
      {
        "version": 1,
        "name": "Updated Agent",
        "system": "New system prompt"
      }
      """
    Then the response status is 200
    And the agent name is "Updated Agent"
    And the agent version is 2

  Scenario: Update fails with stale version (optimistic concurrency)
    Given an agent "test-agent" exists at version 2
    When I POST /v1/agents/:agentId with version 1
    Then the response status is 409

  Scenario: Partial update preserves unset fields
    Given an agent with name "Original" and description "Desc" at version 1
    When I POST /v1/agents/:agentId with only {"version": 1, "name": "New Name"}
    Then the description remains "Desc"

  Scenario: Update metadata with patch semantics
    Given an agent with metadata {"a": "1", "b": "2"} at version 1
    When I POST /v1/agents/:agentId with:
      """json
      {"version": 1, "metadata": {"b": null, "c": "3"}}
      """
    Then the metadata is {"a": "1", "c": "3"}

  Scenario: Clear tools by sending empty array
    Given an agent with tools at version 1
    When I POST /v1/agents/:agentId with {"version": 1, "tools": []}
    Then the agent has no tools

  # ── List ──────────────────────────────────────────────────────────────────

  Scenario: List agents with pagination
    Given 25 agents exist
    When I GET /v1/agents?limit=10
    Then I receive 10 agents
    And has_more is true
    And first_id and last_id are set
    When I GET /v1/agents?limit=10&after_id=<last_id>
    Then I receive the next 10 agents

  Scenario: List agents with date filter
    Given agents created on different dates
    When I GET /v1/agents?created_at[gte]=2026-01-01T00:00:00Z
    Then I only receive agents created on or after that date

  Scenario: List agents excludes archived by default
    Given an active agent and an archived agent
    When I GET /v1/agents
    Then I only see the active agent
    When I GET /v1/agents?include_archived=true
    Then I see both agents

  # ── Archive ───────────────────────────────────────────────────────────────

  Scenario: Archive an agent
    Given an agent "test-agent" exists
    When I POST /v1/agents/:agentId/archive
    Then the response status is 200
    And archived_at is set to a timestamp
    And the agent no longer appears in default list

  # ── Versions ──────────────────────────────────────────────────────────────

  Scenario: List agent versions
    Given an agent updated 3 times
    When I GET /v1/agents/:agentId/versions
    Then I receive all 3 versions of the agent

  # ── OpenAPI spec ──────────────────────────────────────────────────────────

  Scenario: OpenAPI spec includes agents endpoints
    When I GET /openapi.json
    Then the spec includes paths:
      | method | path                          |
      | POST   | /v1/agents                    |
      | GET    | /v1/agents/{agentId}          |
      | POST   | /v1/agents/{agentId}          |
      | GET    | /v1/agents                    |
      | POST   | /v1/agents/{agentId}/archive  |
    And each path has request/response schemas
