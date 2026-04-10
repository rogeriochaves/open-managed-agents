Feature: Static lint prevents audit action ↔ UI actionVariant drift
  As a reviewer of a new mutation handler that writes to the audit log
  I want CI to fail if settings.tsx actionVariant has no case for it
  So that new audit entries don't silently render as a default grey
  badge with no visual styling in the Settings → Audit log tab

  # Fifth lint in the boundary-drift series:
  #
  #   3266289 — request-side: schema fields ↔ handler body reads
  #   fbb287e — server-emit side: storeEvent literals ↔ SessionEvent
  #   dcf3509 — UI render side: EVENT_BADGES ↔ SessionEvent union
  #   0e2998f — schema/types side: zod literals ↔ TS discriminators
  #   THIS    — audit side: auditLog(...) writes ↔ actionVariant()
  #
  # Every mutation handler in packages/server/src/routes/*.ts calls
  # auditLog(userId, "<action>", "<resource>", id, details?) on
  # success (create / update / archive / delete / stop / connect /
  # disconnect / …). The Settings → Audit log tab in
  # packages/web/src/pages/settings.tsx renders each row's action
  # via Badge variant={actionVariant(action)}. If an engineer adds
  # a new action string on the server but forgets to extend
  # actionVariant, the row falls through to `default` — a plain
  # grey pill with no color, indistinguishable from a typo or an
  # unknown action.
  #
  # The lint caught three real latent drifts on first run:
  #   - "stop"       — cancellation route added after actionVariant
  #                    was written; c31923d landed without UI update
  #   - "connect"    — MCP connector lifecycle; never added
  #   - "disconnect" — MCP connector lifecycle; never added

  Background:
    Given packages/server/src/routes/*.ts call
      auditLog(currentUserId, "<action>", "<resource>", id, details?)
      on every mutation
    And packages/web/src/pages/settings.tsx owns actionVariant(action)
    And actionVariant is a chain of `action === "foo"` comparisons
      returning an "active" | "terminated" | "info" | "default"
      Badge variant
    And both sides should list the exact same set of action strings

  Scenario: Happy path — every server-written action is handled
    Given the extraction regex walks routes/*.ts and pulls action
      literals out of auditLog(...) calls
    When the lint runs
    Then extractServerAuditActions returns >= 4 entries
    And extractUiHandledActions returns >= 4 entries
    And every server action has a case in actionVariant
    And every actionVariant case is written by some route

  Scenario: Server adds a new action with no matching UI case
    Given an engineer adds a new mutation endpoint that calls
      auditLog(userId, "pause", "session", id)
    And forgets to extend actionVariant with a `pause` case
    When the lint runs
    Then it fails with:
      'The following audit log actions are written by
       packages/server/src/routes/*.ts via auditLog(...) but have
       no matching case in settings.tsx actionVariant:
         - "pause"'
    And the message explains that the row renders with the default
      grey badge and references the four prior drift lints

  Scenario: Orphan case in actionVariant after a rename
    Given the server renames the "archive" action to "soft_delete"
    And actionVariant still has a case for "archive"
    When the lint runs
    Then the reverse check fails with:
      'settings.tsx actionVariant handles actions that are NOT
       written by any auditLog(...) call in
       packages/server/src/routes/*.ts:
         - "archive"'
    # Orphans accumulate silently as routes rename or delete their
    # audit actions. The reverse check makes the lint symmetric.

  Scenario: Paren-safe regex — auditLog first arg contains nested parens
    Given auditLog is almost always called as
      `auditLog(await currentUserId(c), "<action>", "<resource>", …)`
    And a naive `auditLog\([^)]*?,` regex stops at the `)` inside
      `currentUserId(c)` and never reaches the action arg
    When the real regex anchors on the pattern
      `"<action>", "<resource>"` where <resource> is one of the
      known audit resource types
    Then nested parens in the first arg can't trip the matcher
    And the lint finds every auditLog call regardless of how the
      first arg is formed
    # First attempt at the extractor failed silently — two matches
    # instead of the real seven. Pinning on the resource literal
    # gives an unambiguous anchor that works across any first-arg
    # shape.

  Scenario: Sanity checks on the extractor regexes
    Given the lint could silently pass with two empty sets if
      either regex breaks
    When the test runs
    Then written.size >= 4
    And handled.size >= 4
    And both sets contain "create" and "update"
    And the server side also contains "archive"
