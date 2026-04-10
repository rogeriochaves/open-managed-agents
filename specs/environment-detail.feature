Feature: Environment detail page covers networking, packages, and archive
  As an admin reviewing what an agent's sandbox can reach
  I want the environment detail page to have regression coverage
  So that a config-shape change or archive bug doesn't ship invisibly

  # Prior state: environment-detail.tsx renders the networking config
  # (unrestricted vs limited with allowed_hosts + mcp/pkg toggles), the
  # packages section grouped by manager, and an Archive button gated
  # behind window.confirm. None of this had page-level coverage —
  # only the list view was tested.

  Background:
    Given the environment-detail page mounts at /environments/:environmentId
    And it uses api.getEnvironment and api.archiveEnvironment

  Scenario: Loading + render states
    Given the environment query is in-flight
    Then I see "Loading environment..." placeholder
    When the query rejects with not-found
    Then I see "Environment not found"
    When the query resolves with an environment
    Then I see the env name + "active" badge in the header

  Scenario: Unrestricted networking renders the unrestricted label
    Given env.config.networking.type === "unrestricted"
    Then I see "Networking: unrestricted"
    And no allowed_hosts list is rendered

  Scenario: Limited networking renders allowed hosts and mcp/pkg toggles
    Given env.config.networking is limited with
      allowed_hosts=[api.github.com, api.slack.com]
      allow_mcp_servers=true allow_package_managers=false
    Then I see "Networking: limited"
    And each allowed host renders as a badge
    And I see "MCP servers: allowed"
    And I see "Package managers: blocked"

  Scenario: Packages render only the non-empty managers
    Given env.config.packages has npm=[lodash, zod] pip=[requests]
      and apt/cargo/gem/go all empty
    Then I see "lodash", "zod", "requests" in the packages section
    And I see headers for npm and pip
    And I do NOT see headers for apt/cargo/gem/go

  Scenario: All-empty packages render the empty-state line
    Given every package list is empty
    Then I see "No packages configured."

  Scenario: Archived environments hide the Archive button
    Given env.archived_at is set
    Then the status badge reads "archived"
    And there is NO "Archive" button in the header

  Scenario: Archive honours window.confirm
    When I click "Archive" and confirm
    Then api.archiveEnvironment is called with the env id
    When I click Archive again and cancel
    Then api.archiveEnvironment is not called a second time
