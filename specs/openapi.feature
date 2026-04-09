Feature: OpenAPI Specification
  As a developer
  I want auto-generated OpenAPI specs from the Hono server
  So that I can explore and test the API interactively

  Scenario: OpenAPI spec is served at /openapi.json
    When I GET /openapi.json
    Then the response is valid OpenAPI 3.1
    And it includes info with title "Open Managed Agents API"

  Scenario: Swagger UI is served at /docs
    When I navigate to /docs in a browser
    Then I see Swagger UI with all endpoints listed
    And I can try out API calls interactively

  Scenario: All managed agents endpoints are documented
    When I GET /openapi.json
    Then the spec includes all paths:
      | method | path                                               | tag          |
      | POST   | /v1/agents                                         | Agents       |
      | GET    | /v1/agents                                         | Agents       |
      | GET    | /v1/agents/{agentId}                               | Agents       |
      | POST   | /v1/agents/{agentId}                               | Agents       |
      | POST   | /v1/agents/{agentId}/archive                       | Agents       |
      | POST   | /v1/environments                                   | Environments |
      | GET    | /v1/environments                                   | Environments |
      | GET    | /v1/environments/{environmentId}                   | Environments |
      | POST   | /v1/environments/{environmentId}                   | Environments |
      | DELETE | /v1/environments/{environmentId}                   | Environments |
      | POST   | /v1/environments/{environmentId}/archive           | Environments |
      | POST   | /v1/sessions                                       | Sessions     |
      | GET    | /v1/sessions                                       | Sessions     |
      | GET    | /v1/sessions/{sessionId}                           | Sessions     |
      | POST   | /v1/sessions/{sessionId}                           | Sessions     |
      | DELETE | /v1/sessions/{sessionId}                           | Sessions     |
      | POST   | /v1/sessions/{sessionId}/archive                   | Sessions     |
      | GET    | /v1/sessions/{sessionId}/events                    | Events       |
      | POST   | /v1/sessions/{sessionId}/events                    | Events       |
      | GET    | /v1/sessions/{sessionId}/events/stream             | Events       |
      | GET    | /v1/sessions/{sessionId}/resources                 | Resources    |
      | POST   | /v1/sessions/{sessionId}/resources                 | Resources    |
      | GET    | /v1/sessions/{sessionId}/resources/{resourceId}    | Resources    |
      | POST   | /v1/sessions/{sessionId}/resources/{resourceId}    | Resources    |
      | DELETE | /v1/sessions/{sessionId}/resources/{resourceId}    | Resources    |
      | POST   | /v1/vaults                                         | Vaults       |
      | GET    | /v1/vaults                                         | Vaults       |
      | GET    | /v1/vaults/{vaultId}                               | Vaults       |
      | POST   | /v1/vaults/{vaultId}                               | Vaults       |
      | DELETE | /v1/vaults/{vaultId}                                | Vaults       |
      | POST   | /v1/vaults/{vaultId}/archive                       | Vaults       |
      | POST   | /v1/vaults/{vaultId}/credentials                   | Credentials  |
      | GET    | /v1/vaults/{vaultId}/credentials                   | Credentials  |
      | GET    | /v1/vaults/{vaultId}/credentials/{credentialId}    | Credentials  |
      | POST   | /v1/vaults/{vaultId}/credentials/{credentialId}    | Credentials  |
      | DELETE | /v1/vaults/{vaultId}/credentials/{credentialId}    | Credentials  |

  Scenario: Request and response schemas are defined
    Then every endpoint has:
      | aspect           | requirement                         |
      | request body     | JSON schema (for POST/PUT/PATCH)    |
      | response 200     | JSON schema for success             |
      | response 400     | Error schema for validation errors  |
      | response 404     | Error schema for not found          |
      | parameters       | Path and query params documented    |

  Scenario: Schemas reference shared components
    Then the spec uses $ref for shared types like:
      | component       |
      | Agent           |
      | Session         |
      | Environment     |
      | Vault           |
      | PageCursor      |
      | PermissionPolicy|
      | ContentBlock    |
