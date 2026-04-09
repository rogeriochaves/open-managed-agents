Feature: MCP Discovery Service
  As a user configuring agents
  I want to discover available MCP connectors
  So that I can easily add integrations to my agents

  Scenario: List available MCP connectors
    When I GET /v1/mcp/connectors
    Then I receive a list of known MCP connectors with:
      | field       | description                              |
      | id          | Unique connector identifier (e.g. slack) |
      | name        | Display name (e.g. Slack)                |
      | description | What the connector does                  |
      | url         | Default MCP server URL                   |
      | icon        | Icon identifier for the UI               |
      | category    | Category (communication, project-management, etc.) |

  Scenario: Search connectors by name
    When I GET /v1/mcp/connectors?search=slack
    Then I receive only connectors matching "slack"

  Scenario: Filter connectors by category
    When I GET /v1/mcp/connectors?category=communication
    Then I receive only connectors in the communication category

  Scenario: Connector details include auth requirements
    When I GET /v1/mcp/connectors/slack
    Then I see the connector's auth requirements:
      | field     | value         |
      | auth_type | oauth or token|
      | scopes    | required OAuth scopes (if applicable) |
