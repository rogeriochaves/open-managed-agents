Feature: LangWatch Scenario end-to-end tests
  As a maintainer of Open Managed Agents
  I want scenario tests that drive the live API with a real LLM
  So that I catch regressions in the full agent creation → chat flow

  Background:
    Given the server is running on localhost:3001
    And ANTHROPIC_API_KEY is configured
    And OPENAI_API_KEY is configured for the judge

  Scenario: Simple factual question
    When the scenario asks "What is the capital of France? One word answer."
    Then the agent responds correctly
    And the judge confirms the answer is factually correct, concise and direct

  Scenario: Multi-turn clarification dialogue
    # Previously failing: the default system prompt "give clear, direct,
    # accurate answers" discouraged clarifying questions, so when the user
    # opened with "I need help with a programming question" the agent gave
    # a generic unhelpful response and the judge marked it as not helpful.
    #
    # Fix: the scenario adapter now creates agents with a system prompt
    # that explicitly instructs the agent to ask one or two concise
    # clarifying questions for under-specified requests before answering.
    When the scenario simulator sends an ambiguous opener
    And the conversation proceeds for 3 turns
    Then the agent asks a clarifying question then gives a useful answer
    And the judge confirms the agent stays on topic and is helpful
