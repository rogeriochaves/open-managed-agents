Feature: Postgres SQL placeholder translation
  As the Postgres DB adapter
  I must rewrite `?` placeholders to `$1..$N` before calling pg.query
  Without corrupting `?` characters that appear inside string literals

  # Our routes are written with `?` because they target SQLite first.
  # The Postgres adapter translates them on the fly. That translator
  # is the highest-risk pure function in the DB layer — a single bug
  # silently corrupts every query on the Postgres path.

  Scenario: Plain SQL with no placeholders passes through unchanged
    Given "SELECT 1"
    Then the translated SQL is "SELECT 1"

  Scenario: Single ? becomes $1
    Given "SELECT * FROM users WHERE id = ?"
    Then it becomes "SELECT * FROM users WHERE id = $1"

  Scenario: Multiple placeholders are numbered sequentially
    Given an UPDATE with 4 placeholders
    Then they become $1, $2, $3, $4 in order

  Scenario: ? inside a single-quoted literal is preserved
    Given "INSERT INTO logs (message) VALUES ('what??') RETURNING id"
    Then the translator leaves "'what??'" untouched

  Scenario: ? inside a double-quoted identifier is preserved
    Given SELECT with a double-quoted column name containing ?
    Then the double-quoted segment is unchanged

  Scenario: Mix of placeholders and ?-containing literals
    Given placeholders on both sides of a LIKE '%?%' literal
    Then only the placeholders outside the literal are numbered

  Scenario: Multiple string literals in one statement
    Given three string literals containing ? and two placeholders
    Then the literals are preserved and only the real placeholders
    get $1 and $2

  Scenario: Realistic INSERT shape from the agents route
    Given an 11-column INSERT with 11 placeholders
    Then the result uses $1..$11

  Scenario: Two-digit placeholder numbers
    Given 13 placeholders in a single statement
    Then they become $1..$13 (including $10, $11, $12, $13)

  Scenario: Empty input
    Given ""
    Then the translator returns ""
