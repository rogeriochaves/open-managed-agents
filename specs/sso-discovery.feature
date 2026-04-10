Feature: SSO provider discovery
  As the web login page
  I want to know which organizations have an SSO provider configured
  So that I can render "Sign in with Okta / Google / …" buttons

  Background:
    Given an organization may have a non-null sso_provider column
    And its sso_config JSON may include a login_url field
    # sso_config may also include secret fields (client_id, client_secret_env)
    # which must NEVER be exposed via this public endpoint.

  Scenario: Return orgs that have an SSO provider
    Given an org "Acme SSO" with sso_provider="okta"
    And sso_config.login_url = "https://acme.okta.com/oauth2/v1/authorize"
    When I GET /v1/auth/sso-providers
    Then the response is 200
    And the data array contains the org with provider="okta"
    And login_url matches the configured value

  Scenario: Secret fields in sso_config are never leaked
    Given sso_config also contains client_id and client_secret_env
    When I GET /v1/auth/sso-providers
    Then the serialized response does not contain "client_id"
    And the serialized response does not contain "client_secret_env"
    And the serialized response does not contain any secret value

  Scenario: Malformed sso_config is tolerated
    Given sso_config is not valid JSON
    When I GET /v1/auth/sso-providers
    Then the endpoint does not throw
    And login_url is null for that org
    And the raw malformed blob is not included in the response
