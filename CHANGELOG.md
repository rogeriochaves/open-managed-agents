# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version numbers follow [SemVer](https://semver.org/). Until 1.0 the project is iterating on `main` — treat each `## [Unreleased]` section as the current state.

## [Unreleased]

### Added

#### OSS baseline
- `LICENSE` — **AGPL-3.0-or-later**. Started the repo as Apache-2.0 for its patent grant, relicensed to AGPLv3 before any release to match the "self-hosted, source-available to downstream users" positioning: anyone running a modified fork as a network service must publish their modifications back. For users running unmodified self-hosted deployments internally, AGPLv3 behaves identically to any other permissive OSS license.
- `CONTRIBUTING.md` — monorepo layout, dev setup, how to add a route, how to fix a bug, Conventional Commits, CI expectations.
- `SECURITY.md` — responsible disclosure via GitHub Security Advisories, documented baseline protections (AES-256-GCM vaults, bcrypt, session-token hashing, httpOnly/SameSite cookies, no-echo API keys).
- `.github/dependabot.yml` — weekly updates for npm (minor/patch batched, majors individual), GitHub Actions, and Docker base images.

#### CI
- `.github/workflows/ci.yml` with 5 jobs:
  - **test** — typecheck + full test suite + build across all 5 packages.
  - **sqlite-smoke** — boots the production server binary with SQLite on an alt port and drives the compiled `oma` CLI against it via `scripts/cli-smoke-test.sh`.
  - **postgres-smoke** — same shape as sqlite-smoke, but spins up a real `postgres:16-alpine` service container with a health probe, sets `DATABASE_URL=postgres://oma:…@localhost:5432/oma`, and greps the server boot log for `Database: postgres` so a silent fallback to SQLite fails the job loudly. Exercises `translateSql` `?`→`$1..$N` and `INSERT ... ON CONFLICT DO NOTHING` end-to-end.
  - **helm** — lints the chart and renders it in sqlite / embedded-postgres / external-postgres modes, asserting expected Kubernetes kinds.
  - **docker-compose** — validates `docker-compose.yml` parses with `docker compose config -q` and checks all expected services are declared.

#### Tests
Started this cycle at zero server/cli tests. Ended at **268 total**:

| Package | Files | Tests |
|---|:---:|:---:|
| `@open-managed-agents/server` | 20 | 151 |
| `@open-managed-agents/web` | 12 | 109 |
| `@open-managed-agents/cli` | 1 | 5 |
| `@open-managed-agents/scenario-tests` | 1 | 3 |
| **Total** | **34** | **268** |

All three LangWatch Scenario tests now pass end-to-end against the
live server + real Anthropic provider + gpt-5-mini judge
(~93 seconds wall clock): simple factual question, multi-turn
clarification dialogue, and the new agent-builder chat refining a
support-agent draft. Previously the multi-turn test was marked
"pre-existing flake" but the real root cause was test-script
misconfiguration (`maxTurns: 8` cut off the judge step), now fixed.

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
- `server/auth-guard.test.ts` — 16 cases: public paths pass, private paths 401, valid session cookie unlocks, Bearer + x-api-key headers also unlock, bogus tokens on any channel 401.
- `server/agent-builder.test.ts` — 4 cases against a stubbed LLM: 503 when no provider, happy-path reply + parsed draft with `oma-draft` fence stripping, done=true flag, prior-draft preservation when the model forgets the fence.
- `server/mcp-connections.test.ts` — 5 cases covering encrypted token storage, upsert-on-reconnect, unknown-connector 404, delete roundtrip, and a ciphertext assertion proving the token is not stored as plaintext.
- `cli/client.test.ts` — CLI client points at self-hosted base URL; API key precedence.
- `scripts/cli-smoke-test.sh` — end-to-end binary drives the live server through 5 subcommands.
- `scenario-tests/agent-creation.scenario.test.ts` — live Claude + gpt-5-mini judge (opt-in, ~45s).

#### Docker image hardening
- Both `Dockerfile.server` and `Dockerfile.web` are now **multi-stage builds**.
- `Dockerfile.server` drops dev-dependencies via `pnpm deploy --prod`, runs as the non-root `node` user, creates a writable `/app/data` directory owned by `node` for the SQLite file, and ships a `HEALTHCHECK` that curls `/v1/auth/me` every 15s.
- `Dockerfile.web` similarly adds a curl-based `HEALTHCHECK` on `/` in the `nginx:alpine` runtime layer.
- The final `CMD`/`EXPOSE` surface is unchanged so `docker-compose.yml` and the Helm chart keep working. `docker compose config -q` remains clean.

