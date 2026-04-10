Feature: Date range filters on agents/sessions lists actually filter
  As an operator narrowing a list to a time window
  I want "Last 24 hours" / "Last 7 days" to change what I see
  So that the date dropdown isn't a visual illusion

  # Prior state: AgentListQuerySchema declared created_at[gte]/[lte]
  # and SessionListQuerySchema declared all four of
  # created_at[gt|gte|lt|lte], but neither handler ever read them.
  # The web list pages send `created_at[gte]` when the user picks
  # a date filter via dateFilterToParam() — the dropdown changed
  # state, the query key changed, the request fired with the param,
  # and the server quietly ignored it and returned the same rows.
  # A visual illusion of filtering.
  #
  # Same class of silent-no-op as the pagination bug caught in
  # 51465dd. Fix: a small buildCreatedAtClauses(query) helper in
  # packages/server/src/lib/pagination.ts returns { clauses, values }
  # that each handler splices into its conditions array.

  Background:
    Given packages/server/src/lib/pagination.ts exposes buildCreatedAtClauses
    And the agents and sessions list handlers call it
    And it reads created_at[gt], [gte], [lt], [lte] off the query

  Scenario: agents: created_at[gte] excludes rows older than the boundary
    Given two agents exist
      | created_at              |
      | 2025-01-01T00:00:00.000Z |
      | 2025-06-01T00:00:00.000Z |
    When I GET /v1/agents?created_at[gte]=2025-03-01T00:00:00.000Z
    Then the response contains the June row
    And does NOT contain the January row

  Scenario: agents: created_at[lte] excludes rows newer than the boundary
    Given two agents exist in January and December of 2024
    When I GET /v1/agents?created_at[lte]=2024-06-01T00:00:00.000Z
    Then the response contains the January row
    And does NOT contain the December row

  Scenario: sessions: created_at[gte] filter works end-to-end
    Given two sessions with old and recent created_at values
    When I GET /v1/sessions?created_at[gte]=<boundary>
    Then only the recent row is returned

  Scenario: Date range composes with after_id cursor
    Given three agents exist at t1 < t2 < t3
    And I apply created_at[gte]=t1.5 (so only t2 and t3 qualify)
    And I paginate with after_id=<t3 id> (so t3 is excluded as already-seen)
    When the handler builds the query
    Then it ANDs the cursor clause with the date range clause
    And returns only the t2 row

  Scenario: agent_version filter on sessions is deliberately not wired
    Given SessionListQuerySchema declares agent_version
    And implementing it would require json_extract (sqlite) / ->> (postgres)
    When the handler encounters agent_version in the query
    Then it ignores the param
    # This is a knowing decision, not a bug — a comment in
    # the handler points to the DbAdapter.jsonPathEquals helper
    # that should be added before wiring this filter. Adding
    # the sqlite-only json_extract would break the postgres
    # CI smoke job.
