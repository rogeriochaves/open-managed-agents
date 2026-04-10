Feature: Team-scoped provider access enforcement
  As an admin
  I want to control which teams can use which LLM providers
  So that I can govern API spend and data flow per team

  # Fifth latent gap found and fixed: team_provider_access rows
  # were created, read, and updated via the governance APIs but
  # nothing ever consulted them at request time. Any user could
  # create a session against any provider regardless of the rows.
  # Session create now calls lib/access-control.canUseProvider()
  # and returns 403 if the caller has no team membership granting
  # access to the agent's provider.

  Background:
    Given auth is enabled
    And an admin user "admin@localhost" exists
    And a non-admin user "regular@localhost" exists
    And a provider "provider_restricted" exists
    And a team "Engineering" exists in the default org
    And the team has team_provider_access enabled for provider_restricted
    And an agent "restricted-agent" targets model_provider_id=provider_restricted

  Scenario: Non-team-member is denied
    Given the regular user is NOT yet a member of Engineering
    When they POST /v1/sessions with agent=restricted-agent
    Then the response is 403

  Scenario: Team member is allowed
    When the admin adds the regular user to Engineering
    And the regular user POSTs /v1/sessions with agent=restricted-agent
    Then the response is 200

  Scenario: Admins bypass the check
    Given an admin is logged in
    When they POST /v1/sessions with agent=restricted-agent
    Then the response is 200
    # No way for an admin to lock themselves out of their own install
