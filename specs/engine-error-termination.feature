Feature: Errored sessions end up terminated, not idle
  As an operator scanning the sessions list for failures
  I want a failed run to look visually distinct from a successful one
  So that I can find and debug it without opening each session

  # Prior state: runAgentLoop's catch block emitted session.error
  # (good) but then ran updateSessionStatus(sessionId, "idle") and
  # emitted session.status_idle with stop_reason "end_turn". The
  # sessions list and the status badge on the session detail page
  # both read the DB `status` column, so a failed session showed
  # the same green-ish "idle" badge as a successful one. An
  # operator had to click into the session and scroll the timeline
  # to find the buried session.error event to know anything had
  # gone wrong.
  #
  # The badge component's statusVariant() already maps "terminated"
  # to a red variant — the fix is as simple as setting the status
  # to "terminated" in the error branch and emitting
  # session.status_terminated instead of session.status_idle. The
  # underlying session.error event with the stack trace is still
  # emitted and still rendered in the transcript, so no debug info
  # is lost; the change is purely about surfacing the failure at
  # the list-view level.

  Background:
    Given the engine's runAgentLoop catches any error thrown from
      provider.chat(), tool execution, or the message-building code
    And the session status column is one of
      | rescheduling | running | idle | terminated |
    And the UI badge renders "terminated" in red via statusVariant

  Scenario: Provider throws mid-run
    Given a session with a seed user.message event
    And a throwing LLMProvider stub whose chat() always rejects
    When runAgentLoop runs
    Then the emitted event sequence starts with
      | session.status_running |
      | session.error          |
      | session.status_terminated |
    And the session row's status column reads "terminated"
    And the event list does NOT end with session.status_idle
    # The previous bug ended the sequence with session.status_idle
    # + stop_reason "end_turn", which is indistinguishable from a
    # successful run in the sessions list UI.

  Scenario: Operator scans the sessions list for failures
    Given a mixed workload of successful and errored sessions
    When I load /sessions in the UI
    Then successful runs render with the green "idle" badge
    And errored runs render with the red "terminated" badge
    And I can filter / eyeball failures without opening each session

  Scenario: The session.error event is still emitted and visible
    Given a run that errored out
    When I open the session detail page
    Then I see a session.error event in the transcript with the
      provider error type and message
    And I see the final session.status_terminated event
    # Debug info is preserved — this fix is purely about surfacing
    # the failure state at the list-view level, not about
    # hiding error details.
