Feature: Vault detail page covers the full credential CRUD + archive flow
  As an admin managing encrypted secrets
  I want the vault detail page to have regression coverage
  So that a rename, route change, or state bug can't leak past review

  # Prior state: every other detail page (agents, sessions) had a
  # dedicated react-testing-library test suite, but vault-detail.tsx —
  # the one page that actually handles sensitive credentials — had
  # ZERO page-level coverage. The vaults-list.test.tsx covered the
  # list view only. A bug in credential CRUD or the delete-confirm
  # guard would have shipped invisibly.
  #
  # This spec documents the coverage delivered in vault-detail.test.tsx.

  Background:
    Given the vault-detail page mounts at /vaults/:vaultId
    And it uses api.getVault, api.listVaultCredentials,
        api.createVaultCredential, api.deleteVaultCredential,
        and api.archiveVault
    And every mutation is guarded by a window.confirm or a modal

  Scenario: Loading + render states
    Given the vault query is in-flight
    Then I see a "Loading vault..." placeholder
    When the query resolves with a vault
    Then I see the display name in the header and in the details sidebar
    And I see the active badge and the vault ID

  Scenario: Empty credentials table
    Given the vault has zero credentials
    Then I see an empty-state cell with "No credentials yet"
    And I see an "Add credential" button (because the vault is active)

  Scenario: Non-empty credentials table
    Given the vault has multiple credentials
    Then each credential name is rendered
    And the credential count (N) appears next to the Credentials heading

  Scenario: Archived vaults hide destructive actions
    Given the vault has archived_at set
    Then the status badge reads "archived"
    And there is NO "Archive" button in the header
    # The page still shows the existing credentials read-only so an
    # admin can audit them, but cannot add / delete / archive again.

  Scenario: Add credential modal validates name + value
    When I click "Add credential"
    Then I see name and value inputs
    And the "Save credential" button is disabled
    When I fill in the name only
    Then the button is still disabled (value empty)
    When I also fill in the value
    Then the button is enabled

  Scenario: Save credential POSTs to the server
    When I fill the modal with name=NOTION_API_KEY value=secret_xyz
    And I click Save credential
    Then api.createVaultCredential is called with
      vaultId="vlt_test123" and { name: "NOTION_API_KEY", value: "secret_xyz" }

  Scenario: Server error keeps the modal open with the message
    Given the server rejects the create with 409 "already exists"
    When I submit the form
    Then the modal does NOT close
    And I see the server error text inside the modal
    And the Cancel button is still present
    # This is important for operators — silently dismissing on failure
    # would make the UX look like the credential saved when it didn't.

  Scenario: Delete credential honours window.confirm
    Given the vault has one credential
    When I click "Delete" on the credential row
    And I confirm the dialog
    Then api.deleteVaultCredential is called with (vaultId, credId)
    When I click "Delete" on the credential row again
    And I cancel the dialog
    Then api.deleteVaultCredential is NOT called a second time

  Scenario: Archive vault honours window.confirm
    When I click the header "Archive" button
    And I confirm the dialog
    Then api.archiveVault is called with the vault id
    When I click Archive again and cancel
    Then api.archiveVault is not called a second time
