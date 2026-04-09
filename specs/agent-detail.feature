Feature: Agent Detail Page
  As a user viewing an agent
  I want to see and edit the agent configuration
  So that I can manage my agent's behavior

  Background:
    Given I am logged in
    And an agent exists

  Scenario: View agent detail
    When I navigate to /agents/:agentId
    Then I see the agent name as the page title
    And I see a back arrow linking to /agents
    And I see the agent version number
    And I see the agent status (active/archived)
    And I see Config and Preview tabs

  Scenario: View agent config in YAML
    Given I am on the agent detail page
    And the Config tab is active
    Then I see the agent config in YAML format
    And I see YAML/JSON toggle tabs
    And I see fields: name, description, model, system, tools, mcp_servers, skills

  Scenario: View agent config in JSON
    When I click the JSON tab
    Then I see the agent config as formatted JSON

  Scenario: View agent metadata
    Then I see the agent metadata key-value pairs
    And I see created_at and updated_at timestamps
    And I see the agent ID

  Scenario: Archive an agent
    When I click the archive button
    Then the agent is archived
    And the status shows "archived"
