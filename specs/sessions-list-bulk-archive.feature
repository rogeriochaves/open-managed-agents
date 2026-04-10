Feature: Sessions list bulk-archive wires the dead multi-select UI
  As an admin cleaning up old test sessions
  I want to check multiple rows and archive them in one action
  So that I don't have to click into every session to archive it

  # Prior state: sessions-list.tsx had a full multi-select UI —
  # a header "Select all rows" checkbox, per-row checkboxes, and
  # state for `selected: Set<string>` + `selectAll: boolean` —
  # but ZERO consumer of `selected`. Clicking any row checkbox
  # did literally nothing beyond toggling local state. Same
  # class of dead-interaction bug as the environments/vaults
  # buttons we caught in earlier iterations.
  #
  # Fix: add api.archiveSession (the POST /v1/sessions/:id/archive
  # route already existed on the server), render an
  # "Archive N selected" button in the header when selected.size
  # > 0, gate it behind window.confirm, and fire sequentially
  # so a mid-batch failure leaves the user a clear retry path
  # instead of a half-archived mess.

  Background:
    Given the sessions-list page renders with selectable rows
    And api.archiveSession(id) POSTs /v1/sessions/:id/archive
    And the row click handler stopPropagation's on the checkbox

  Scenario: Bulk action button is hidden until at least one row is selected
    Given two session rows are rendered
    Then I do NOT see an "Archive N selected" button
    When I check one row
    Then I see "Archive 1 selected" in the header
    When I uncheck it
    Then the button disappears again

  Scenario: Select-all reflects the full count
    Given two session rows are rendered
    When I click the "Select all rows" checkbox
    Then the button reads "Archive 2 selected"

  Scenario: Confirm fires api.archiveSession per id
    Given I've selected two rows (sesn_001, sesn_002)
    When I click "Archive 2 selected" and confirm the window.confirm dialog
    Then api.archiveSession is called with "sesn_001"
    And api.archiveSession is called with "sesn_002"
    And the calls are sequential (one after another), not Promise.all —
      sequential so a mid-batch failure stops cleanly instead of
      leaving the batch half-archived
    And after success the selection is cleared and the list refetches

  Scenario: Cancel aborts the archive
    Given I've selected two rows
    When I click "Archive 2 selected" and cancel the confirm dialog
    Then api.archiveSession is NOT called
    And the selection state is preserved (user didn't lose their work)

  Scenario: Row checkbox click does not navigate
    Given a row's click handler opens /sessions/:id
    When I click the checkbox inside the row
    Then the inner stopPropagation fires
    And the navigation does NOT happen
    And only the selection state changes
