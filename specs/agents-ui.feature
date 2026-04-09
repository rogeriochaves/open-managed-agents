Feature: Agents UI
  As a user managing agents
  I want a list and detail view for agents
  So that I can view, create, edit, and archive agents

  Background:
    Given I am logged in

  # ── Agents list page ──────────────────────────────────────────────────────

  Scenario: Display empty agents list
    Given no agents exist
    When I navigate to /agents
    Then I see a heading "Agents"
    And I see a subtitle "Create and manage autonomous agents."
    And I see a "New agent" button
    And I see a "Go to agent ID" text input
    And I see a "Created" date filter dropdown defaulting to "All time"
    And I see a "Show archived" toggle switch (off by default)
    And I see a table with columns: Name, Model, Status, Created, Last updated
    And the table shows "No agents yet" with a link "Get started with agents"
    And I see "Previous page" and "Next page" pagination buttons (both disabled)

  Scenario: Display agents in the table
    Given agents exist:
      | name            | model             | status | created    |
      | My Agent        | claude-sonnet-4-6 | active | 2026-04-01 |
      | Research Bot    | claude-opus-4-6   | active | 2026-04-05 |
    When I navigate to /agents
    Then I see 2 rows in the agents table
    And each row shows the agent name, model, status, created date, and last updated date

  Scenario: Navigate to agent by ID
    When I type "agent_abc123" in the "Go to agent ID" input
    And I press Enter
    Then I navigate to the agent detail page for "agent_abc123"

  Scenario: Filter agents by date
    When I click the "All time" date filter
    And I select "Last 7 days"
    Then only agents created in the last 7 days are shown

  Scenario: Show archived agents
    Given archived agents exist
    When I toggle "Show archived" on
    Then archived agents appear in the table
    And archived agents have a visual indicator

  Scenario: Pagination
    Given more than 20 agents exist
    Then the table shows the first page of agents
    And the "Next page" button is enabled
    When I click "Next page"
    Then the next page of agents is displayed

  # ── New agent ─────────────────────────────────────────────────────────────

  Scenario: Create a new agent from list page
    When I click "New agent"
    Then I am taken to the quickstart flow

  # ── Agent detail/edit ─────────────────────────────────────────────────────

  Scenario: View agent detail
    Given an agent "My Agent" exists
    When I click on "My Agent" in the agents table
    Then I see the agent detail page
    And I see the agent name, description, model, system prompt
    And I see tools configuration
    And I see MCP servers list
    And I see skills list
    And I see metadata
    And I see version number and timestamps
