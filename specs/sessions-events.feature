Feature: Sessions and events
  As a developer using Open Managed Agents
  I want durable session transcripts with event streaming
  So that I can replay, debug, and audit every agent interaction

  Background:
    Given an agent has been created
    And no LLM provider is configured
    # Without a provider, the events route stores events durably
    # but skips runAgentLoop(), so this test exercises the pure
    # persistence path without hitting any real LLM.

  Scenario: Create a session bound to an agent and environment
    When I POST /v1/sessions with agent, environment_id, title
    Then the response is 200
    And the session id starts with "session_"
    And status is "idle"
    And the agent is attached to the session

  Scenario: Retrieve a session by id
    When I GET /v1/sessions/{id}
    Then I get back the session

  Scenario: List sessions
    When I GET /v1/sessions
    Then the created session appears in data

  Scenario: Update session title
    When I POST /v1/sessions/{id} with a new title
    Then the response is 200
    And the new title is reflected

  Scenario: Empty event list for a new session
    When I GET /v1/sessions/{id}/events
    Then data is empty
    And has_more is false

  Scenario: Store a user message event
    When I POST /v1/sessions/{id}/events with one user.message
    Then the response is 200
    And the stored event has an id starting with "evt_"

  Scenario: Batch-store multiple events in one POST
    When I POST /v1/sessions/{id}/events with two events
    Then the response data contains both

  Scenario: List events in ascending order
    When I GET /v1/sessions/{id}/events?order=asc&limit=100
    Then the events come back in insertion order

  Scenario: List events in descending order
    When I GET /v1/sessions/{id}/events?order=desc&limit=100
    Then the events come back in reverse insertion order

  Scenario: Pagination via limit + has_more
    When I GET /v1/sessions/{id}/events?order=asc&limit=2
    Then only 2 events are returned
    And has_more is true
    And first_id and last_id are populated

  Scenario: 404 for nonexistent session on send events
    When I POST /v1/sessions/session_does_not_exist/events
    Then the response is 404
