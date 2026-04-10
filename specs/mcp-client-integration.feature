Feature: lib/mcp-client speaks the MCP protocol correctly
  As someone reviewing the "can OMA actually talk to MCP servers?" claim
  I want a test that exercises the real MCP SDK on both sides
  So that unit-test stubs can never drift from the real protocol behavior

  # Prior state: every MCP test (mcp-connections, mcp-discovery-tools,
  # engine-mcp-tools) stubbed listMCPTools / callMCPTool at the
  # vi.mock boundary. Good for fault paths, but zero proof that the
  # real SDK round trip works. This feature spawns a tiny in-process
  # McpServer + StreamableHTTPServerTransport wrapped in a node http
  # server on a random loopback port and drives lib/mcp-client
  # against it. No network. No mocks on the client side.

  Background:
    Given an in-process node http server bound to a random 127.0.0.1 port
    And each POST creates a fresh stateless McpServer + StreamableHTTPServerTransport
    And the server registers two tools:
      | name | description                             | input shape        |
      | echo | Echo back the text the caller sent      | { text: string }   |
      | add  | Add two numbers and return the sum      | { a: num, b: num } |

  Scenario: listMCPTools returns the server's tool catalog
    When I call listMCPTools(fixtureUrl, "fake-bearer-token")
    Then the returned list has 2 entries
    And entry "echo" has description "Echo back the text the caller sent"
    And entry "add" has description "Add two numbers and return the sum"
    And both entries have an input_schema with type "object"
    And the fixture server observed an Authorization: Bearer fake-bearer-token header
      # Proves the StreamableHTTPClientTransport's requestInit.headers
      # actually flows through to the wire

  Scenario: callMCPTool executes echo and returns the text
    When I call callMCPTool(fixtureUrl, null, "echo", {text: "hello, world"})
    Then result.is_error is false
    And the joined text content equals "echo: hello, world"

  Scenario: callMCPTool executes add and returns the numeric result
    When I call callMCPTool(fixtureUrl, null, "add", {a: 17, b: 23})
    Then the joined text content equals "17 + 23 = 40"

  Scenario: Unknown tool surfaces as is_error:true without throwing
    # MCP protocol contract: "tool not found" is returned as a
    # content block with isError:true, not as a JSON-RPC error. Our
    # engine relies on this to convert it into a tool_result the LLM
    # can see and recover from, rather than crashing the whole turn.
    When I call callMCPTool(fixtureUrl, null, "does-not-exist", {})
    Then result.is_error is true
    And the error content mentions "does-not-exist"
    And no exception is thrown
