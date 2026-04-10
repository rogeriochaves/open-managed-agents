Feature: Static lint prevents silent-no-op schema/handler drift
  As a reviewer of a route-handler PR
  I want CI to fail if a schema field isn't referenced by its handler
  So that the class of bug caught in 51465dd / 8382006 / d41cd67
  can't silently ship again

  # Context: three iterations in a row shipped fixes for the exact
  # same shape of bug:
  #
  #   51465dd  after_id on every list route (pagination no-op)
  #   8382006  created_at[gte|lte|gt|lt] on agents+sessions lists
  #   d41cd67  display_name + metadata on vault update
  #                metadata on environment update
  #
  # In each case the zod schema declared the field, the web/CLI
  # client sent it, zod validated it, and the handler silently
  # dropped it on the floor. The 200 response looked fine. The
  # DB didn't change. The only way to notice was to dogfood.
  #
  # This spec documents the meta-lint that closes the class: a
  # server test that reads each Body/Query schema, pulls the
  # declared field names, and asserts each name is referenced in
  # the corresponding route handler's source.

  Background:
    Given packages/server/src/__tests__/schema-handler-alignment.test.ts exists
    And it walks BODY_SCHEMAS + QUERY_SCHEMAS declared at the top of the file
    And each entry points at a schemas/*.ts file and a named zod export
    And the handler file is the matching routes/*.ts file

  Scenario: Happy path — every field is wired
    Given AgentUpdateBodySchema declares { version, name, description, system,
      model, tools, mcp_servers, skills, metadata }
    When the lint reads routes/agents.ts
    Then it sees body.version, body.name, etc. for every field
    And the test passes

  Scenario: Field declared but never referenced fails the build
    Given a handler with `if (body.nonexistent !== undefined) ...`
    And the schema declares body.display_name instead
    When the lint runs
    Then it fails with:
      "VaultUpdateBodySchema declares field(s) ['display_name'] that are
       not referenced in routes/vaults.ts. This is the silent-no-op class
       caught in 51465dd/8382006/d41cd67 — the handler accepts the field
       but never writes it."
    And the fix is to either wire the field OR add an ALLOWED_UNWIRED entry

  Scenario: Shared helpers count as wiring for the fields they handle
    Given the handler calls buildCreatedAtClauses(query)
    And the helper reads query["created_at[gte]"] etc. internally
    When the lint processes routes/sessions.ts
    Then created_at[gt/gte/lt/lte] are treated as wired via the helper marker
    And the lint does NOT falsely flag them
    # Without this, every handler that uses a shared WHERE-builder
    # would need to inline the field references just to satisfy the
    # lint — defeating the point of the helper.

  Scenario: Comments can't mask real regressions
    Given a handler comment like
      "// schema declares { display_name, metadata }"
    And the handler actually only reads body.nonexistent
    When the lint runs
    Then the comment stripper removes the comment first
    And the missing body.display_name reference is flagged
    # Without comment stripping, the text `{ display_name, metadata }`
    # inside a comment would satisfy the destructuring-form check
    # and the real bug would slip through.

  Scenario: ALLOWED_UNWIRED exceptions require a real reason
    Given a SchemaName.field entry in ALLOWED_UNWIRED
    When the allowlist self-check runs
    Then the reason string must be >20 characters
    And the referenced field must still exist on the schema
    # Forces a human justification in review and prevents stale
    # allowlist entries from accumulating after renames.

  Scenario: Current exceptions
    Given the allowlist contains
      | key                                      | reason summary                        |
      | SessionListQuerySchema.agent_version     | needs DbAdapter.jsonPathEquals helper |
    Then each exception is justified in words and points at a real field
