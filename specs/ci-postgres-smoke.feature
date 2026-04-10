Feature: Postgres boot smoke test runs on every PR
  As the project maintainer
  I want CI to exercise the real postgres adapter on every PR
  So that a dialect regression can't sneak in behind SQLite-only tests

  # Prior state: the sqlite-smoke CI job booted the server with
  # DATABASE_PATH and drove the CLI against it. The postgres code
  # path was exercised only by the translateSql unit tests —
  # nothing actually booted a server against a real postgres.
  # A regression in CURRENT_TIMESTAMP defaults, INSERT ON CONFLICT
  # DO NOTHING, or the ? → $1..$N placeholder translator could
  # pass all the in-process tests and still break production.

  Background:
    Given GitHub Actions is the CI provider
    And the server supports both sqlite and postgres via DbAdapter
    And DATABASE_URL switches to postgres when it starts with
      "postgres://" or "postgresql://"

  Scenario: postgres-smoke job boots a real postgres service container
    Given a ubuntu-latest runner
    And a services.postgres entry using postgres:16-alpine with
      POSTGRES_USER=oma, POSTGRES_PASSWORD=oma-ci, POSTGRES_DB=oma
    And a health probe using pg_isready with 5 retries
    When the job runs
    Then pnpm install + pnpm build complete
    And the server boots with DATABASE_URL=postgres://oma:oma-ci@localhost:5432/oma
    And the server log contains "Database: postgres"
    And /health responds 200
    And the CLI smoke test (agents list/create, JSON list, environments,
      sessions, vaults, openapi paths, swagger UI) all pass

  Scenario: Silent fallback to SQLite fails the job loudly
    Given a future change accidentally makes initAdapter() pick the
      SQLite adapter when DATABASE_URL is a valid postgres URL
    When the postgres-smoke job runs
    Then /health still responds 200 (both adapters are healthy)
    And the CLI smoke test might still pass (both adapters CRUD the same)
    But `grep "Database: postgres" /tmp/oma-server.log` returns exit 1
    And the job fails with a clear message
    # This is the critical assertion — without it a regression in
    # adapter selection would ship invisibly.

  Scenario: translateSql ?→$1..$N is exercised in anger
    Given the server is up in postgres mode
    When the CLI calls `oma agents create --name ... --system ...`
    Then the server's INSERT into agents runs with $1..$N placeholders
      because translateSql rewrote the sqlite-shaped ? placeholders
    And if translateSql were broken, the INSERT would fail with a
      "bind message supplies 0 parameters" style postgres error
