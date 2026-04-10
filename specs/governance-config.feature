Feature: Infra-as-code governance config
  As an enterprise operator
  I want to deploy org / team / policy configuration from a single file
  So that my self-hosted Open Managed Agents instance is reproducible

  Background:
    Given a governance.json file on disk
    And the server is started with GOVERNANCE_CONFIG=governance.json
    (or createApp({ governanceConfigPath }) in tests)

  Scenario: Providers from config are inserted
    Given the config declares Anthropic and OpenAI providers
    When I GET /v1/providers
    Then both providers are present with the names from the config

  Scenario: Organizations from config are inserted
    Given the config declares an organization "Acme Corp" with slug "acme"
    When I GET /v1/organizations
    Then I see org_acme with name "Acme Corp"

  Scenario: Teams from config are inserted under their org
    Given the Acme org has "Engineering" and "Marketing" teams in the config
    When I GET /v1/organizations/org_acme/teams
    Then I see both teams with the slugs "engineering" and "marketing"

  Scenario: Projects from config are inserted under their team
    Given Engineering has a "Backend Services" project in the config
    When I GET /v1/teams/team_acme_engineering/projects
    Then I see a project with slug "backend" and name "Backend Services"

  Scenario: Provider access limits come from the config
    Given Engineering has provider_anthropic with rate_limit_rpm 1000 and budget 500
    When I GET /v1/teams/team_acme_engineering/provider-access
    Then the anthropic entry is enabled with those exact limits

  Scenario: MCP policies per team come from the config
    Given Engineering allows slack, requires approval for postgres, and blocks stripe
    When I GET /v1/teams/team_acme_engineering/mcp-policies
    Then I see slack=allowed, postgres=requires_approval, stripe=blocked

  Scenario: Different teams get different MCP policies
    Given Marketing allows notion and blocks github in the config
    When I GET /v1/teams/team_acme_marketing/mcp-policies
    Then I see notion=allowed and github=blocked
