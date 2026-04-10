Feature: Every list route honors after_id cursor pagination
  As a self-hosting operator with more than 20 agents/sessions
  I want to click "Next page" and actually advance
  So that I can see all of my resources, not just the first 20

  # Prior state: all four list handlers (agents, sessions,
  # environments, vaults) accepted after_id via PageCursorQuerySchema
  # but NEVER read it in the handler body. The client tracked a
  # cursorStack and sent after_id on every "Next page" click, but
  # the server returned the same first 20 rows forever. A user with
  # 25 agents could literally only see 20 of them through the UI.
  # The OpenAPI docs advertised pagination; the implementation was
  # a lie.
  #
  # Fix: a shared buildAfterIdClause(db, table, afterId) helper in
  # packages/server/src/lib/pagination.ts looks up the cursor row's
  # created_at and returns "WHERE created_at < ?" plus the value.
  # Each list handler splices the clause into its own conditions
  # array alongside its existing filters (include_archived,
  # agent_id, etc.).

  Background:
    Given the server exposes list routes for agents, sessions,
      environments, and vaults
    And each route accepts after_id via PageCursorQuerySchema
    And the client paginates by pushing the current after_id onto
      a cursorStack and calling with data.last_id

  Scenario: agents list paginates with after_id
    Given three agents exist with created_at t1 < t2 < t3
    When I GET /v1/agents?limit=1
    Then the response contains only the t3 row
    And has_more is true
    And last_id is the t3 row id
    When I GET /v1/agents?limit=1&after_id=<t3_id>
    Then the response contains only the t2 row (NOT t3 again)
    When I GET /v1/agents?limit=1&after_id=<t2_id>
    Then the response contains only the t1 row
    And has_more is false

  Scenario: sessions / environments / vaults all paginate identically
    Given three rows exist in each table
    When I GET /v1/<resource>?limit=1
    And then GET /v1/<resource>?limit=1&after_id=<last_id>
    Then each subsequent page returns a strictly earlier row

  Scenario: Unknown after_id degrades to page 1
    Given the cursor row was deleted between page loads
    Or the caller passed a bogus id from a stale browser tab
    When I GET /v1/agents?limit=20&after_id=agent_does_not_exist
    Then the route does NOT 500
    And it does NOT return an empty page silently
    And it falls back to "no filter" (page 1) so the user recovers gracefully

  Scenario: Same-second ties are graceful, not catastrophic
    Given two rows have identical created_at strings (SQLite second granularity)
    When pagination uses a strict `<` comparison
    Then the tie pair may appear on two adjacent pages
    # This is acceptable — a duplicate row at the boundary is
    # strictly better than being stuck on page 1. A full fix would
    # use tuple comparison (created_at, id) < (?, ?) but the
    # syntax differs between sqlite and postgres so we keep it
    # simple and document the tradeoff.

  Scenario: Pagination helper is shared, not duplicated
    Given packages/server/src/lib/pagination.ts exposes buildAfterIdClause
    When I grep for the function name
    Then it's imported in exactly four routes: agents, sessions,
      environments, vaults
    And no route inlines its own cursor-lookup SQL
