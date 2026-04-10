Feature: Credential vaults with AES-256-GCM encryption at rest
  As an enterprise operator
  I want to store API keys and other secrets in vaults
  So that they are never checked into git or visible in plain text on disk

  Background:
    Given VAULT_ENCRYPTION_KEY is set to 64 hex chars (32 bytes)
    And the encryption module is initialized on app boot
    # Fix: initEncryption() was previously never called from createApp(),
    # so the first encrypt() call threw "Encryption not initialized".

  Scenario: Create a vault
    When I POST /v1/vaults with display_name "Test Secrets"
    Then I get back a vault with id starting with "vault_"

  Scenario: Store a credential encrypted at rest
    Given I have a vault
    When I POST /v1/vaults/{vaultId}/credentials with a plaintext secret
    Then the response is 200
    And the row in the credentials table has a value_encrypted column
    And value_encrypted does NOT contain the plaintext anywhere

  Scenario: List credentials for a vault
    When I GET /v1/vaults/{vaultId}/credentials
    Then I get back the credential metadata (name, id, created_at)

  Scenario: Delete a credential
    When I DELETE /v1/vaults/{vaultId}/credentials/{credId}
    Then the response is 200
    And subsequent listings no longer include it

  Scenario: Encryption round-trips arbitrary UTF-8
    Given the encryption module is initialized
    When I encrypt a payload containing ASCII, unicode, emoji, or 10KB of data
    Then decrypt returns exactly the original plaintext

  Scenario: Each encrypt call uses a fresh random IV
    When I encrypt the same plaintext twice
    Then the two ciphertexts differ
    # Protects against leaking equality-of-plaintext to an observer

  Scenario: Tampered ciphertext fails authentication
    Given I encrypt a plaintext
    When I flip a single byte in the ciphertext region
    And I call decrypt on the tampered payload
    Then decrypt throws (GCM auth tag mismatch)
