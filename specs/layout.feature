Feature: Application Layout
  As a user of the platform
  I want a consistent navigation and layout
  So that I can easily access all features

  Background:
    Given I am logged in

  # ── Sidebar navigation ───────────────────────────────────────────────────

  Scenario: Sidebar displays all navigation sections
    Then I see a collapsible sidebar with sections:
      | section         | items                                      |
      | (top)           | Dashboard link with "Console" branding     |
      | (workspace)     | Workspace selector dropdown (e.g. "Default")|
      | Managed Agents  | Quickstart, Agents, Sessions, Environments, Credential vaults |

  Scenario: Managed Agents section has "New" badge
    Then the "Managed Agents" section header shows a "New" badge

  Scenario: Sidebar collapse/expand
    When I click the "Collapse" button
    Then the sidebar collapses to icon-only mode
    When I click the "Expand" button
    Then the sidebar expands to full mode

  Scenario: Active page is highlighted in sidebar
    When I navigate to /agents
    Then the "Agents" link in the sidebar is highlighted/active

  # ── Workspace selector ───────────────────────────────────────────────────

  Scenario: Workspace selector shows current workspace
    Then the workspace selector shows "Default"

  # ── Top bar ──────────────────────────────────────────────────────────────

  Scenario: Top bar in quickstart flow
    Given I am in the quickstart flow with an agent created
    Then the top bar shows:
      | element       | position |
      | Quickstart    | left     |
      | Stepper       | center   |
      | Save (Cmd+S)  | right    |
      | Test run      | right    |

  # ── Dark theme ───────────────────────────────────────────────────────────

  Scenario: Application uses dark theme
    Then the application has a dark background
    And text is light colored
    And code blocks have syntax highlighting on dark background
    And badges and buttons follow the dark theme palette
