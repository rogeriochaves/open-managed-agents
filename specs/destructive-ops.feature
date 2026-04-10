Feature: Destructive operations across resource types
  As an operator
  I want consistent archive (soft) and delete (hard) semantics
  for every resource that supports them
  So that I can prune state without surprise

  Scenario: Archive a session
    Given a session exists
    When I POST /v1/sessions/{id}/archive
    Then archived_at is set
    And the session is hidden from /v1/sessions
    And include_archived=true still reveals it

  Scenario: Delete a session (hard delete cascades events)
    Given a session with at least one user.message event
    When I DELETE /v1/sessions/{id}
    Then the response is 200 with type="session_deleted"
    And the session is gone even from include_archived=true

  Scenario: Archive a vault
    Given a vault exists
    When I POST /v1/vaults/{id}/archive
    Then the vault is hidden from /v1/vaults

  Scenario: Delete a vault (hard delete)
    Given a vault exists
    When I DELETE /v1/vaults/{id}
    Then the vault is gone from include_archived=true listings

  Scenario: Delete an environment (hard delete)
    Given a custom environment exists
    When I DELETE /v1/environments/{id}
    Then the environment is gone from include_archived=true listings
