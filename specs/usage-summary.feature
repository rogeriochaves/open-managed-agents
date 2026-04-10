Feature: Usage and cost analytics
  As an operator
  I want a unified view of tokens and cost across agents and providers
  So that I can track per-team spend without an external billing tool

  Background:
    Given the server has two providers: anthropic and openai
    And two agents: "high-usage-agent" (anthropic) and "cheap-agent" (openai)
    And three sessions with pre-populated token usage:
      | session  | agent             | input_tokens | output_tokens |
      | anth-1   | high-usage-agent  | 100000       | 20000         |
      | anth-2   | high-usage-agent  | 50000        | 10000         |
      | openai-1 | cheap-agent       | 200000       | 5000          |

  Scenario: Totals aggregate across all sessions
    When I GET /v1/usage/summary
    Then total_sessions is 3
    And total_input_tokens is 350000
    And total_output_tokens is 35000

  Scenario: by_agent aggregation
    When I GET /v1/usage/summary
    Then high-usage-agent shows 2 sessions and 150k/30k tokens
    And cheap-agent shows 1 session and 200k/5k tokens

  Scenario: by_provider aggregation
    When I GET /v1/usage/summary
    Then anthropic shows 150k input and 30k output tokens
    And openai shows 200k input and 5k output tokens

  Scenario: Cost estimation uses per-provider rates
    Given anthropic rates are $3/M input and $15/M output
    And openai rates are $2.5/M input and $10/M output
    When I GET /v1/usage/summary
    Then the anthropic entry's estimated_cost_usd is ~$0.90
    And the openai entry's estimated_cost_usd is ~$0.55
    And the overall estimated_cost_usd is ~$1.45

  Scenario: by_agent sorted by total token volume descending
    When I GET /v1/usage/summary
    Then by_agent is sorted by input_tokens + output_tokens descending

  Scenario: Filter by days window
    When I GET /v1/usage/summary?days=30
    Then the response still includes all recent sessions
