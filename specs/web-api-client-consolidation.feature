Feature: Every web query and mutation routes through packages/web/src/lib/api.ts
  As a web UI operator
  I want errors from the server to actually reach me
  So that I don't stare at silently-empty pages when a request fails

  # Prior state: several pages (settings.tsx, usage.tsx) hit the server
  # with raw `fetch(...).then(r => r.json())`. Two concrete problems:
  #
  #   1) No res.ok check. A 401 from the server returns a JSON error
  #      body, which json() happily parses and hands back as "data". The
  #      calling code does `data?.data ?? []` and renders an empty list.
  #      The user sees an empty org/user/team/policy page with zero
  #      indication that their session expired or they lack permission.
  #
  #   2) Errors thrown by raw fetch didn't carry `.status`, so the
  #      QueryCache onError hook installed in main.tsx (which bounces to
  #      /login on 401) never fired — the centralised auth guard was
  #      inert for every query that bypassed api.ts.
  #
  # Fix: add listOrganizations, listUsers, listTeams, createTeam,
  # createUser, listTeamProviderAccess, setTeamProviderAccess,
  # listTeamMcpPolicies, setTeamMcpPolicy, getUsageSummary to
  # packages/web/src/lib/api.ts, and replace every direct fetch in
  # settings.tsx and usage.tsx with the typed helper.

  Background:
    Given api.ts exposes a request<T>() helper that
      throws on any non-2xx response with error.status set
    And main.tsx installs a QueryCache onError that redirects
      to /login whenever error.status === 401

  Scenario: Settings queries all throw on 401
    Given I'm signed out (no valid oma_session cookie)
    When I navigate to /settings
    And the page fires its initial queries for
      organizations, users, teams, provider-access, and mcp-policies
    Then each query throws an error with .status === 401
    And the QueryCache onError hook navigates to /login
    And I do NOT see empty placeholder tables

  Scenario: Settings mutations route through api.ts
    Given I'm on /settings → Organization
    When I click "Add team" and submit the modal
    Then the POST goes out via api.createTeam(orgId, params)
    And the mutation error surface is wired to the modal form
    And a 403 from the server renders as "Failed to add team: ..."
    And the modal does not silently dismiss on failure

  Scenario: Usage page throws on 401 instead of rendering nothing
    Given /v1/usage/summary requires an authenticated cookie
    When I load /usage with an expired cookie
    Then api.getUsageSummary() throws {status: 401, ...}
    And the QueryCache onError hook navigates to /login
    And I never see the "Loading usage data..." spinner hang forever

  Scenario: No page in packages/web/src uses raw fetch for /v1 paths
    When I grep `fetch\(.*\/v1\/` inside packages/web/src
    Then the only matches are:
      - packages/web/src/lib/api.ts         (the request() helper itself)
      - packages/web/src/pages/login.tsx    (login POST must be callable pre-auth)
      - packages/web/src/lib/auth-context.tsx  (session bootstrap + logout)
    And every other page imports from ../lib/api and calls api.* directly
