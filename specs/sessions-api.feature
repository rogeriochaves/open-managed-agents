Feature: Sessions API
  As a developer
  I want to manage agent sessions via the API
  So that I can run agents and interact with them

  Background:
    Given the API server is running
    And I have a valid API key
    And an agent and environment exist

  # ── Create ────────────────────────────────────────────────────────────────

  Scenario: Create a session with agent ID string
    When I POST /v1/sessions with:
      """json
      {
        "agent": "agent_abc123",
        "environment_id": "env_xyz789"
      }
      """
    Then the response status is 200
    And the response body has:
      | field          | value   |
      | type           | session |
      | status         | idle    |
    And "id" matches pattern "sesn_*"
    And agent.id is "agent_abc123"
    And agent.type is "agent"
    And environment_id is "env_xyz789"
    And resources is an empty array
    And vault_ids is an empty array
    And usage fields are zero

  Scenario: Create a session with agent version pinning
    When I POST /v1/sessions with:
      """json
      {
        "agent": {"id": "agent_abc123", "type": "agent", "version": 2},
        "environment_id": "env_xyz789"
      }
      """
    Then the session agent.version is 2

  Scenario: Create a session with title and metadata
    When I POST /v1/sessions with title "Test Session" and metadata {"run": "1"}
    Then the session title is "Test Session"
    And metadata.run is "1"

  Scenario: Create a session with file resource
    When I POST /v1/sessions with:
      """json
      {
        "agent": "agent_abc123",
        "environment_id": "env_xyz789",
        "resources": [{"type": "file", "file_id": "file_abc"}]
      }
      """
    Then the session has a file resource

  Scenario: Create a session with GitHub repository resource
    When I POST /v1/sessions with:
      """json
      {
        "agent": "agent_abc123",
        "environment_id": "env_xyz789",
        "resources": [{
          "type": "github_repository",
          "url": "https://github.com/org/repo",
          "authorization_token": "ghp_token",
          "checkout": {"type": "branch", "name": "main"}
        }]
      }
      """
    Then the session has a github_repository resource

  Scenario: Create a session with vault IDs
    When I POST /v1/sessions with vault_ids ["vlt_abc"]
    Then the session vault_ids contains "vlt_abc"

  # ── Retrieve ──────────────────────────────────────────────────────────────

  Scenario: Retrieve a session
    Given a session exists
    When I GET /v1/sessions/:sessionId
    Then the response includes the session with agent snapshot, status, usage, stats

  Scenario: Session agent is a snapshot at creation time
    Given an agent at version 1
    And a session created with that agent
    When I update the agent to version 2
    And I GET /v1/sessions/:sessionId
    Then the session agent still reflects version 1

  # ── Update ────────────────────────────────────────────────────────────────

  Scenario: Update session title
    Given a session exists
    When I POST /v1/sessions/:sessionId with {"title": "New Title"}
    Then the session title is "New Title"

  Scenario: Update session metadata
    Given a session with metadata {"a": "1"}
    When I POST /v1/sessions/:sessionId with {"metadata": {"a": null, "b": "2"}}
    Then metadata is {"b": "2"}

  # ── List ──────────────────────────────────────────────────────────────────

  Scenario: List sessions with pagination
    Given 15 sessions exist
    When I GET /v1/sessions?limit=5
    Then I receive 5 sessions
    And has_more is true

  Scenario: Filter sessions by agent
    Given sessions for different agents
    When I GET /v1/sessions?agent_id=agent_abc
    Then I only see sessions for that agent

  Scenario: Filter sessions by date range
    When I GET /v1/sessions?created_at[gte]=2026-04-01T00:00:00Z&created_at[lte]=2026-04-02T00:00:00Z
    Then I only see sessions created in that range

  Scenario: Sort sessions
    When I GET /v1/sessions?order=asc
    Then sessions are returned oldest first

  # ── Delete ────────────────────────────────────────────────────────────────

  Scenario: Delete a session
    Given a session exists
    When I DELETE /v1/sessions/:sessionId
    Then the response has type "session_deleted"
    And the session is permanently removed

  # ── Archive ───────────────────────────────────────────────────────────────

  Scenario: Archive a session
    Given a session exists
    When I POST /v1/sessions/:sessionId/archive
    Then archived_at is set

  # ── Session status lifecycle ──────────────────────────────────────────────

  Scenario: Session status transitions
    Given a new session (status: idle)
    When I send a user.message event
    Then the session transitions to "running"
    When the agent finishes processing
    Then the session transitions to "idle" with stop_reason "end_turn"

  Scenario: Session requires action (custom tool)
    Given an agent with a custom tool
    And a running session
    When the agent calls the custom tool
    Then the session goes idle with stop_reason "requires_action"
    And the stop_reason includes event_ids
    When I send a user.custom_tool_result event
    Then the session resumes running

  Scenario: Session requires action (tool confirmation)
    Given an agent with always_ask permission policy
    And a running session
    When the agent attempts a tool call
    Then the session goes idle with stop_reason "requires_action"
    When I send a user.tool_confirmation event with result "allow"
    Then the session resumes and executes the tool
