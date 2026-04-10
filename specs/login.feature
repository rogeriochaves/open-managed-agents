Feature: Login page
  As a user of Open Managed Agents
  I want to sign in with my email and password
  So that I can access the agent platform

  Background:
    Given the server is running
    And I am not authenticated
    And the default admin user exists with email "admin@localhost" and password "admin"

  Scenario: Protected routes redirect to login
    When I navigate to any protected route like "/quickstart"
    Then I should be redirected to "/login"
    And I should see the "Open Managed Agents" heading
    And I should see "Sign in to continue" subtitle
    And I should see the email input pre-filled with "admin@localhost"
    And I should see an empty password input

  Scenario: Successful login with default credentials
    When I enter email "admin@localhost"
    And I enter password "admin"
    And I click "Sign in"
    Then I should be redirected to "/quickstart"
    And I should see my user info in the sidebar footer

  Scenario: Failed login with wrong password
    When I enter email "admin@localhost"
    And I enter password "wrong"
    And I click "Sign in"
    Then I should see an error message "Invalid credentials"
    And I should stay on "/login"

  Scenario: Password autofill from password manager
    # Bug: when a password manager (e.g. 1Password) autofills the password
    # without triggering a React synthetic change event, the form's controlled
    # state is not updated and the submit button stays disabled even though
    # the field has a value.
    Given a password manager has autofilled the password field
    When I click "Sign in"
    Then the form should be submitted with the autofilled value
    And the button should not remain stuck in a disabled state
    # Fix: read field values from FormData on submit, not from controlled state
    # Guard: enable the button as long as the browser reports the inputs as non-empty

  Scenario: Pressing Enter in the password field submits the form
    When I enter email "admin@localhost"
    And I enter password "admin" and press Enter
    Then I should be redirected to "/quickstart"

  Scenario: Session cookie persists across reloads
    Given I have successfully signed in
    When I reload the page
    Then I should still be authenticated
    And I should not see the login page

  Scenario: Logout clears the session
    Given I have successfully signed in
    When I click the logout button in the sidebar footer
    Then I should be redirected to "/login"
    And my session cookie should be cleared
