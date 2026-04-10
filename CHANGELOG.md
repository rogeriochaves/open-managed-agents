# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version numbers follow [SemVer](https://semver.org/). Until 1.0 the project is iterating on `main` — treat each `## [Unreleased]` section as the current state.

## [Unreleased]

### Added

#### OSS baseline
- `LICENSE` — Apache-2.0, chosen over MIT for its explicit patent grant (enterprise-friendly).
- `CONTRIBUTING.md` — monorepo layout, dev setup, how to add a route, how to fix a bug, Conventional Commits, CI expectations.
- `SECURITY.md` — responsible disclosure via GitHub Security Advisories, documented baseline protections (AES-256-GCM vaults, bcrypt, session-token hashing, httpOnly/SameSite cookies, no-echo API keys).
- `.github/dependabot.yml` — weekly updates for npm (minor/patch batched, majors individual), GitHub Actions, and Docker base images.

#### CI
- `.github/workflows/ci.yml` with 4 jobs:
  - **test** — typecheck + full test suite + build across all 5 packages.
  - **sqlite-smoke** — boots the production server binary with SQLite on an alt port and drives the compiled `oma` CLI against it via `scripts/cli-smoke-test.sh`.
  - **helm** — lints the chart and renders it in sqlite / embedded-postgres / external-postgres modes, asserting expected Kubernetes kinds.
  - **docker-compose** — validates `docker-compose.yml` parses with `docker compose config -q` and checks all expected services are declared.

#### Tests
Started this cycle at zero server/cli tests. Ended at **205 total**:

| Package | Files | Tests |
|---|:---:|:---:|
| `@open-managed-agents/server` | 14 | 110 |
| `@open-managed-agents/web` | 12 | 88 |
| `@open-managed-agents/cli` | 1 | 5 |
| `@open-managed-agents/scenario-tests` | 1 | 2 |
| **Total** | **28** | **205** |

Each new test file has a sibling `specs/*.feature` documenting the scenarios in Gherkin.

- `server/app.test.ts` — health, agents CRUD, environments seed, providers list, OpenAPI spec.
- `server/auth.test.ts` — login, /me, logout, change-password, wrong-credential flows.
- `server/governance-config.test.ts` — IAC JSON config loads orgs, teams, projects, provider access, MCP policies end-to-end.
- `server/governance-api.test.ts` — direct POST routes for orgs/teams/projects/users, team member upsert, MCP policy upsert, audit log filtering.
- `server/vaults.test.ts` — vault + credential CRUD, AES-256-GCM round-trip, unique-IV-per-encrypt, tampered-ciphertext rejection.
- `server/providers.test.ts` — multi-LLM (Anthropic / OpenAI / OpenAI-compatible / Ollama), default-provider swap, `/models` empty fallback, delete.
- `server/sessions.test.ts` — session CRUD, events persistence, ordering, pagination, 404.
- `server/environments-mcp.test.ts` — environment CRUD + archive, MCP discovery list/filter/get/404.
- `server/usage.test.ts` — `/v1/usage/summary` aggregation by agent/provider + cost math verification.
- `server/postgres-translate.test.ts` — unit test for `?` → `$1..$N` SQL placeholder translator (highest-risk DB layer function).
- `server/agents-update.test.ts` — update path, version auto-increment, partial updates, metadata merge, null-key removal.
- `server/destructive.test.ts` — archive + delete paths for sessions (with events cascade), vaults, environments.
- `server/audit-auto.test.ts` — regression guard: every mutation writes a matching audit row.
- `server/provider-access.test.ts` — team-scoped provider access enforcement (403 for non-member, 200 after team add, admin bypass) plus team-scoped MCP connector enforcement (default-allow, explicit block, requires_approval, re-allow).
- `cli/client.test.ts` — CLI client points at self-hosted base URL; API key precedence.
- `scripts/cli-smoke-test.sh` — end-to-end binary drives the live server through 5 subcommands.
- `scenario-tests/agent-creation.scenario.test.ts` — live Claude + gpt-5-mini judge (opt-in, ~45s).

#### Docker image hardening
- Both `Dockerfile.server` and `Dockerfile.web` are now **multi-stage builds**.
- `Dockerfile.server` drops dev-dependencies via `pnpm deploy --prod`, runs as the non-root `node` user, creates a writable `/app/data` directory owned by `node` for the SQLite file, and ships a `HEALTHCHECK` that curls `/v1/auth/me` every 15s.
- `Dockerfile.web` similarly adds a curl-based `HEALTHCHECK` on `/` in the `nginx:alpine` runtime layer.
- The final `CMD`/`EXPOSE` surface is unchanged so `docker-compose.yml` and the Helm chart keep working. `docker compose config -q` remains clean.

