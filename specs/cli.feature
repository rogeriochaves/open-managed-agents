Feature: CLI Tool
  As a developer
  I want a command-line interface for managing agents
  So that I can automate agent operations from the terminal

  Background:
    Given the CLI tool "oma" is installed
    And ANTHROPIC_API_KEY is set in the environment

  # ── Agents ────────────────────────────────────────────────────────────────

  Scenario: Create an agent via CLI
    When I run:
      """
      oma agents create \
        --name "My Agent" \
        --model claude-sonnet-4-6 \
        --system "You are helpful."
      """
    Then the agent is created
    And the output shows the agent ID and config

  Scenario: Create agent with JSON input
    When I run:
      """
      oma agents create --json '{
        "name": "My Agent",
        "model": "claude-sonnet-4-6",
        "tools": [{"type": "agent_toolset_20260401"}]
      }'
      """
    Then the agent is created with the specified tools

  Scenario: List agents
    When I run "oma agents list"
    Then I see a table of agents with ID, name, model, version, status

  Scenario: List agents with filters
    When I run "oma agents list --limit 5 --include-archived"
    Then I see at most 5 agents including archived ones

  Scenario: Get an agent
    When I run "oma agents get agent_abc123"
    Then I see the full agent configuration

  Scenario: Get a specific agent version
    When I run "oma agents get agent_abc123 --version 2"
    Then I see the agent at version 2

  Scenario: Update an agent
    When I run:
      """
      oma agents update agent_abc123 \
        --version 1 \
        --name "Updated Agent" \
        --system "New prompt"
      """
    Then the agent is updated to version 2

  Scenario: Archive an agent
    When I run "oma agents archive agent_abc123"
    Then the agent is archived

  # ── Environments ──────────────────────────────────────────────────────────

  Scenario: Create an environment
    When I run:
      """
      oma environments create \
        --name "dev-env" \
        --networking unrestricted
      """
    Then the environment is created

  Scenario: Create environment with limited networking
    When I run:
      """
      oma environments create \
        --name "prod-env" \
        --networking limited \
        --allowed-hosts "api.example.com,cdn.example.com" \
        --allow-mcp-servers \
        --packages-pip "pandas,numpy"
      """
    Then the environment is created with limited networking and packages

  Scenario: List environments
    When I run "oma environments list"
    Then I see a table of environments

  Scenario: Get an environment
    When I run "oma environments get env_abc"
    Then I see the environment configuration

  Scenario: Update an environment
    When I run "oma environments update env_abc --name new-name"
    Then the environment name is updated

  Scenario: Delete an environment
    When I run "oma environments delete env_abc"
    Then the environment is deleted

  Scenario: Archive an environment
    When I run "oma environments archive env_abc"
    Then the environment is archived

  # ── Sessions ──────────────────────────────────────────────────────────────

  Scenario: Create a session
    When I run:
      """
      oma sessions create \
        --agent agent_abc \
        --environment env_xyz \
        --title "Test Session"
      """
    Then the session is created
    And the output shows the session ID

  Scenario: List sessions
    When I run "oma sessions list"
    Then I see a table of sessions with ID, title, status, agent, created

  Scenario: List sessions filtered by agent
    When I run "oma sessions list --agent-id agent_abc"
    Then I only see sessions for that agent

  Scenario: Get a session
    When I run "oma sessions get sesn_abc"
    Then I see the session details including status, usage, stats

  Scenario: Delete a session
    When I run "oma sessions delete sesn_abc"
    Then the session is deleted

  Scenario: Archive a session
    When I run "oma sessions archive sesn_abc"
    Then the session is archived

  # ── Events ────────────────────────────────────────────────────────────────

  Scenario: Send a message to a session
    When I run:
      """
      oma sessions send sesn_abc "Hello, agent!"
      """
    Then the message is sent as a user.message event

  Scenario: Send a message via stdin
    When I pipe "Hello from stdin" to "oma sessions send sesn_abc -"
    Then the message is sent

  Scenario: Stream session events
    When I run "oma sessions stream sesn_abc"
    Then I see events printed in real-time as they arrive
    And each event shows type, content summary, and timestamp

  Scenario: List session events
    When I run "oma sessions events sesn_abc"
    Then I see all events for the session

  Scenario: Interactive session mode
    When I run "oma sessions run --agent agent_abc --environment env_xyz"
    Then a session is created
    And I enter an interactive REPL
    And I can type messages and see agent responses
    And tool uses are displayed inline
    And I can press Ctrl+C to interrupt

  # ── Vaults ────────────────────────────────────────────────────────────────

  Scenario: Create a vault
    When I run "oma vaults create --name 'My Vault'"
    Then the vault is created

  Scenario: List vaults
    When I run "oma vaults list"
    Then I see a table of vaults

  Scenario: Add a credential to a vault
    When I run:
      """
      oma vaults credentials create vlt_abc \
        --type static_bearer \
        --name "Slack Token" \
        --mcp-server slack \
        --token "xoxb-secret"
      """
    Then the credential is created in the vault

  Scenario: List vault credentials
    When I run "oma vaults credentials list vlt_abc"
    Then I see credentials with names and types but no secret values

  # ── Output formats ────────────────────────────────────────────────────────

  Scenario: JSON output format
    When I run "oma agents list --output json"
    Then the output is valid JSON

  Scenario: Table output format (default)
    When I run "oma agents list"
    Then the output is a formatted table

  # ── Error handling ────────────────────────────────────────────────────────

  Scenario: Missing API key
    Given ANTHROPIC_API_KEY is not set
    When I run any oma command
    Then I see an error "ANTHROPIC_API_KEY environment variable is required"

  Scenario: API error response
    When the API returns a 404
    Then the CLI shows the error message from the API
    And exits with a non-zero code
