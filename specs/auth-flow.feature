Feature: Auth flow
  As an administrator
  I want session-based authentication with bcrypt password hashing
  So that only authorized users can access my self-hosted platform

  Background:
    Given the server is running with AUTH_ENABLED (default)
    And the default admin password is set via OMA_DEFAULT_ADMIN_PASSWORD
    And the default admin email is admin@localhost

  Scenario: Reject bad password
    When I POST /v1/auth/login with the admin email and a wrong password
    Then the response is 401

  Scenario: Reject unknown user
    When I POST /v1/auth/login with an email that does not exist
    Then the response is 401

  Scenario: Unauthenticated /me returns null
    When I GET /v1/auth/me without a session cookie
    Then the response is 200
    And the user field is null

  Scenario: Login, /me, logout round trip
    When I POST /v1/auth/login with correct credentials
    Then the response is 200
    And a Set-Cookie: oma_session= header is returned
    And the response body contains the admin user with role "admin"

    When I GET /v1/auth/me with the session cookie
    Then the response is 200
    And the user email is admin@localhost

    When I POST /v1/auth/logout with the session cookie
    Then the response is 200

    When I GET /v1/auth/me with the now-invalidated cookie
    Then the user field is null

  Scenario: Change password rotates the credential
    Given I am logged in as admin with the current password
    When I POST /v1/auth/change-password with current_password and new_password
    Then the response is 200
    When I POST /v1/auth/login with the old password
    Then the response is 401
    When I POST /v1/auth/login with the new password
    Then the response is 200
