Feature: Multi-LLM providers
  As an operator
  I want to register, swap, and remove LLM providers at runtime
  So that my agents can use Anthropic, OpenAI, any OpenAI-compatible
  endpoint, or a local Ollama instance — without a server restart

  Scenario: Empty provider list on fresh install
    Given no providers are seeded
    When I GET /v1/providers
    Then the data array is empty

  Scenario: Add an Anthropic provider as default
    When I POST /v1/providers with type "anthropic", api_key and is_default=true
    Then the response is 200
    And has_api_key is true
    And the api_key is not echoed in the response

  Scenario: Add an OpenAI provider
    When I POST /v1/providers with type "openai"
    Then is_default is false

  Scenario: Add an OpenAI-compatible provider (Together, Groq, Fireworks, …)
    When I POST /v1/providers with type "openai-compatible" and a base_url
    Then the response is 200
    And base_url is stored and returned

  Scenario: Add an Ollama provider with no api_key
    When I POST /v1/providers with type "ollama" and a base_url
    Then the response is 200
    And has_api_key is false

  Scenario: Exactly one provider can be the default
    Given multiple providers have been added
    When I list /v1/providers
    Then exactly one provider has is_default=true

  Scenario: Re-assigning is_default clears the previous default
    Given Anthropic is the current default
    When I create a new OpenAI provider with is_default=true
    Then OpenAI becomes the only default
    And Anthropic is no longer marked as default

  Scenario: /models gracefully returns empty when the provider is unreachable
    Given an Ollama provider whose base_url is not reachable
    When I GET /v1/providers/{id}/models
    Then the response is 200
    And models is an empty array (no crash)

  Scenario: Delete a provider
    When I DELETE /v1/providers/{id}
    Then subsequent listings no longer include it