#### Features
- **Real MCP client + tool loop** — the last "fake" gap in the agent runtime. Previously `resolveTools()` returned a single placeholder `mcp_${name}_query` tool per MCP server, and `executeBuiltinTool()` returned a canned "(MCP server integration pending)" string when the LLM called it. Now `resolveTools()` is async and walks `agentConfig.mcp_servers`, calling `loadConnectorToken()` + `listMCPTools()` (via `lib/mcp-client.ts` wrapping `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`) for each connector. Every remote tool is pushed into the LLM tool list with a `__mcp__<connector>__<originalName>` prefix plus an entry in a parallel `mcpRoutes` Map. `executeBuiltinTool()` detects the prefix and routes the call through `callMCPTool()`. Broken connectors (no token, unreachable, 401) are logged and skipped rather than failing the whole turn. `runAgentLoop()` grew an `organizationId` parameter that the events route resolves from `currentUser(c)` so there's no cross-org credential bleed. New routes: `GET /v1/mcp/connectors/:id/tools` returns the server's live tool catalog via the same client. 7 new server tests across `mcp-discovery-tools.test.ts` + `engine-mcp-tools.test.ts` + `mcp-connections.test.ts`.
- **Vercel AI SDK provider layer** — replaced the hand-rolled Anthropic + OpenAI classes with a single `AISDKProvider` wrapper over the `ai` package. This expands supported LLM providers from 2 to **7** out of the box: `anthropic`, `openai`, `google` (Gemini), `mistral`, `groq`, `openai-compatible` (OpenRouter / Together / LM Studio / vLLM), and `ollama` (via the openai-compatible driver pinned to `http://localhost:11434/v1`). The public `LLMProvider` interface is unchanged so the engine and all routes keep compiling. `seedDefaultProviders()` now sweeps a prioritized env-var list (`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `GOOGLE_GENERATIVE_AI_API_KEY` → `MISTRAL_API_KEY` → `GROQ_API_KEY`) and always seeds a zero-config local Ollama row so self-hosters get a working LLM path without any cloud API keys. Dropped the legacy `CHECK(type IN (...))` constraint on `llm_providers.type` via an SQLite table-rebuild migration so existing DBs can insert the new provider types.
- **Agent builder chat endpoint** — new `POST /v1/agent-builder/chat` drives the "Describe your agent" flow on the Quickstart page. Takes a conversation history + draft config, calls the configured default LLM, parses a fenced `oma-draft` JSON block out of the reply, merges it with the prior draft, and returns the natural-language reply (fence stripped) plus the updated draft and a `done` flag. Handles 503 when no provider is configured, preserves the prior draft when the model forgets the fence, surfaces the provider id/name so the UI can show "using Anthropic claude-sonnet-4-6", and is covered by a 4-case stubbed test in `agent-builder.test.ts`.
- **Two-column Quickstart with a real chat pane** — `packages/web/src/pages/quickstart.tsx` was flattened from single-column with a fake one-shot input into Claude's actual two-column shape: persistent chat pane on the left (sticky textarea at the bottom, message bubbles above) and the templates grid / template preview / draft preview / "Agent created" panel on the right. Left pane submits to `/v1/agent-builder/chat` on every turn and carries conversation + draft state between turns. Right pane reveals a YAML/JSON draft preview with connector chips once the assistant drafts an agent; the "Create agent" CTA only activates when `done:true` is signaled. Extended `quickstart.test.tsx` from 11 → 13 tests covering real chat send + reply, draft preview rendering, and the 503 error path.
- **MCP connector credential storage** — new `mcp_connections` table (org + connector unique) plus `POST /v1/mcp/connectors/:id/connect` with token body and `DELETE` to disconnect. Tokens are encrypted at rest with AES-256-GCM via `lib/encryption.encrypt()` and organization-scoped. The list endpoint now augments every connector with `connected: boolean` for the current org so the UI can render a green Connected badge. `MCPConnectorBrowser` grew a "Connect" button per card that opens a glassmorphic modal with a password-type token input; the card flips to a green badge that doubles as a disconnect button on hover. 5 new server tests in `mcp-connections.test.ts` + spec in `specs/mcp-connections.feature`. This replaces the previous purely cosmetic state where clicking a connector did literally nothing.
- **LangWatch-style app shell restyle** — dropped the vibecoded orange-saturated look. The main content area is now a floating rounded card (`rounded-2xl border bg-white shadow-sm` with `my-2 mr-2` margin) sitting inside a gray-100 page background. The sidebar is flat gray, sections are grouped under uppercase small-caps labels (BUILD / MANAGE / ANALYTICS), active states use `bg-gray-100 + text-gray-900` instead of `bg-orange-50 + text-orange-700`, and the primary `Button` variant is dark graphite (`bg-gray-900`) instead of orange. Orange survives only on the logo mark. The `accent-blue` legacy alias in `index.css` now resolves to `gray-900`, which flips every user chat bubble, stepper active dot, focus ring, and dropdown-selected highlight to dark in one move.
- **Auth-guard accepts Bearer + x-api-key headers** — `middleware/auth-guard.ts` now resolves the session token from three sources in precedence: `oma_session` cookie → `Authorization: Bearer <token>` → `x-api-key: <token>` (the Anthropic-SDK default, which is what the CLI already sends via `OMA_API_KEY`). All three map to the same opaque session token returned by `POST /v1/auth/login`, so a CLI user can `curl -X POST /v1/auth/login → export OMA_API_KEY=<cookie> → oma agents list` and land authenticated without any cookie jar juggling. 4 new test cases in `auth-guard.test.ts`.
- **Global auth guard middleware** — new `packages/server/src/middleware/auth-guard.ts` is wired into `createApp()` right after CORS. Every non-public path requires a valid session cookie; public allowlist is `/`, `/health`, `/docs`, `/openapi.json`, `/v1/auth/login`, `/v1/auth/logout`, `/v1/auth/me`, `/v1/auth/sso-providers`. Honors `AUTH_ENABLED=false` as a dev/test opt-out. Bogus cookies are rejected; valid sessions are stashed on the Hono context as `c.get("user")` so downstream handlers skip a second DB lookup.
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
7. **The entire auth system was a no-op — the biggest gap this session closed.** `AUTH_ENABLED` was read by test files but no server code ever consulted it, and no middleware existed to gate routes on a session cookie. Every route was publicly reachable as long as the port was — anyone could list agents, read the audit log, create credentials, or pull vault secrets, despite the README prominently promising auth + RBAC + vaults with secrets. Fixed by adding `middleware/auth-guard.ts` wired into `createApp()` with a minimal public-path allowlist, and covered by a new `auth-guard.test.ts` with 12 cases proving every private route 401s without a cookie and unlocks with a valid session.

### Fixed (quality)
- `GET /v1/audit-log` now parses the `details` JSON blob at the listing boundary (consistent with how agents/sessions return their JSON columns as objects). The OpenAPI schema was also updated from `string` to `z.record(z.unknown()).nullable()` so generated clients see the right shape. Malformed blobs degrade to `null` rather than crashing the list.
- `nginx.conf` now proxies `/health`, `/docs`, and `/openapi.json` to the backend. Previously the SPA fallback caught these, silently returning the React index.html with status 200 — a false-positive uptime check for any monitor hitting the web tier instead of the API server. Also bumped `proxy_read_timeout` to 1h on `/v1/` so long SSE streams during agent runs don't get killed by nginx's default 60s read timeout.
- Dockerfile HEALTHCHECK, CI `sqlite-smoke` wait loop, and `scripts/cli-smoke-test.sh` server-reachability probe all now agree on `/health` — the same path the Helm chart's liveness/readiness probes hit.
- Both Dockerfiles are now multi-stage (server drops dev-deps via `pnpm deploy --prod` for a significantly smaller runtime image), run under a non-root user, and ship a curl-based `HEALTHCHECK`.
- `packages/server/tsconfig.json` and `packages/cli/tsconfig.json` now `exclude` `src/__tests__` and `*.test.ts` — tests used to be shipped in the production `dist/`.
- `scripts/cli-smoke-test.sh` creates an agent before asserting JSON output, so it works against a fresh empty DB (the exact scenario the CI `sqlite-smoke` job exercises).
- `packages/scenario-tests/src/agent-creation.scenario.test.ts` now uses a system prompt that encourages clarifying questions for ambiguous openers. The previous prompt ("give clear, direct, accurate answers") made the multi-turn dialogue scenario fail the judge.
- `packages/server/src/db/postgres.ts` `translateSql()` is now exported so it can be unit-tested without a live Postgres.
- `packages/web/index.html` removed the hardcoded `class="dark"` and `bg-[#0d0d0d]` body background that were overriding the new light-mode theme.
