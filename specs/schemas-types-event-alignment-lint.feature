Feature: Server zod event schemas and the types package agree
  As a reviewer of a new event type
  I want CI to fail if I add it to only one side of the boundary
  So that the server's runtime validation and the client's
  compile-time types can never disagree

  # Fourth lint in the boundary-drift series:
  #
  #   3266289 — request-side: schema fields ↔ handler body reads
  #   fbb287e — server-emit side: storeEvent literals ↔ SessionEvent union
  #   dcf3509 — UI render side: EVENT_BADGES ↔ SessionEvent union
  #   THIS    — schema/types package side: zod literals ↔ TS discriminators
  #
  # Before this lint: packages/server/src/schemas/events.ts
  # declared z.literal("agent.message"), z.literal("session.
  # status_terminated"), etc. for runtime validation of the
  # /v1/sessions/:id/events request body and for tagging stored
  # rows. packages/types/src/events.ts declared the same strings
  # as TypeScript discriminators on concrete interfaces that the
  # web + CLI consume via @open-managed-agents/types. Nothing
  # crosschecked the two. If an engineer added a new type to
  # one file and forgot the other:
  #
  #   - Missing from types: the client receives an event whose
  #     `type` literal doesn't narrow the SessionEvent union.
  #     The switch/case in EVENT_BADGES falls through to default,
  #     TypeScript allows the assignment with no warning.
  #
  #   - Missing from server: the client sends a payload that
  #     TypeScript considers valid, zod rejects it with a 400,
  #     and the discriminator mismatch shows up only at runtime.

  Background:
    Given packages/server/src/schemas/events.ts validates
      incoming event payloads via a z.discriminatedUnion over
      z.literal("<type>") tags
    And packages/types/src/events.ts declares the canonical TS
      interfaces keyed on the same `type: "<literal>"` fields
    And both files should list the exact same set of event types

  Scenario: Happy path — both sides list the same 20 events
    When the lint runs on both files
    Then extractServerZodLiterals returns 20 entries
    And extractTypesInterfaceLiterals returns 20 entries
    And the symmetric difference is empty
    And the test passes

  Scenario: Server declares an event the types package doesn't
    Given an engineer adds z.literal("agent.reflection") to the
      server event schemas
    And forgets to add AgentReflectionEvent to the TS union
    When the lint runs
    Then it reports
      'Declared as z.literal() in packages/server/src/schemas/
       events.ts but MISSING from the types package at
       packages/types/src/events.ts:
         - "agent.reflection"'

  Scenario: Types package declares an event the server doesn't
    Given an engineer adds AgentReflectionEvent to the TS union
    And forgets the matching z.literal on the server side
    When the lint runs
    Then it reports
      'Declared on a SessionEvent interface in packages/types/
       src/events.ts but MISSING from the server zod schemas
       at packages/server/src/schemas/events.ts:
         - "agent.reflection"'
    # Matters for CLI use: Anthropic SDK sends a typed payload,
    # server zod rejects the unknown literal with a 400, and
    # the error surfaces only at runtime — not at the CLI's
    # TypeScript compile step.

  Scenario: Both-sides rename is caught
    Given a rename flips "agent.thinking" to "agent.thinking_v2"
      on the server side only
    When the lint runs
    Then it reports BOTH the new name missing from types AND
      the old name missing from the server, so the reviewer
      sees both halves of the incomplete migration at once

  Scenario: Sanity checks on the extractor regexes
    Given the lint could silently pass with two empty sets if
      either regex breaks
    When the test runs
    Then both sets must have >= 15 entries
    And both must include known types agent.message and
      session.status_terminated
