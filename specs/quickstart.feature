Feature: Quickstart Wizard
  As a user building an agent for the first time
  I want a guided step-by-step wizard
  So that I can create an agent, environment, session, and run it quickly

  Background:
    Given I am logged in and on the quickstart page

  # ── Step 0: Template selection ────────────────────────────────────────────

  Scenario: Display quickstart page layout
    Then I see a stepper at top with steps "Create agent", "Configure environment", "Start session", "Integrate"
    # The layout is split: left side has "What do you want to build?" heading
    # Right side has "Browse templates" with the template grid
    And I see a heading "What do you want to build?" on the left
    And I see a subheading "Describe your agent or start with a template."
    And I see a "Browse templates" heading on the right panel
    And I see a search input with placeholder "Search templates" inside the right panel
    # The "Describe your agent..." input is a floating textarea at the bottom of the page
    And I see a floating textarea at the bottom with placeholder "Describe your agent..."
    And the template cards are arranged in a 2-column grid inside the right panel
    And connector icons are actual service logos (not text badges)

  Scenario: Display template cards
    Then I see the following template cards:
      | name                      | description                                                                                   | connectors         |
      | Blank agent config        | A blank starting point with the core toolset.                                                 |                    |
      | Deep researcher           | Conducts multi-step web research with source synthesis and citations.                         |                    |
      | Structured extractor      | Parses unstructured text into a typed JSON schema.                                            |                    |
      | Field monitor             | Scans software blogs for a topic and writes a weekly what-changed brief.                      | notion             |
      | Support agent             | Answers customer questions from your docs and knowledge base, and escalates when needed.      | notion, slack      |
      | Incident commander        | Triages a Sentry alert, opens a Linear incident ticket, and runs the Slack war room.          | sentry, linear, slack, github |
      | Feedback miner            | Clusters raw feedback from Slack and Notion into themes and drafts Asana tasks for the top asks. | slack, notion, asana |
      | Sprint retro facilitator  | Pulls a closed sprint from Linear, synthesizes themes, and writes the retro doc before the meeting. | linear, slack, docx |
      | Support-to-eng escalator  | Reads an Intercom conversation, reproduces the bug, and files a linked Jira issue with repro steps. | intercom, atlassian, slack |
      | Data analyst              | Load, explore, and visualize data; build reports and answer questions from datasets.           | amplitude          |

  Scenario: Search templates filters the list
    When I type "research" in the template search input
    Then I see only templates whose name or description matches "research"

  Scenario: Select a template to view its config
    When I click the "Blank agent config" template card
    Then I see a "Back to templates" button
    And I see the template name "Blank agent config" with label "Template"
    And I see a "Use this template" button
    And I see a tab bar with "YAML" and "JSON" tabs
    And I see a "Copy code" button
    And the YAML tab is active by default
    And I see the agent config in YAML format with fields: name, description, model, system, mcp_servers, tools, skills

  Scenario: Toggle between YAML and JSON view
    Given I have selected the "Blank agent config" template
    When I click the "JSON" tab
    Then I see the agent config in JSON format
    When I click the "YAML" tab
    Then I see the agent config in YAML format

  # ── Step 1: Create agent ──────────────────────────────────────────────────

  Scenario: Use a template to create an agent
    Given I have selected the "Blank agent config" template
    When I click "Use this template"
    Then step 1 "Create agent" shows a checkmark
    And I see "Agent created" with a checkmark
    And I see "Your agent is created! Here's the call that made it:"
    And I see a code block showing "POST /v1/agents" with a curl/SDK/CLI selector
    And I see the right panel with "Config" and "Preview" tabs
    And the Config tab shows the agent YAML with name, description, model, system, mcp_servers, tools, skills
    And I see "Save" button with Cmd+S shortcut in the top bar
    And I see "Test run" button in the top bar
    And I see a "Next: Configure environment" button

  Scenario: Create agent via text description
    When I type "A code review assistant that checks PRs" in the description input
    And I submit the description form
    Then step 1 "Create agent" shows a checkmark
    And I see "Agent created" with a checkmark
    And the agent config is generated from my description

  Scenario: Code block shows different formats
    Given an agent has been created
    Then the code block has a format selector with options "curl", "Python", "TypeScript", "CLI"
    When I select "TypeScript" from the format selector
    Then the code block shows the TypeScript SDK call for creating the agent

  # ── Step 2: Configure environment ─────────────────────────────────────────

  Scenario: Navigate to step 2
    Given an agent has been created
    When I click "Next: Configure environment"
    Then I see step 2 "Configure environment" is active in the stepper
    And I see explanatory text about environments being container workspaces
    And I see a question "Does your agent need access to the open internet, or only specific hosts?"
    And I see options:
      | number | label        |
      | 1      | Unrestricted |
      | 2      | Limited      |
    And I see a "Something else" option with edit icon
    And I see a "Skip" button

  Scenario: Select unrestricted networking
    Given I am on step 2 "Configure environment"
    When I click "Unrestricted"
    Then I see "Environment created" with a checkmark
    And I see a code block showing "POST /v1/environments" with the curl command
    And the environment name is auto-generated (e.g. "general-purpose-env")
    And the environment has unrestricted networking
    And I see "Your environment is ready with full internet access. On to sessions!"
    And I see a "Next: Start session" button
    And the Preview tab shows an environment selector dropdown with the new environment

  Scenario: Select limited networking
    Given I am on step 2 "Configure environment"
    When I click "Limited"
    Then I am asked to specify allowed hosts
    And I can add host entries
    And I see options for "allow_mcp_servers" and "allow_package_managers"

  Scenario: Skip environment configuration
    Given I am on step 2 "Configure environment"
    When I click "Skip"
    Then I move to step 3 without creating an environment

  # ── Step 3: Start session ─────────────────────────────────────────────────

  Scenario: Navigate to step 3
    Given an agent and environment have been created
    When I click "Next: Start session"
    Then I see step 3 "Start session" is active in the stepper
    And I see text explaining what a session is
    And I see a "Test run" button
    And I see a "Keep refining" button

  Scenario: Start a test session
    Given I am on step 3 "Start session"
    When I click "Test run"
    Then I see "Session created" with a checkmark
    And I see a code block showing "POST /v1/sessions" with the curl command
    And I see "Your session is live"
    And I see "Waiting for first message..."
    And the Preview tab shows "Transcript" and "Debug" view toggle
    And the Preview tab shows "All events" filter dropdown
    And the Preview tab shows a search icon
    And the Preview tab shows "No events yet. Events will appear here as they occur."
    And I see a message input with pre-filled example prompt
    And I see a "Send" button with attachment icon
    And the top bar shows "Stop session" instead of "Test run"
    And I see "View session" link in the Preview panel

  # ── Session interaction (test run) ────────────────────────────────────────

  Scenario: Send a message and watch events stream
    Given a test session is running
    When I send the pre-filled message
    Then the left panel shows "Session event sent" with POST /v1/sessions/:id/events curl
    And the left panel shows "Message received and queued"
    And the left panel shows "Session running..." with a spinner
    And events appear in real-time in the Preview panel

  Scenario: View events in Debug mode
    Given a test session has events
    And I am in Debug view mode
    Then I see individual events with:
      | field     | description                         |
      | type      | Color-coded badge (Running, User, Thinking, Tool, Model, Result, Agent, Idle) |
      | content   | Event description or content        |
      | tokens    | Input/output token counts           |
      | duration  | Duration for tool calls             |
      | timestamp | Elapsed time from session start     |

  Scenario: View events in Transcript mode
    Given a test session has events
    And I am in Transcript view mode
    Then I see a condensed view with:
      | badge  | content                              | stats                |
      | User   | User message text                    | timestamp            |
      | Tool   | Tool name (e.g. "Web Search")        | tokens, duration, timestamp |
      | Agent  | Agent response text                  | tokens, timestamp    |

  Scenario: Filter events by type
    Given a test session has events
    When I click the "All events" dropdown
    Then I can filter by event type

  Scenario: Session completes and goes idle
    Given a test session is running with events
    When the agent finishes processing
    Then the last event shows "Session idle" (or "Idle" badge)
    And I can send another message
    And the "Stop session" button remains visible

  Scenario: Stop a running session
    Given a test session is running
    When I click "Stop session"
    Then the session is terminated
    And no more events stream in

  # ── Step 4: Integrate ─────────────────────────────────────────────────────

  Scenario: View integration code
    Given a session has been created
    When step 4 "Integrate" becomes active
    Then I see integration code examples for:
      | language   |
      | curl       |
      | Python     |
      | TypeScript |
      | CLI        |

  # ── Config editing ────────────────────────────────────────────────────────

  Scenario: Edit agent config in the Config tab
    Given an agent has been created
    When I switch to the Config tab
    Then I see the agent config in YAML format
    And I can edit the config directly
    When I modify the system prompt
    And I press Cmd+S or click Save
    Then the agent config is updated via the API

  Scenario: Reply in the chat to refine agent
    Given an agent has been created
    And I see a "Reply..." input at the bottom
    When I type refinement instructions in the Reply input
    And I submit
    Then the system uses AI to update the agent config based on my instructions
