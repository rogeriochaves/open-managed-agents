Feature: CLI smoke test against a live self-hosted server
  As an operator
  I want to prove that the built `oma` binary actually drives my
  self-hosted OMA server end-to-end
  So that I can trust the self-hosting claim beyond unit-level mocks

  Background:
    Given the OMA server is running and reachable at OMA_API_BASE
    And the CLI has been built to packages/cli/dist/index.js
    And no ANTHROPIC_API_KEY is required in the environment

  Scenario: Server reachability
    When scripts/cli-smoke-test.sh is invoked
    Then it pings OMA_API_BASE first and fails fast with a clear
    error if the server is down

  Scenario: Agents list (table output)
    When I run `oma agents list --limit 3`
    Then the CLI connects to OMA_API_BASE and prints a table

  Scenario: Agents list (JSON output)
    When I run `oma --output json agents list --limit 1`
    Then the CLI prints JSON containing an "id" field

  Scenario: Environments list
    When I run `oma environments list`
    Then the CLI successfully returns the environments table

  Scenario: Sessions list
    When I run `oma sessions list --limit 3`
    Then the CLI returns without error (empty list is fine)

  Scenario: Vaults list
    When I run `oma vaults list`
    Then the CLI returns without error
