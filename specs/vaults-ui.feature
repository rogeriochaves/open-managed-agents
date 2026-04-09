Feature: Credential Vaults UI
  As a user managing credentials
  I want a list and editor for credential vaults
  So that I can securely store and manage agent credentials

  Background:
    Given I am logged in

  Scenario: Display empty vaults list
    Given no vaults exist
    When I navigate to /vaults
    Then I see a heading "Credential vaults"
    And I see subtitle "Manage credential vaults that provide your agents with access to MCP servers and other tools."
    And I see a "New vault" button
    And I see a radio group with "All" and "Active" filters
    And I see a table with columns: Name, Status, Created
    And the table shows "No vaults yet" with "Create your first vault to get started."
    And I see disabled pagination buttons

  Scenario: Display vaults in the table
    Given vaults exist
    When I navigate to /vaults
    Then each row shows vault name, status, and created date

  Scenario: Filter by active status
    Given active and archived vaults exist
    When I click "Active" filter
    Then only active vaults are shown

  Scenario: Create a new vault
    When I click "New vault"
    Then I see a vault creation form
    And I can enter a display name
    And I can add metadata key-value pairs

  Scenario: Manage vault credentials
    Given a vault exists
    When I click on the vault in the table
    Then I see the vault detail page
    And I see the list of credentials
    And I can add new credentials (static bearer or MCP OAuth)
    And credential secret values are masked in the UI
