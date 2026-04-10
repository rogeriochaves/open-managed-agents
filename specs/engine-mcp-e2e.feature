Feature: End-to-end engine ↔ MCP with no stubs on any seam
  As someone reviewing the "can OMA actually run an agent with a
  stored MCP credential against a real MCP server?" claim
  I want a single test that chains every layer of the stack
  So that a drift on any seam breaks something visible

  # Prior state: every MCP-adjacent test covered ONE slice of the
  # stack with its own stubs. Nothing chained them:
  #
  #   mcp-connections.test.ts       — encrypted token storage
  #   mcp-discovery-tools.test.ts   — GET /tools route (stubbed client)
  #   mcp-client-integration.test.ts — lib/mcp-client vs a real fixture
  #   engine-mcp-tools.test.ts      — resolveTools with listMCPTools stubbed
  #
  # A drift on any seam — the `__mcp__<connector>__` prefix contract,
  # the connection-lookup-by-orgId, the Bearer header injection, the
  # SDK response shape — could go unnoticed as long as each slice's
  # own stubs kept agreeing with themselves.

  Background:
    Given an in-process @modelcontextprotocol/sdk McpServer bound to
      a random 127.0.0.1 port
    And that server registers tools `echo` and `add`
    And an mcp_connections row exists with
      organization_id="org_default", connector_id="slack",
      token_encrypted = encrypt("e2e-secret-bearer-token")

  Scenario: resolveTools surfaces the fixture tools as prefixed entries
    When I call resolveTools(agentConfig with mcp_servers=[{name:"slack", url:fixtureUrl}], "org_default")
    Then the tool list contains __mcp__slack__echo and __mcp__slack__add
    And mcpRoutes["__mcp__slack__echo"] has
      {url:fixtureUrl, token:"e2e-secret-bearer-token", originalName:"echo"}
    And the fixture observed "Authorization: Bearer e2e-secret-bearer-token"
      on the listTools round trip
      # Seam proof: if the engine forgets to decrypt, or the client
      # forgets to attach the header, this assertion fails.

  Scenario: callMCPTool through the resolved route actually executes
    Given the previous scenario's resolved route
    When I callMCPTool(route.url, route.token, "echo", {text:"hello from e2e"})
    Then result.is_error is false
    And the joined text content is "echo: hello from e2e"

  Scenario: No stored credential → no Bearer header, still usable
    Given NO mcp_connections row exists for connector_id="scratch"
    When resolveTools runs with mcp_servers=[{name:"scratch", url:fixtureUrl}]
    Then the engine passes null as the token to listMCPTools
    And the fixture observes NO "Bearer ..." header on that request
    And the tools still resolve because the fixture doesn't require auth
      # Production MCP servers will 401 here, which flows through as
      # MCPClientError(status:401) → the engine skips the connector.
      # This test proves the null-token path doesn't crash.

  Scenario: A broken MCP URL is skipped, slack is unaffected
    Given mcp_servers = [slack (fixture), dead (http://127.0.0.1:1/unreachable)]
    When resolveTools runs
    Then slack's tools are in the list + routes
    And no __mcp__dead__* tools appear
    And the overall resolution succeeds (no thrown exception)
      # Degraded-but-working is strictly better than hard-failing the
      # whole turn when one of several MCP servers is down.
