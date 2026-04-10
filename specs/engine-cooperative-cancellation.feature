Feature: Cooperative cancellation emits a declared status_terminated event
  As an operator who just clicked Stop on a running session
  I want the UI badge to flip to a red "terminated" immediately
  So that I don't stare at a green "running" state for 5s
  waiting for the polling query to catch up

  # Prior state: runAgentLoop's cooperative-cancellation branch
  # (the status check that fires between LLM calls) emitted an
  # event with type "session.stopped". That type is not declared
  # anywhere in packages/types/src/events.ts — the SessionEvent
  # union includes session.status_running / _idle / _terminated /
  # _rescheduled / .error / .deleted, but not .stopped. So the
  # client's EVENT_BADGES map fell through to the default grey
  # badge, and the session-detail list view only updated when
  # the 5s polling query refetched the session row. The whole
  # reason the engine pushes status events over SSE is to avoid
  # that polling lag, and the cancellation path was the one case
  # that didn't use a declared type.
  #
  # Sibling to the error-path fix from fbaee2c — both paths now
  # emit session.status_terminated, both take the DB row to
  # terminated, and the UI renders them identically (red badge).

  Background:
    Given runAgentLoop's iteration loop runs a status check
      before every provider.chat() call
    And the POST /v1/sessions/:id/stop route sets status="terminated"
    And the engine observes that flip on its next iteration

  Scenario: User clicks Stop mid-run, engine observes the flip
    Given a session with a seed user.message and status="running"
    And a provider whose chat() flips the row to "terminated" as
      a side effect and returns a tool_use (so the loop continues
      to iteration 2)
    When runAgentLoop executes
    Then iteration 1 runs provider.chat() exactly once
    And the returned tool_use is processed
    And iteration 2's status check sees "terminated"
    And the cancellation branch emits session.status_terminated
    And the loop returns without calling chat() a second time

  Scenario: session.stopped type is NOT emitted
    Given the SessionEvent union in packages/types/src/events.ts
      does not include "session.stopped"
    When the engine hits the cancellation branch
    Then the emitted event type is "session.status_terminated"
      (a declared member of the union)
    And no "session.stopped" event is stored in the events table
    # This matters for type safety: the client code that narrows
    # on event.type only handles declared types, so an undeclared
    # type falls through to the default case and loses its badge,
    # tooltip, and special-case rendering.

  Scenario: UI badge flips immediately via SSE
    Given the session-detail page subscribes to the SSE stream
    And EVENT_BADGES has an entry for "session.status_terminated"
    When the cancellation event arrives on the stream
    Then the badge flips to red "terminated" without waiting
      for the next polling interval

  Scenario: Symmetry with the error-path fix
    Given fbaee2c made the error branch emit session.status_terminated
    When this cancellation fix lands
    Then both error and cancellation branches produce the same
      final status event type
    And both set the DB row's status to "terminated"
    And both render identically in the UI
