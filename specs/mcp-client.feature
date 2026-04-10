Feature: Real MCP client + tool discovery
  As an operator who connected a Slack/Notion/Linear credential
  I want to see the actual tool catalog the MCP server exposes
  So that I know the connection is real, not just a badge in the UI

  # Prior state: clicking "Connect" stored a token in mcp_connections
  # but there was no code path that ever *used* the token against a
  # real MCP server. The connector browser was still part-cosmetic.
  #
  # This feature ships the first real MCP round trip:
  # lib/mcp-client.ts wraps @modelcontextprotocol/sdk's
  # StreamableHTTPClientTransport, injects Bearer <decrypted-token>
  # from mcp_connections, and exposes listMCPTools / callMCPTool.
  # GET /v1/mcp/connectors/:id/tools exercises it end-to-end.

  Background:
    Given the MCP SDK package @modelcontextprotocol/sdk is installed
    And lib/mcp-client.ts wraps its StreamableHTTPClientTransport

  Scenario: Happy path — list tools with a stored token
    Given slack is connected (mcp_connections row exists, token encrypted)
    When I GET /v1/mcp/connectors/slack/tools
    Then the server decrypts the token
    And opens a StreamableHTTPClientTransport to the slack MCP URL
    And sends Authorization: Bearer <decrypted-token>
    And calls client.listTools()
    And returns {data: [{name, description, input_schema}, …]}

  Scenario: Unknown connector returns 404
    When I GET /v1/mcp/connectors/does-not-exist/tools
    Then the response is 404 with error.type="not_found"

  Scenario: MCP server rejects the credential
    Given slack is connected with an expired or bogus token
    When I GET /v1/mcp/connectors/slack/tools
    Then the MCP transport throws a 401-shaped error
    And MCPClientError wraps it with status=401, type="mcp_unauthorized"
    And the route returns 401 with a clean error body

  Scenario: MCP server is unreachable
    Given the MCP URL is not resolving / refused connection
    When I GET /v1/mcp/connectors/notion/tools
    Then MCPClientError wraps it with status=502, type="mcp_error"
    And the route returns 502 instead of leaking a stack trace

  Scenario: Connections table scoped to the caller's org
    # loadConnectorToken(organizationId, connectorId) filters by both,
    # so a user in org A cannot discover tools via a credential
    # stored by org B.
    Given org A has slack connected with tokenA
    And org B does not have slack connected
    When a user in org B GETs /v1/mcp/connectors/slack/tools
    Then loadConnectorToken returns null
    And the client hits slack with no Authorization header
    And slack returns 401 → we return 401 (mcp_unauthorized)
