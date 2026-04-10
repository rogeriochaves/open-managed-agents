Feature: CLI wire contract asserts every SDK call hits the right server route
  As a self-hosting operator driving OMA from the command line
  I want every `oma *` command to land on the intended route
  So that an SDK upgrade or a typo doesn't silently 404 my automation

  # Prior state: the CLI delegates to the Anthropic SDK, which
  # owns URL construction and picks the HTTP method per call. We
  # had a unit test that `client.baseURL` points at the self-hosted
  # server, and a smoke-test script that ran the happy path
  # (agents list/create, environments list, etc.), but NOTHING
  # tested that the SDK's archive/update/delete methods actually
  # map to the routes our server exposes.
  #
  # This is the same class of bug we caught for the web client in
  # 892989c (archiveAgent used DELETE where the server wanted POST
  # /archive). The CLI had the same exposure because:
  #
  #   - `oma agents archive` → client.beta.agents.archive(id)
  #   - `oma sessions archive` → client.beta.sessions.archive(id)
  #   - `oma environments archive` → client.beta.environments.archive(id)
  #   - `oma vaults archive` → client.beta.vaults.archive(id)
  #
  # If the SDK's archive method used DELETE, all four commands
  # would hard-delete in production — a silent destructive bug.

  Background:
    Given packages/cli/src/__tests__/contract.test.ts stubs global.fetch
    And each test calls the SDK method exactly as the CLI command does
    And each assertion compares the captured URL pathname + HTTP method

  Scenario: Agents commands route correctly
    When the CLI calls client.beta.agents.create(...)
    Then fetch hits POST /v1/agents
    When the CLI calls client.beta.agents.list(...)
    Then fetch hits GET /v1/agents
    When the CLI calls client.beta.agents.retrieve(id)
    Then fetch hits GET /v1/agents/:id
    When the CLI calls client.beta.agents.update(id, { version, name })
    Then fetch hits POST /v1/agents/:id (NOT put)
    And the body carries version + name
    When the CLI calls client.beta.agents.archive(id)
    Then fetch hits POST /v1/agents/:id/archive (NOT delete)

  Scenario: Sessions commands route correctly
    When client.beta.sessions.create(...)      → POST /v1/sessions
    And  client.beta.sessions.list(...)        → GET  /v1/sessions
    And  client.beta.sessions.archive(id)      → POST /v1/sessions/:id/archive (NOT delete)
    And  client.beta.sessions.delete(id)       → DELETE /v1/sessions/:id (hard delete)
    And  client.beta.sessions.events.send(...) → POST /v1/sessions/:id/events
    And  client.beta.sessions.events.list(...) → GET  /v1/sessions/:id/events

  Scenario: Environments commands route correctly
    When client.beta.environments.create(...)   → POST /v1/environments
    And  client.beta.environments.list(...)     → GET  /v1/environments
    And  client.beta.environments.archive(id)   → POST /v1/environments/:id/archive (NOT delete)
    And  client.beta.environments.delete(id)    → DELETE /v1/environments/:id (hard delete)

  Scenario: Vaults commands route correctly
    When client.beta.vaults.create(...)    → POST /v1/vaults
    And  client.beta.vaults.list(...)      → GET  /v1/vaults
    And  client.beta.vaults.archive(id)    → POST /v1/vaults/:id/archive (soft, NOT delete)
    And  client.beta.vaults.delete(id)     → DELETE /v1/vaults/:id (hard delete)

  Scenario: SDK ?beta=true query does not confuse route matching
    Given the Anthropic SDK appends ?beta=true to every URL
    When the CLI makes any call
    Then the server's Hono+zod-openapi router ignores the unknown query param
    And only the pathname + HTTP method determine the matched route
    # This is why the contract test asserts on pathname, not on full URL.
