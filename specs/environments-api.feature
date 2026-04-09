Feature: Environments API
  As a developer
  I want to manage environment configurations via the API
  So that I can define container templates for agent sessions

  Background:
    Given the API server is running
    And I have a valid API key

  # ── Create ────────────────────────────────────────────────────────────────

  Scenario: Create environment with minimal config
    When I POST /v1/environments with:
      """json
      {"name": "basic-env"}
      """
    Then the response status is 200
    And the response body has:
      | field       | value       |
      | type        | environment |
      | name        | basic-env   |
    And "id" matches pattern "env_*"
    And config.type is "cloud"
    And config.networking.type defaults to a value
    And config.packages has empty arrays for apt, cargo, gem, go, npm, pip

  Scenario: Create environment with unrestricted networking
    When I POST /v1/environments with:
      """json
      {
        "name": "open-env",
        "config": {
          "type": "cloud",
          "networking": {"type": "unrestricted"}
        }
      }
      """
    Then config.networking.type is "unrestricted"

  Scenario: Create environment with limited networking
    When I POST /v1/environments with:
      """json
      {
        "name": "restricted-env",
        "config": {
          "type": "cloud",
          "networking": {
            "type": "limited",
            "allowed_hosts": ["api.example.com"],
            "allow_mcp_servers": true,
            "allow_package_managers": false
          }
        }
      }
      """
    Then config.networking.type is "limited"
    And config.networking.allowed_hosts contains "api.example.com"
    And config.networking.allow_mcp_servers is true
    And config.networking.allow_package_managers is false

  Scenario: Create environment with packages
    When I POST /v1/environments with:
      """json
      {
        "name": "data-env",
        "config": {
          "type": "cloud",
          "packages": {
            "pip": ["pandas", "numpy==1.26.0"],
            "npm": ["typescript"],
            "apt": ["curl"]
          }
        }
      }
      """
    Then config.packages.pip contains "pandas" and "numpy==1.26.0"
    And config.packages.npm contains "typescript"
    And config.packages.apt contains "curl"

  Scenario: Create environment with description and metadata
    When I POST /v1/environments with:
      """json
      {
        "name": "prod-env",
        "description": "Production environment",
        "metadata": {"tier": "production"}
      }
      """
    Then description is "Production environment"
    And metadata.tier is "production"

  # ── Retrieve ──────────────────────────────────────────────────────────────

  Scenario: Retrieve an environment by ID
    Given an environment "test-env" exists
    When I GET /v1/environments/:environmentId
    Then the response status is 200
    And the response matches the environment

  Scenario: Retrieve non-existent environment
    When I GET /v1/environments/env_nonexistent
    Then the response status is 404

  # ── Update ────────────────────────────────────────────────────────────────

  Scenario: Update environment name
    Given an environment exists
    When I POST /v1/environments/:environmentId with {"name": "new-name"}
    Then the environment name is "new-name"

  Scenario: Update environment networking
    Given an environment with unrestricted networking
    When I POST /v1/environments/:environmentId with:
      """json
      {"config": {"type": "cloud", "networking": {"type": "limited", "allowed_hosts": ["example.com"]}}}
      """
    Then config.networking.type is "limited"

  Scenario: Partial update preserves unset fields
    Given an environment with name "orig" and description "desc"
    When I POST /v1/environments/:environmentId with only {"name": "new"}
    Then the description remains "desc"

  # ── List ──────────────────────────────────────────────────────────────────

  Scenario: List environments with pagination
    Given 5 environments exist
    When I GET /v1/environments
    Then I receive all 5 environments
    And has_more is false

  Scenario: List excludes archived by default
    Given an active and an archived environment
    When I GET /v1/environments
    Then I only see the active environment
    When I GET /v1/environments?include_archived=true
    Then I see both

  # ── Delete ────────────────────────────────────────────────────────────────

  Scenario: Delete an environment
    Given an environment exists
    When I DELETE /v1/environments/:environmentId
    Then the response status is 200
    And the response has type "environment_deleted"
    And the environment no longer exists

  # ── Archive ───────────────────────────────────────────────────────────────

  Scenario: Archive an environment
    Given an environment exists
    When I POST /v1/environments/:environmentId/archive
    Then archived_at is set
    And the environment cannot be used for new sessions
