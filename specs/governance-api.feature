Feature: Governance API direct CRUD
  As an admin UI
  I want raw POST routes for orgs, teams, projects, members,
  MCP policies, users and the audit log
  So that I can mutate governance state without editing a JSON file

  Background:
    Given a fresh server with auth disabled

  Scenario: Create an organization
    When I POST /v1/organizations with a name, slug, sso_provider, sso_config
    Then the response is 200
    And the id starts with "org_"

  Scenario: Create a team under an org
    When I POST /v1/organizations/{orgId}/teams
    Then the team id starts with "team_"
    And organization_id matches

  Scenario: Create a project under a team
    When I POST /v1/teams/{teamId}/projects
    Then the project id starts with "proj_"
    And team_id matches

  Scenario: Create and list users
    When I POST /v1/users with email, name, role, organization_id
    Then the user id starts with "user_"
    When I GET /v1/users
    Then the new user appears

  Scenario: Add a team member (upsert on re-add)
    Given a user exists
    When I POST /v1/teams/{teamId}/members with role="member"
    Then a team_members row is created
    When I POST the same (team_id, user_id) again with role="admin"
    Then the same row id is returned with role="admin"
    And there is still exactly one member row for that user

  Scenario: Set team MCP policy (upsert on repeat)
    When I POST /v1/teams/{teamId}/mcp-policies slack=allowed
    Then a policy row is created
    When I POST /v1/teams/{teamId}/mcp-policies slack=blocked
    Then the existing row is updated (not duplicated)
    And listing shows exactly one slack policy with "blocked"

  Scenario: List audit log on a fresh database
    When I GET /v1/audit-log
    Then the response is 200
    And data is an array (empty or not)

  Scenario: Filter audit log by resource_type
    Given two audit rows exist: one for "team" and one for "project"
    When I GET /v1/audit-log?resource_type=team
    Then only the team row is returned
