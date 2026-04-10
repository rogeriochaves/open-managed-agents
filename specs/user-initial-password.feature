Feature: Admin-created users can log in immediately
  As an admin adding a new teammate via the UI
  I want to set their initial password in the same form
  So that they can log in right away instead of being stuck
  with a null password_hash and a 401 from the login endpoint

  # Prior state (before this feature): POST /v1/users inserted a
  # row into the users table without touching password_hash, so
  # admin-created users always had password_hash = NULL. They
  # existed in the database, appeared in the Users section of
  # Settings → Organization, and could be added to teams — but
  # they could never actually authenticate. The Add user modal
  # admitted this in a footer pointing at POST /v1/auth/change-password,
  # which is itself behind auth. A genuine chicken-and-egg.

  Background:
    Given the auth guard middleware is enabled
    And bcrypt is the password hash algorithm (lib/auth-session.hashPassword)

  Scenario: Admin supplies an initial password on user create
    When POST /v1/users with body
      { email, name, role, organization_id, password: "at-least-8-chars" }
    Then the server bcrypts the password (prefix $2a$ / $2b$ / $2y$)
    And stores it in users.password_hash in the same INSERT
    And the audit log row records has_initial_password: true
      (without leaking the plaintext)
    When the new user POSTs /v1/auth/login with the same password
    Then the response is 200 with their user row
    When the new user POSTs /v1/auth/login with the wrong password
    Then the response is 401

  Scenario: Admin omits the password (current default)
    When POST /v1/users without a password field
    Then users.password_hash is NULL
    And any login attempt for that user 401s
    # This is intentional: an admin might want to create a user
    # as a placeholder, invite them via email, and have them set
    # their own password out of band. We keep the opt-out path.

  Scenario: Short passwords are rejected at the zod boundary
    When POST /v1/users with password: "short"
    Then the response is 4xx
    And no user row is created

  Scenario: UI surfaces the initial-password field
    Given I'm on Settings → Organization as an admin
    When I click "Add user"
    Then the modal has an Email input, a Name input, a Role select,
      and an Initial password input (type=password, placeholder
      "At least 8 characters")
    And the explainer copy reads "Set an initial password here so
      the new user can log in right away."
    When I submit with a password < 8 chars
    Then client-side validation blocks the request and shows
      "Password must be at least 8 characters"
    And no POST /v1/users is fired