#### Features
- **SSO provider discovery** — `GET /v1/auth/sso-providers` returns each org's configured SSO provider + `login_url` so a login UI can render "Sign in with Okta / Google / …" buttons. The raw `sso_config` blob (which may contain secret fields like `client_secret_env`) is deliberately never exposed.
- **Team-scoped provider access enforcement** — `POST /v1/sessions` now calls `canUseProvider()` and returns 403 if the caller is not on a team with an enabled `team_provider_access` row for the agent's provider. Admins bypass (no lockout).
- **Team-scoped MCP connector enforcement** — same flow via `canUseConnector()`. Default-allow semantics (no policy row = allowed) to keep existing installs backward-compatible; `blocked` or `requires_approval` in any of the caller's team memberships denies with 403 naming the offending connector.
- **Automatic audit logging** on every mutation: agents, sessions, environments, providers, vaults, credentials, organizations, teams, projects, users.
- **Server app factory** — `packages/server/src/app.ts` `createApp()` separates wiring from `serve()` so tests can drive the real Hono app in-process via `app.request()`.
- **Light-mode UI redesign** — rewrote `index.css` with LangWatch-inspired semantic tokens (`bg-page`, `bg-surface`, `bg-panel`, `fg-primary`), Inter font, orange brand accent, backdrop-blur glass helpers. Made light mode the default.
- **New orange logo** (`packages/web/public/logo.svg`) replacing the old blue one to match the brand direction.
- **README screenshot gallery** — 12 captures (login, quickstart, agent builder, environment, settings, usage, session transcript + debug, agents/sessions/environments lists) generated via `scripts/capture-screenshots.mjs` (headless Chrome + CDP over raw WebSocket, no puppeteer dependency).
- **README reliability table** showing all 197 tests grouped by package.

### Fixed (latent bugs surfaced by test-writing)
1. **`initEncryption()` was declared but never called.** Vault credential create would have thrown `"Encryption not initialized"` at runtime. Now called from `createApp()` before any route is wired. Caught by `server/vaults.test.ts`.
2. **`GET /v1/mcp/connectors/{id}` with an unknown id returned 500, not 404.** The route threw a bare `Error` with no status, so the global handler coerced it. Now throws with `status: 404, type: "not_found"`. Caught by `server/environments-mcp.test.ts`.
3. **CLI hit `api.anthropic.com` instead of the self-hosted server.** Copy-pasted Anthropic SDK client had no baseURL override. `OMA_API_BASE` / `OPEN_MANAGED_AGENTS_API_BASE` now resolve to the SDK's `baseURL`, with `OMA_API_KEY` > `ANTHROPIC_API_KEY` > `"oma-local"` precedence. Caught by `cli/client.test.ts` + `scripts/cli-smoke-test.sh`.
4. **`auditLog()` was declared but never called from any route.** The README's "Full audit logging — track all actions" claim was not backed by code — the `audit_log` table stayed empty regardless of activity. Now wired into every mutation across agents, sessions, environments, providers, vaults, credentials, and governance CRUD via a `currentUserId(c)` helper. Caught by `server/audit-auto.test.ts`.
5. **`team_provider_access` was persisted but never enforced.** Rows were created/read/updated via the governance APIs but nothing ever consulted them at request time — any authenticated user could create a session against any provider. `POST /v1/sessions` now calls `canUseProvider()` and returns 403 if the caller has no team membership with an enabled grant. Caught by `server/provider-access.test.ts`.
6. **`team_mcp_policies` was persisted but never enforced.** Same shape as gap #5 on the MCP connector side — the README's "Per-team allow/block" claim was metadata only. Session create now iterates the agent's `mcp_servers` and calls `canUseConnector()` per connector (default-allow for backward compat, `blocked` or `requires_approval` in any team denies). Caught by the MCP-enforcement cases in `server/provider-access.test.ts`.

### Fixed (quality)
- `packages/server/tsconfig.json` and `packages/cli/tsconfig.json` now `exclude` `src/__tests__` and `*.test.ts` — tests used to be shipped in the production `dist/`.
- `scripts/cli-smoke-test.sh` creates an agent before asserting JSON output, so it works against a fresh empty DB (the exact scenario the CI `sqlite-smoke` job exercises).
- `packages/scenario-tests/src/agent-creation.scenario.test.ts` now uses a system prompt that encourages clarifying questions for ambiguous openers. The previous prompt ("give clear, direct, accurate answers") made the multi-turn dialogue scenario fail the judge.
- `packages/server/src/db/postgres.ts` `translateSql()` is now exported so it can be unit-tested without a live Postgres.
- `packages/web/index.html` removed the hardcoded `class="dark"` and `bg-[#0d0d0d]` body background that were overriding the new light-mode theme.
