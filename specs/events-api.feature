Feature: Session Events API
  As a developer
  I want to send events to and receive events from sessions
  So that I can interact with running agents

  Background:
    Given the API server is running
    And I have a valid API key
    And a session exists in "idle" status

  # ── Send events ───────────────────────────────────────────────────────────

  Scenario: Send a user message event
    When I POST /v1/sessions/:sessionId/events with:
      """json
      {
        "events": [{
          "type": "user.message",
          "content": [{"type": "text", "text": "Hello, agent!"}]
        }]
      }
      """
    Then the response status is 200
    And the response contains the sent event with an assigned ID
    And the session transitions to "running"

  Scenario: Send a user message with image
    When I POST /v1/sessions/:sessionId/events with:
      """json
      {
        "events": [{
          "type": "user.message",
          "content": [
            {"type": "text", "text": "What's in this image?"},
            {"type": "image", "source": {"type": "base64", "data": "...", "media_type": "image/png"}}
          ]
        }]
      }
      """
    Then the event is accepted

  Scenario: Send a user interrupt event
    Given the session is "running"
    When I POST /v1/sessions/:sessionId/events with:
      """json
      {"events": [{"type": "user.interrupt"}]}
      """
    Then the session interrupts the agent

  Scenario: Send a tool confirmation (allow)
    Given the session is idle with requires_action for tool_use event "evt_123"
    When I POST /v1/sessions/:sessionId/events with:
      """json
      {
        "events": [{
          "type": "user.tool_confirmation",
          "tool_use_id": "evt_123",
          "result": "allow"
        }]
      }
      """
    Then the session resumes and executes the tool

  Scenario: Send a tool confirmation (deny)
    Given the session is idle with requires_action for tool_use event "evt_123"
    When I POST /v1/sessions/:sessionId/events with:
      """json
      {
        "events": [{
          "type": "user.tool_confirmation",
          "tool_use_id": "evt_123",
          "result": "deny",
          "deny_message": "Not allowed to delete files"
        }]
      }
      """
    Then the agent receives the denial with message

  Scenario: Send a custom tool result
    Given the session is idle with requires_action for custom_tool_use event "evt_456"
    When I POST /v1/sessions/:sessionId/events with:
      """json
      {
        "events": [{
          "type": "user.custom_tool_result",
          "custom_tool_use_id": "evt_456",
          "content": [{"type": "text", "text": "Temperature is 72F"}]
        }]
      }
      """
    Then the session resumes with the tool result

  # ── List events ───────────────────────────────────────────────────────────

  Scenario: List all events for a session
    Given a session with events
    When I GET /v1/sessions/:sessionId/events
    Then I receive all events in chronological order (asc)
    And each event has id, type, and processed_at

  Scenario: List events with pagination
    Given a session with many events
    When I GET /v1/sessions/:sessionId/events?limit=5
    Then I receive 5 events
    And I can paginate with after_id

  Scenario: List events in reverse order
    When I GET /v1/sessions/:sessionId/events?order=desc
    Then events are returned newest first

  # ── Stream events (SSE) ──────────────────────────────────────────────────

  Scenario: Stream events via SSE
    When I GET /v1/sessions/:sessionId/events/stream with Accept: text/event-stream
    Then I receive a server-sent event stream
    And events arrive as "data: {json}\n\n" lines

  Scenario: Stream shows all event types
    Given a session processes a user message
    Then the stream emits events in order:
      | type                              |
      | session.status_running            |
      | span.model_request_start          |
      | agent.thinking                    |
      | agent.tool_use                    |
      | span.model_request_end            |
      | agent.tool_result                 |
      | span.model_request_start          |
      | agent.message                     |
      | span.model_request_end            |
      | session.status_idle               |

  Scenario: Stream includes usage data
    Given a session is processing
    Then span.model_request_end events include model_usage:
      | field                        |
      | input_tokens                 |
      | output_tokens                |
      | cache_creation_input_tokens  |
      | cache_read_input_tokens      |

  Scenario: Stream emits error events
    Given the model is overloaded
    Then the stream emits a session.error event with:
      | field        | value                |
      | error.type   | model_overloaded_error |
      | error.retry_status.type | retrying    |

  Scenario: Stream ends on session deletion
    Given a streaming session
    When the session is deleted
    Then the stream emits session.deleted and closes

  # ── Session resources ─────────────────────────────────────────────────────

  Scenario: List session resources
    Given a session with resources
    When I GET /v1/sessions/:sessionId/resources
    Then I receive all resources with type, mount_path, timestamps

  Scenario: Add a file resource to a session
    When I POST /v1/sessions/:sessionId/resources with:
      """json
      {"type": "file", "file_id": "file_abc"}
      """
    Then the resource is added with a mount path

  Scenario: Delete a session resource
    Given a session resource exists
    When I DELETE /v1/sessions/:sessionId/resources/:resourceId
    Then the resource is removed
