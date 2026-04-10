Feature: Session detail page
  As a user of Open Managed Agents
  I want to see my agent's full conversation with live updates
  So that I can observe what the agent is doing in real time

  Background:
    Given I am logged in
    And an agent named "support-agent" exists
    And an environment "env_default" exists

  Scenario: New session transcript shows all events end-to-end
    # Bug: on a brand new session, events sent right after navigation were
    # not appearing in the transcript even though the API had them.
    # Root cause: a race between the initial useQuery for events and the SSE
    # stream. The SSE stream delivered events first, then the initial query
    # resolved with an empty list (snapshot from before the send) and
    # clobbered the state.
    Given I just created a session
    When I navigate to the session detail page
    And I send a user message
    And the agent responds
    Then the transcript should show the user message and the agent reply
    And the events counter should match the number of events stored in the DB

  Scenario: Transcript view filters to conversation events
    Given a session has user.message, agent.message and span events
    When I view the Transcript tab
    Then I should see user and agent messages
    And I should not see span.model_request_start or span.model_request_end

  Scenario: Debug view shows every event
    Given a session has user.message, agent.message and span events
    When I view the Debug tab
    Then I should see every event type including spans and status changes

  Scenario: Clicking an event opens the detail panel
    When I click on an agent message event
    Then a side panel should open with the event details
    And it should show timing, content and raw JSON

  Scenario: Live streaming shows new events as they arrive
    Given I am viewing an active session
    When the agent emits a new message via SSE
    Then the event should appear in the transcript without a reload
    And the "live" indicator should be visible

  Scenario: Copy all events to clipboard
    When I click the copy icon in the toolbar
    Then the clipboard should contain a text dump of all events

  Scenario: Download events as JSON
    When I click the download icon in the toolbar
    Then a JSON file with all events should be downloaded

  Scenario: Session header shows title, status, agent, duration, tokens
    Then the header should show the session title
    And a status badge (idle/running/terminated)
    And the agent name
    And active duration
    And total input/output tokens when > 0
