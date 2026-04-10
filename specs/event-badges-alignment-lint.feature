Feature: Static lint prevents EVENT_BADGES ↔ SessionEvent drift
  As a reviewer of a new SessionEvent type
  I want CI to fail if the web UI has no EVENT_BADGES entry for it
  So that the new event doesn't silently render as a grey default
  badge with the raw type suffix as its label

  # Third lint in the boundary-drift series, mirroring the same
  # pattern as:
  #
  #   3266289 — schema ↔ handler alignment (request side)
  #   fbb287e — storeEvent ↔ SessionEvent union (server emit side)
  #
  # This one closes the UI render side. When 75367ed caught
  # `session.stopped`, the bug was that the engine was emitting
  # a type not in the union. The symmetric risk is: someone adds
  # a new type to the SessionEvent union (maybe for a new feature
  # like agent.sub_agent_call) but forgets to add a matching
  # EVENT_BADGES entry. The client's EVENT_BADGES[type] lookup
  # returns undefined, getEventBadge() falls through to the
  # default grey badge with the label `type.split(".").pop()`,
  # and the new event renders in the transcript as an unlabelled
  # grey pill.

  Background:
    Given packages/types/src/events.ts declares the SessionEvent union
    And packages/web/src/pages/session-detail.tsx owns EVENT_BADGES
    And EVENT_BADGES is `Record<string, { label, variant }>`
    And getEventBadge(type) ?? { label: type.split(".").pop(), variant: "default" }

  Scenario: Happy path — every declared type has a badge
    Given EVENT_BADGES has 20 entries covering every union member
    When the lint runs
    Then it passes

  Scenario: New type added to the union but no matching badge
    Given an engineer adds AgentSubAgentCallEvent with
      type: "agent.sub_agent_call" to the SessionEvent union
    And forgets to add an EVENT_BADGES entry
    When the lint runs
    Then it fails with:
      "The following SessionEvent types are declared in
       packages/types/src/events.ts but have no matching entry
       in EVENT_BADGES in session-detail.tsx:
         - 'agent.sub_agent_call'
       Add an entry to EVENT_BADGES with a friendly label + a
       variant from the Badge component's BadgeVariant union."

  Scenario: Orphan entries after a rename
    Given a type gets renamed from "session.status_rescheduled"
      to "session.status_retried" on the server side
    And EVENT_BADGES still has the old "session.status_rescheduled"
      key because nobody updated the map
    When the lint runs
    Then the reverse check fails with:
      "EVENT_BADGES has keys that are not declared in the
       SessionEvent union: 'session.status_rescheduled'"
    # Orphans accumulate silently as the project evolves unless
    # something flags them. The reverse check makes the lint
    # symmetric.

  Scenario: Sanity checks on the regex extractors
    Given both extractors could silently miss everything
    When the test suite runs
    Then the declared set size >= 15
    And the badges set size >= 15
    And both sets contain known types like agent.message and
      session.status_terminated

  Scenario: The extractor correctly scopes the EVENT_BADGES literal
    Given the declaration is
      const EVENT_BADGES: Record<string, { label: string; variant: string }> = { ... }
    And the Record<> type annotation contains braces of its own
    When the extractor anchors on `= \{` (the start of the value)
      rather than the first `\{` after the variable name
    Then block scoping lands on the real object literal, not the
      type annotation body
    # Caught this while writing the test: anchoring on the first
    # `\{` stole the type annotation's braces and made the badges
    # set silently empty.
