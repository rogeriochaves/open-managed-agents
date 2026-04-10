Feature: Cooperative session stop
  As a user who kicked off an agent that's now spinning
  I want a Stop button that actually does something
  So that I'm not stuck waiting for maxIterations to expire or
  budget to blow through

  # Prior state: the Stop button was visible in the session-detail
  # header when session.status === "running" but had no onClick.
  # Users could not cancel a running agent from the UI. If an agent
  # got stuck in a tool loop, the only escape was to wait for the
  # 20-iteration cap or restart the server.

  Background:
    Given the auth guard is configured as usual
    And the engine's runAgentLoop checks the session.status row
      between iterations

  Scenario: POST /v1/sessions/:id/stop flips status and records a terminated event
    Given session sesn_1 exists with status "running"
    When I POST /v1/sessions/sesn_1/stop
    Then the response is 200
    And the returned session.status is "terminated"
    And the events list now contains a session.status_terminated row
      with reason: "user_requested"
    And the audit log records action="stop", resource_type="session"

  Scenario: Engine bails at the next iteration boundary
    Given the engine is mid-loop on sesn_2 between LLM calls
    When something (the Stop route, a crash handler, etc.) flips
      sessions.status to "terminated"
    Then on the next loop iteration the engine:
      - SELECTs sessions.status WHERE id = sessionId
      - sees "terminated" and emits a session.stopped event
      - returns from runAgentLoop WITHOUT firing another provider.chat()
    # NB: the in-flight LLM call from the previous iteration cannot
    # be cancelled mid-generation — that's a provider-side limitation.
    # In practice the stop takes effect within seconds at the next
    # iteration boundary.

  Scenario: Stop on an unknown session returns 404
    When I POST /v1/sessions/sesn_bogus/stop
    Then the response is 404 with type="not_found"

  Scenario: Stop button on the UI calls the real endpoint
    Given I'm on /sessions/:id and session.status is "running"
    When I click the Stop button in the header
    Then the web client calls api.stopSession(id)
    And the button transitions through "Stopping…" to disappear
      (the button only renders when status === "running")
    And the query for ["session", id] is invalidated so the header
      re-fetches and reflects status=terminated
