Feature: Static lint prevents storeEvent ↔ SessionEvent union drift
  As a reviewer of an engine or route-handler change
  I want CI to fail if the server emits an event type that isn't
  declared on the SessionEvent union in packages/types/src/events.ts
  So that a drifted type like 75367ed's "session.stopped" can't
  silently break the UI's EVENT_BADGES map again

  # Background: 75367ed caught `session.stopped` — an event the
  # engine emitted on the cooperative-cancellation branch that
  # was NOT in packages/types/src/events.ts. The client's
  # EVENT_BADGES map only handles declared types, so a
  # user-cancelled session fell through to the default grey badge
  # and the UI waited 5s for polling before the status updated.
  #
  # That bug existed because nothing crosschecked the two sides.
  # The schema ↔ handler alignment lint (3266289) closed the
  # Body/Query side of the same pattern; this lint closes the
  # emitted-event side.

  Background:
    Given packages/server/src/__tests__/event-type-alignment.test.ts exists
    And it greps every literal "type" passed to storeEvent(...)
      and to INSERT INTO events (...) across the server source
      (excluding __tests__)
    And it reads packages/types/src/events.ts and extracts every
      `type: "<name>"` discriminator literal via regex

  Scenario: Happy path — every emit matches a declared type
    Given the engine emits session.status_running, agent.message,
      session.error, session.status_terminated, etc.
    And each of those literals appears on a concrete SessionEvent
      interface in packages/types/src/events.ts
    Then the lint passes

  Scenario: Engine emits an undeclared type
    Given an engineer adds storeEvent(..., "session.frobnicated", ...)
    And forgets to add FrobnicatedEvent to the SessionEvent union
    When the lint runs
    Then it fails with:
      "Found event types that are emitted by the server but not
       declared in packages/types/src/events.ts:
         - engine/index.ts:<line> emits 'session.frobnicated'
       This is the class of drift caught in 75367ed..."
    And the error mentions the file + line number for every
      offending emit site so the reviewer can fix them directly

  Scenario: Specific regression guard for session.stopped
    Given 75367ed removed the "session.stopped" literal entirely
    When the lint runs
    Then it asserts ZERO emit sites reference "session.stopped"
    # Anchored test — if someone restructures the union around a
    # new set of types and the structural test happens to pass
    # by coincidence (e.g. both sides drop to zero), this direct
    # assertion still catches a literal revert of the exact bug.

  Scenario: Dynamic evt.type from the API is out of scope
    Given /v1/sessions/:id/events accepts user-provided event types
    And those types are already zod-validated against
      UserEventParamsUnion at the request boundary
    When the lint scans the code
    Then it ignores `evt.type` references in the events route
    And only checks string literals in engine + route handler code
    # Zod already guarantees the dynamic path; this lint covers
    # the literal path where type safety doesn't reach.

  Scenario: Sanity checks on the extractor regexes
    Given the regex extractors could silently miss everything
    When the test suite runs
    Then the declared set must have >= 15 entries
    And the emitted set must include several known types
      (session.status_running, agent.message, session.error, ...)
    # Without these guards a broken regex would make the lint
    # vacuously pass and silently protect nothing.
