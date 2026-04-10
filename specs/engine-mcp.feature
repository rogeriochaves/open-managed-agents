Feature: Engine uses real MCP tools via stored credentials
  As an agent runner
  I want the engine's tool loop to call real MCP servers
  So that "connected" connectors actually do something during a session run

  # Prior state: resolveTools() returned a single placeholder
  #   mcp_${name}_query
  # tool per mcp_server entry, and executeBuiltinTool returned a
  # mock "(MCP server integration pending)" string when the LLM
  # called it. End-to-end the LLM never saw the real tool catalog
  # and never got real data back, so "connected" meant nothing at
  # run time.
  #
  # This wires resolveTools() through lib/mcp-client:
  #   for each mcp_server:
  #     token = loadConnectorToken(orgId, connectorId)
  #     remoteTools = listMCPTools(url, token)
  #     for each remoteTool:
  #       push __mcp__<connector>__<tool> into the LLM tool list
  #       record a route entry so executeBuiltinTool() can call back
  #
  # And extends executeBuiltinTool() to detect the __mcp__ prefix and
  # route the call through callMCPTool() on the stored route.

  Scenario: Agent with no mcp_servers is unaffected
    Given an agent with tools = [agent_toolset, custom_tool] and mcp_servers = []
    When the engine resolves tools
    Then the returned tool list contains the custom + built-in tools
    And mcpRoutes is empty
    And lib/mcp-client is never touched

  Scenario: Agent with a working MCP server gets real remote tools
    Given an agent with mcp_servers = [{name:"slack", url:"https://mcp.slack.com/sse"}]
    And mcp_connections has an encrypted token for (org_default, slack)
    When the engine resolves tools
    Then loadConnectorToken is called with (org_default, "slack")
    And listMCPTools is called with the url + decrypted token
    And every remote tool is pushed to the LLM tool list as __mcp__slack__<name>
    And mcpRoutes has an entry for each prefixed name pointing at {url, token, originalName}

  Scenario: Broken MCP connector is skipped, not fatal
    Given an agent with mcp_servers = [notion, slack]
    And notion returns its tools successfully
    And slack rejects the credential with 401 (MCPClientError)
    When the engine resolves tools
    Then the notion tools are in the list + routes
    And no __mcp__slack__ tools appear in the list or routes
    And the warning is logged but no exception propagates
    # Degraded-but-working is strictly better than hard-failing the turn

  Scenario: LLM tool calls prefixed __mcp__ route through callMCPTool
    Given the LLM calls tool __mcp__slack__send_message with {text: "hi"}
    And mcpRoutes has an entry for __mcp__slack__send_message
    When executeBuiltinTool runs
    Then it calls callMCPTool(url, token, "send_message", {text:"hi"})
    And it collects text parts from the result.content[]
    And returns {content: joined-text, is_error: result.is_error}

  Scenario: runAgentLoop threads organization_id
    Given POST /v1/sessions/:id/events with a user message from a user in org X
    When the events route triggers runAgentLoop
    Then runAgentLoop is called with organizationId = X
    And that propagates into resolveTools → loadConnectorToken(X, ...)
    # No cross-org credential bleed possible
