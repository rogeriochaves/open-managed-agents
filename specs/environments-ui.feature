Feature: Environments UI
  As a user managing environments
  I want a list and editor for environments
  So that I can configure container templates for my agents

  Background:
    Given I am logged in

  Scenario: Display empty environments list
    Given no environments exist
    When I navigate to /environments
    Then I see a heading "Environments"
    And I see subtitle "Configuration template for containers, such as sessions or code execution."
    And I see an "Add environment" button
    And I see a radio group with "All" and "Active" filters
    And I see a table with columns: Name, Status, Type
    And the table shows "No environments yet" with "Create your first environment to get started."
    And I see disabled pagination buttons

  Scenario: Display environments in the table
    Given environments exist
    When I navigate to /environments
    Then I see environment rows with name, status, and type

  Scenario: Filter by active status
    Given active and archived environments exist
    When I click the "Active" radio filter
    Then only active environments are shown

  Scenario: Add a new environment
    When I click "Add environment"
    Then I see an environment creation form/dialog
    And I can set name, description, networking type, and packages

  Scenario: Edit an environment
    When I click on an environment in the table
    Then I see the environment detail/edit page
    And I can modify networking, packages, and metadata
