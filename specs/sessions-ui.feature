Feature: Sessions UI
  As a user managing sessions
  I want to view and interact with agent sessions
  So that I can trace, debug, and manage running agents

  Background:
    Given I am logged in

  # ── Sessions list ─────────────────────────────────────────────────────────

  Scenario: Display empty sessions list
    Given no sessions exist
    When I navigate to /sessions
    Then I see a heading "Sessions"
    And I see subtitle "Trace and debug Claude Managed Agents sessions."
    And I see a "New session" button
    And I see a "Go to session ID" text input
    And I see a "Created" date filter defaulting to "All time"
    And I see an "Agent" combobox filter defaulting to "All"
    And I see a "Show archived" toggle switch
    And I see a table with columns: checkbox, Name, Status, Agent, Created
    And the table shows "No sessions yet" with "Sessions will appear here once created through the API."
    And I see disabled pagination buttons

  Scenario: Display sessions in the table
    Given sessions exist
    When I navigate to /sessions
    Then each row shows session name/title, status badge, agent name, created date

  Scenario: Session status badges
    Then sessions display status badges:
      | status       | appearance    |
      | running      | green/active  |
      | idle         | gray/neutral  |
      | rescheduling | yellow/warning|
      | terminated   | red/error     |

  Scenario: Filter sessions by agent
    When I select a specific agent from the Agent dropdown
    Then only sessions for that agent are shown

  Scenario: Select sessions with checkboxes
    Given sessions exist
    When I check the "Select all rows" checkbox
    Then all visible sessions are selected
    And I see bulk action options

  Scenario: Navigate to session by ID
    When I type a session ID in the "Go to session ID" input
    And I press Enter
    Then I navigate to that session's detail page

  # ── Session detail ────────────────────────────────────────────────────────

  Scenario: View session detail page
    Given a session with events exists
    When I click on a session in the table
    Then I see the session detail page
    And I see the session title and status
    And I see the agent info
    And I see the event stream

  Scenario: Session event stream in Transcript mode
    Given a session with events
    When I view the session in Transcript mode
    Then I see events condensed by type:
      | badge  | shows                                    |
      | User   | User message content                     |
      | Tool   | Tool name, token count, duration, time   |
      | Agent  | Agent message content, tokens, time      |

  Scenario: Session event stream in Debug mode
    Given a session with events
    When I switch to Debug view mode
    Then I see every individual event:
      | badge      | shows                                           |
      | Running    | Session status running                           |
      | User       | User message with content                        |
      | Model      | Model request start                              |
      | Thinking   | Agent thinking                                   |
      | Tool       | Tool use with name and input                     |
      | Model      | Model usage (input, output, cache tokens)         |
      | Result     | Tool result                                       |
      | Agent      | Agent message content                             |
      | Idle       | Session idle with stop reason                     |
    And each event shows elapsed time from session start (e.g. "0:01:00")

  Scenario: Filter events by type
    Given a session with various event types
    When I click the "All events" dropdown
    Then I can select specific event types to filter
    When I select "Tool" events only
    Then only tool-related events are shown

  Scenario: Search events
    Given a session with events
    When I click the search icon
    And I type a search query
    Then events are filtered by the search text

  Scenario: Send a message to an idle session
    Given a session in "idle" status
    When I type a message in the input and click Send
    Then a user.message event is sent
    And the session starts running
    And new events stream in
