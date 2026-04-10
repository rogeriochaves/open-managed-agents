Feature: Update handlers persist every field declared on their zod schema
  As a client calling POST /v1/{resource}/{id}
  I want the server to write every field I sent
  So that my mutation isn't a silent no-op

  # Third in the silent-no-op series (after 51465dd for pagination
  # and 8382006 for date range filters). Sweep of every update
  # handler against its declared zod schema found two more bugs:
  #
  # 1. vaults update handler read body.name / body.description,
  #    but VaultUpdateBodySchema declares display_name + metadata.
  #    Neither actual schema field was ever persisted. A client
  #    POSTing { display_name: "Renamed" } would see the DB field
  #    unchanged AND the response body unchanged (because the
  #    handler ran a zero-column UPDATE and then SELECTed the row
  #    back). Worst kind of silent bug — the 200 looked fine.
  #
  # 2. environments update handler handled name / description /
  #    config.networking / config.packages, but silently ignored
  #    body.metadata despite it being on EnvironmentUpdateBodySchema.
  #    Less severe than the vault bug because the common-case
  #    update via the web UI doesn't touch metadata, but still a
  #    wire/handler mismatch.
  #
  # Both fixes also add an auditLog() call so the update shows up
  # in the audit log UI tab (c31923d).

  Background:
    Given every update handler reads c.req.valid("json")
    And zod has already rejected any field that isn't declared
    And any field declared MUST be referenced by the handler

  Scenario: POST /v1/vaults/:id with display_name persists the change
    Given a vault with display_name "Test Secrets"
    When I POST { display_name: "Renamed Secrets" }
    Then the response body shows display_name = "Renamed Secrets"
    And a subsequent GET shows the same (proves the write reached
      the DB, not just the response-building projection)

  Scenario: POST /v1/vaults/:id with metadata merges as a patch
    Given a vault with metadata {}
    When I POST { metadata: { env: "prod" } }
    And then POST { metadata: { team: "platform" } }
    Then the final metadata is { env: "prod", team: "platform" }
    # Matches the agents update handler's patch-merge behavior —
    # adding one key doesn't wipe the others.

  Scenario: POST /v1/environments/:id with metadata merges as a patch
    Given an environment with metadata { tier: "bronze" }
    When I POST { metadata: { owner: "platform" } }
    Then the merged metadata is { tier: "bronze", owner: "platform" }
    When I POST { metadata: { region: "eu-central-1" } }
    Then the merged metadata is
      { tier: "bronze", owner: "platform", region: "eu-central-1" }

  Scenario: Handlers write audit log entries on successful update
    Given auditLog() is called with (userId, "update", <resource>, id)
    When I POST /v1/vaults/:id with any update
    Then the audit_log table grows by one row with action="update"
    And the row surfaces in /settings → Audit log in the UI

  Scenario: Schema-vs-handler mismatch class lives in this file
    Given three silent-no-op bugs have shipped in this codebase now
      (after_id, created_at[gte], display_name)
    Then the rule "every declared field must be referenced"
      is the pattern to review against in every code review
    And any future update handler should be tested with at least
      one field-level assertion against a subsequent GET
