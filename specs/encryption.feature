Feature: Vault Encryption
  As the system
  I want to encrypt all credential secrets at rest
  So that sensitive data is protected even if the database is compromised

  Background:
    Given the server is running

  # ── Key management ────────────────────────────────────────────────────────

  Scenario: Encryption key is loaded from environment
    Given VAULT_ENCRYPTION_KEY is set to a 32-byte hex string
    Then the server initializes the encryption module with that key

  Scenario: Encryption key is auto-generated on first run
    Given no .env file exists
    When the server starts for the first time
    Then a new VAULT_ENCRYPTION_KEY is generated (64 hex chars = 32 bytes)
    And it is written to the .env file
    And a warning is logged: "Generated new VAULT_ENCRYPTION_KEY - back this up!"

  Scenario: Invalid encryption key is rejected
    Given VAULT_ENCRYPTION_KEY is set to an invalid value (wrong length)
    When the server starts
    Then it exits with an error "VAULT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"

  # ── Encryption algorithm ──────────────────────────────────────────────────

  Scenario: Secrets are encrypted with AES-256-GCM
    When a credential secret is stored
    Then the system:
      | step | action                                               |
      | 1    | Generates a random 12-byte IV (nonce)                |
      | 2    | Encrypts the plaintext using AES-256-GCM             |
      | 3    | Stores: IV (12 bytes) + ciphertext + auth tag (16 bytes) |
    And the stored value is base64-encoded

  Scenario: Each credential has a unique IV
    Given two credentials with the same secret value
    Then they produce different ciphertext
    Because each encryption uses a unique random IV

  Scenario: Decryption produces the original value
    Given a credential encrypted with a known plaintext
    When the credential is decrypted
    Then the output matches the original plaintext exactly

  Scenario: Tampered ciphertext is rejected
    Given an encrypted credential
    When the ciphertext is modified
    Then decryption fails with an authentication error
    And the credential is not returned

  # ── What gets encrypted ───────────────────────────────────────────────────

  Scenario: Static bearer token is encrypted
    When I create a static_bearer credential with token "xoxb-secret"
    Then "xoxb-secret" is encrypted before storage
    And only the encrypted form exists in the database

  Scenario: OAuth client_secret is encrypted
    When I create an mcp_oauth credential with client_secret "my-secret"
    Then "my-secret" is encrypted before storage

  Scenario: OAuth refresh tokens are encrypted
    When an OAuth token refresh occurs
    Then the new refresh_token is encrypted before storage

  Scenario: Non-secret fields are stored in plaintext
    When I create a credential with display_name "Slack" and mcp_server_name "slack"
    Then display_name and mcp_server_name are stored as plaintext (searchable)

  # ── API response behavior ─────────────────────────────────────────────────

  Scenario: Secret values are never returned in API responses
    When I retrieve a credential via the API
    Then the response includes display_name, type, mcp_server_name, timestamps
    But does NOT include token, client_secret, or any decrypted secret

  Scenario: Credential list does not expose secrets
    When I list credentials in a vault
    Then no credential in the list contains secret values

  # ── Key rotation (future) ─────────────────────────────────────────────────

  Scenario Outline: Key rotation re-encrypts all credentials
    Given credentials encrypted with the old key
    When I rotate to a new VAULT_ENCRYPTION_KEY
    Then all credentials are decrypted with the old key
    And re-encrypted with the new key
    And the old key is no longer needed
