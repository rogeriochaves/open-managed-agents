Feature: Session detail pairs tool_use with tool_result for debug tracing
  As an operator investigating an agent session
  I want each tool_result to show the matching tool's name,
    execution duration, and a clear error indicator on failure
  So that I can debug a silent tool failure in the transcript
    without dropping into the raw events JSON

  # Prior state: session-detail.tsx rendered agent.tool_result
  # events with the generic "Result" badge and the raw content
  # concatenation. A silently failed tool call (is_error: true)
  # looked identical to a successful one. There was also a
  # stubbed formatDuration() that returned "" — dead code left
  # over from a half-finished feature. Operators debugging a
  # flaky MCP connector had no signal from the transcript view.
  #
  # Fix: build a one-pass Map<resultEventId, { name, durationMs,
  # isError }> indexed on the matching tool_use's id. Memoized
  # against the raw events array so the live stream only
  # recomputes on new rows (O(n), not O(n²) per render).

  Background:
    Given buildToolResultIndex(events) walks the event list once
    And each tool_use is stored by id keyed to its name + processed_at
    And each tool_result looks up its tool_use_id (or mcp_tool_use_id)
    And the index carries { name, durationMs, isError }

  Scenario: Failed tool result renders a red Error badge
    Given the stream emits
      | type              | id     | tool_use_id | is_error |
      | agent.tool_use    | evt_tu |             |          |
      | agent.tool_result | evt_tr | evt_tu      | true     |
    Then the tool_result row renders with the "terminated" badge variant
    And the badge label reads "Error" (not "Result")
    And the content text renders in red
    # Critical: a silent tool failure must be visible at the
    # transcript level. Before this, admins would only notice
    # when they clicked into the raw event JSON.

  Scenario: Successful tool_result shows "→ <name>" prefix + duration
    Given the stream emits
      | type              | id     | name       | processed_at             |
      | agent.tool_use    | evt_tu | web_search | 2026-04-01T00:00:00.000Z |
      | agent.tool_result | evt_tr |            | 2026-04-01T00:00:02.500Z |
    Then the tool_result row shows a "→ web_search" prefix line
    And the duration column shows "2.5s"
    And the default Result badge (not Error) applies

  Scenario: Orphan tool_result (no matching tool_use) degrades gracefully
    Given the stream emits an agent.tool_result whose tool_use_id
      has no matching tool_use in the session (replay gap, rehydration bug, etc.)
    Then the content still renders in the row
    And no "→ <name>" prefix is shown (we don't know the tool)
    And no duration is shown (we can't compute it)
    And the page does NOT crash — the index entry is undefined
      and every accessor guards on optional chaining

  Scenario: Index is memoized on the raw events array
    Given the session has N events
    When the React render cycle re-runs because of unrelated state (search, selectedEvent)
    Then buildToolResultIndex is NOT called again
    When the SSE stream pushes a new event
    Then buildToolResultIndex is called exactly once with the updated events array
    # Without memoization this was O(n²) per render as transcriptEvents.map
    # walked the list n times. Not measurable on small sessions but brutal
    # on a long session (1000+ events) — the UI would stutter on every
    # search keystroke.

  Scenario: Duration formatter covers sub-second, seconds, and minutes
    Given ms values 450, 2500, 127000
    Then formatDurationMs produces "450ms", "2.5s", "2m7s"
