Feature: Agent builder chat endpoint
  As a non-technical user on the Quickstart page
  I want to iteratively chat with an assistant that drafts my agent config
  So that I can describe what I want in natural language instead of editing JSON

  # The "Describe your agent" chat on the Quickstart page was previously
  # a one-shot input that created an agent directly from whatever text
  # the user typed. It never actually "chatted" — there was no LLM
  # round-trip, no refinement, no clarifying questions. Users saw an
  # input that implied conversation but delivered single-click form
  # submission.
  #
  # POST /v1/agent-builder/chat fixes that. It is a real LLM round-trip
  # against the configured default provider. The model is instructed
  # to emit a fenced `oma-draft` JSON block at the end of every reply
  # containing the current best-guess agent spec. The server parses
  # that block, merges it with the caller's prior draft, and returns
  # both the natural-language reply (with the fence stripped) and the
  # updated draft. A `done` flag signals when the user can click
  # "Create agent".

  Background:
    Given an LLM provider (anthropic, openai, google, mistral, groq, ollama, …) is configured

  Scenario: The endpoint returns 503 when no provider is configured
    Given the llm_providers table is empty
    When I POST /v1/agent-builder/chat with messages=[{role:user, content:"hi"}]
    Then the response is 503 with error.type="provider_not_configured"
    And the error.message tells me how to configure one

  Scenario: A happy-path turn returns a reply + parsed draft
    Given the stub provider returns a reply that contains an oma-draft fenced JSON block
    When I POST the first user message
    Then reply contains only the natural-language text (fence stripped)
    And draft.name, draft.description, and draft.mcp_servers reflect the fenced JSON
    And provider.id and provider.name identify which provider answered

  Scenario: The done flag is surfaced when the model emits done:true
    Given the model returns a fenced block with done=true
    When I POST my turn
    Then response.done == true
    And the UI can show the "Create agent" CTA

  Scenario: The prior draft is preserved when the model forgets the fenced block
    Given I pass in a prior draft {name: "prior-draft"}
    And the model reply contains no oma-draft fence
    When I POST my turn
    Then response.reply equals the model's text verbatim
    And response.draft.name == "prior-draft"  # unchanged

  Scenario: The system prompt guides the model to ask ONE question at a time
    # This is a prompt-engineering invariant rather than a pure unit
    # test — the system prompt explicitly tells the model to be
    # conversational and ask one focused question at a time, with
    # sensible defaults, rather than dumping a wall of questions.
    Given a user types "build me a support agent"
    When the assistant replies
    Then the reply is short (2-4 sentences) and asks one clarifying question
    And the oma-draft guess already has sensible defaults (e.g. slack + notion connectors)
