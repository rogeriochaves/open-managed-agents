Feature: Audit log viewer on Settings page
  As an enterprise admin running Open Managed Agents
  I want to see who did what, when, and against which resource
  So that I can investigate incidents and satisfy compliance
  without shelling into the database

  # Prior state: the server already wrote an audit_log row on every
  # create, update, archive, and delete (see audit-auto.test.ts), and
  # exposed /v1/audit-log with resource_type filtering. But the web
  # UI had zero way to view it — admins had to `sqlite3 oma.db` or
  # curl the API by hand to answer "who archived this vault?". That
  # defeats the self-hosting governance story.
  #
  # This spec documents the Settings → Audit log tab added alongside
  # Providers / Organization / Governance.

  Background:
    Given I'm signed in as an admin
    And the server's audit_log has entries for create/update/archive
    And api.listAuditLog routes through packages/web/src/lib/api.ts
      with the same error-throwing request() contract as every
      other query (401s bounce to /login)

  Scenario: Audit log tab is present alongside the other Settings tabs
    When I open /settings
    Then I see four tabs: Providers, Organization, Governance, Audit log
    And the Audit log tab has a scroll-text icon

  Scenario: The audit query is lazy — fires only when the tab opens
    Given I land on /settings (default tab: Providers)
    Then api.listAuditLog has NOT been called
    When I click the Audit log tab
    Then api.listAuditLog is called with { limit: 100 }
    # This matters because the audit log is often large and admins
    # don't always care about it. Eager-loading would slow the
    # Settings page for every user.

  Scenario: Entries render with actor, action, resource, timestamp
    Given the audit log returns entries with create/update/archive actions
    When I open the Audit log tab
    Then each row shows
      | column       | shape                                      |
      | Time         | localized timestamp                        |
      | Actor        | user's display name or "system" if null    |
      | Action       | badge: active/terminated/info/default      |
      | Resource     | capitalized resource_type                  |
      | Resource ID  | monospace id or "—" if null                |
    And "create" actions render with the active (green) badge
    And "archive"/"delete" actions render with the terminated (red) badge
    And "update" actions render with the info (blue) badge

  Scenario: Resource-type filter re-queries
    Given I'm on the Audit log tab with no filter
    When I pick "Agents" from the resource filter dropdown
    Then api.listAuditLog is called again with
      { limit: 100, resource_type: "agent" }
    And the table re-renders with the narrowed set

  Scenario: Empty state when no entries match
    Given the audit log returns an empty data array
    When I open the Audit log tab
    Then I see "No audit entries yet. Create or modify a resource
      and they'll show up here."
    And no table is rendered
