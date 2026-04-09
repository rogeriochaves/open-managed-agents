Feature: Credential Vaults API
  As a developer
  I want to manage credential vaults via the API
  So that agents can securely access MCP servers and tools

  Background:
    Given the API server is running
    And I have a valid API key
    And VAULT_ENCRYPTION_KEY is set in the environment

  # ── Encryption ────────────────────────────────────────────────────────────

  Scenario: Vault credentials are encrypted at rest
    Given a vault with a static bearer credential
    Then the credential token is stored encrypted using AES-256-GCM
    And the encryption uses the VAULT_ENCRYPTION_KEY from environment
    And the IV is unique per credential and stored alongside the ciphertext
    And the auth tag is stored for integrity verification

  Scenario: Encrypted credentials are decrypted on read
    Given a vault with an encrypted credential
    When I retrieve the credential
    Then the response shows the credential metadata (display_name, mcp_server_name)
    But the actual secret value is NOT returned in API responses

  Scenario: Missing encryption key prevents vault operations
    Given VAULT_ENCRYPTION_KEY is not set
    When I attempt any vault credential operation
    Then the server returns a 500 error indicating encryption is not configured

  # ── Create vault ──────────────────────────────────────────────────────────

  Scenario: Create a vault
    When I POST /v1/vaults with:
      """json
      {"display_name": "Production Secrets"}
      """
    Then the response status is 200
    And the response body has:
      | field        | value              |
      | type         | vault              |
      | display_name | Production Secrets |
    And "id" matches pattern "vlt_*"
    And metadata is an empty object

  Scenario: Create a vault with metadata
    When I POST /v1/vaults with:
      """json
      {
        "display_name": "Dev Vault",
        "metadata": {"env": "development"}
      }
      """
    Then metadata.env is "development"

  Scenario: Validate vault display_name
    When I POST /v1/vaults with display_name "" (empty)
    Then the response status is 400
    When I POST /v1/vaults with display_name longer than 255 characters
    Then the response status is 400

  # ── Retrieve ──────────────────────────────────────────────────────────────

  Scenario: Retrieve a vault
    Given a vault "my-vault" exists
    When I GET /v1/vaults/:vaultId
    Then the response includes the vault with display_name, metadata, timestamps

  # ── Update ────────────────────────────────────────────────────────────────

  Scenario: Update vault display_name
    Given a vault exists
    When I POST /v1/vaults/:vaultId with {"display_name": "New Name"}
    Then the display_name is "New Name"

  Scenario: Update vault metadata with patch semantics
    Given a vault with metadata {"a": "1", "b": "2"}
    When I POST /v1/vaults/:vaultId with {"metadata": {"b": null, "c": "3"}}
    Then metadata is {"a": "1", "c": "3"}

  # ── List ──────────────────────────────────────────────────────────────────

  Scenario: List vaults
    Given 3 vaults exist
    When I GET /v1/vaults
    Then I receive all 3 vaults

  Scenario: List excludes archived by default
    Given active and archived vaults
    When I GET /v1/vaults
    Then I only see active vaults
    When I GET /v1/vaults?include_archived=true
    Then I see all vaults

  # ── Delete ────────────────────────────────────────────────────────────────

  Scenario: Delete a vault
    Given a vault exists
    When I DELETE /v1/vaults/:vaultId
    Then the response has type "vault_deleted"
    And the vault and all its credentials are permanently removed

  # ── Archive ───────────────────────────────────────────────────────────────

  Scenario: Archive a vault
    Given a vault exists
    When I POST /v1/vaults/:vaultId/archive
    Then archived_at is set

  # ── Credentials CRUD ──────────────────────────────────────────────────────

  Scenario: Create a static bearer credential
    Given a vault exists
    When I POST /v1/vaults/:vaultId/credentials with:
      """json
      {
        "type": "static_bearer",
        "display_name": "Slack Token",
        "mcp_server_name": "slack",
        "token": "xoxb-secret-token-value"
      }
      """
    Then the response status is 200
    And the credential is created with type "static_bearer"
    And the token is encrypted before storage
    And the response does NOT include the raw token value

  Scenario: Create an MCP OAuth credential
    Given a vault exists
    When I POST /v1/vaults/:vaultId/credentials with:
      """json
      {
        "type": "mcp_oauth",
        "display_name": "GitHub OAuth",
        "mcp_server_name": "github",
        "client_id": "my-client-id",
        "client_secret": "my-secret",
        "token_endpoint": "https://github.com/login/oauth/access_token",
        "scopes": ["repo", "read:org"]
      }
      """
    Then the credential is created with type "mcp_oauth"
    And client_secret is encrypted before storage

  Scenario: List credentials in a vault
    Given a vault with 2 credentials
    When I GET /v1/vaults/:vaultId/credentials
    Then I receive 2 credentials with metadata but not secret values

  Scenario: Retrieve a credential
    Given a vault with a credential
    When I GET /v1/vaults/:vaultId/credentials/:credentialId
    Then I see the credential metadata
    And secret values are redacted

  Scenario: Update a credential
    Given a vault with a static bearer credential
    When I POST /v1/vaults/:vaultId/credentials/:credentialId with:
      """json
      {"display_name": "Updated Name", "token": "new-token-value"}
      """
    Then the display_name is updated
    And the new token is encrypted and stored

  Scenario: Delete a credential
    Given a vault with a credential
    When I DELETE /v1/vaults/:vaultId/credentials/:credentialId
    Then the credential is permanently removed
    And the encrypted data is deleted

  Scenario: Archive a credential
    Given a vault with a credential
    When I POST /v1/vaults/:vaultId/credentials/:credentialId/archive
    Then the credential archived_at is set
