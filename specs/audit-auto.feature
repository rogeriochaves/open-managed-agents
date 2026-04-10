Feature: Automatic audit logging of key mutations
  As an enterprise operator
  I want every security-relevant mutation recorded in audit_log
  So that I can prove who did what in my self-hosted deployment

  # Bug: auditLog() was declared in governance.ts but NEVER called
  # from any route. The README's "Full audit logging — track all
  # actions" claim was not backed by code — the audit_log table
  # stayed empty no matter what you did. Fixed by wiring auditLog()
  # into the agent and credential mutation paths, using a small
  # currentUserId() helper that resolves the caller from the
  # session cookie (returning null when auth is disabled).

  Background:
    Given the server has auth enabled
    And a logged-in user (or no user when auth is disabled)

  Scenario: Agent create writes an audit row
    When I POST /v1/agents with a name and model
    Then the audit_log contains action="create" resource_type="agent"
    with resource_id matching the new agent id

  Scenario: Agent update writes an audit row
    When I POST /v1/agents/{id} with a version bump
    Then the audit_log contains action="update" resource_type="agent"

  Scenario: Agent archive writes an audit row
    When I POST /v1/agents/{id}/archive
    Then the audit_log contains action="archive" resource_type="agent"

  Scenario: Credential create writes an audit row (security-critical)
    Given a vault exists
    When I POST a new credential into that vault
    Then the audit_log contains action="create" resource_type="credential"
    with the vault_id in the details payload

  Scenario: Credential delete writes an audit row (security-critical)
    When I DELETE /v1/vaults/{vaultId}/credentials/{credId}
    Then the audit_log contains action="delete" resource_type="credential"
