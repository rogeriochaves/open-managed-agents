<p align="center">
  <img src="packages/web/public/logo.svg" width="80" height="80" alt="Open Managed Agents">
</p>

<h1 align="center">Open Managed Agents</h1>

<p align="center">
  <strong>Self-hosted agent management platform with multi-LLM support and enterprise governance.</strong>
</p>

<p align="center">
  An open-source alternative to <a href="https://platform.claude.com/docs/en/managed-agents/quickstart">Anthropic Claude Managed Agents</a>.<br/>
  Use any LLM provider. Control access per team. Deploy on your infrastructure.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#multi-llm-providers">Multi-LLM</a> &bull;
  <a href="#enterprise-governance">Governance</a> &bull;
  <a href="#self-hosting">Self-Hosting</a> &bull;
  <a href="#helm-chart">Helm Chart</a>
</p>

<p align="center">
  <a href="https://github.com/rogeriochaves/open-managed-agents/actions/workflows/ci.yml"><img src="https://github.com/rogeriochaves/open-managed-agents/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License: Apache 2.0" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/quickstart-qa-03-done.png" alt="Building an agent in Open Managed Agents" width="100%" />
</p>

---

## Why Open Managed Agents?

Anthropic's Claude Managed Agents is a great product, but it's locked to Anthropic's cloud, Anthropic's models, and Anthropic's access controls. If you work somewhere with a **"no data leaves our infrastructure"** policy, a **multi-provider strategy**, a **compliance team**, or an **air-gapped environment**, you can't use it at all.

Open Managed Agents ships the same experience — same builder, same templates, same 1:1 API — but runs on your own infrastructure and against any LLM you want.

**Who this is for:**
- Platform teams who want a self-hosted agent runtime their whole org can share
- Companies that can't ship customer data to a third-party agent platform
- Teams experimenting with local/open models (Llama, Qwen, Mistral via Ollama)
- Anyone who wants to avoid vendor lock-in on the agent layer

| | Claude Managed Agents | Open Managed Agents |
|---|:---:|:---:|
| **Self-hosted** (Docker, Helm, your cloud) | No | Yes |
| **Multi-LLM** — 7 providers | Anthropic only | Anthropic, OpenAI, Google, Mistral, Groq, any OpenAI-compatible, Ollama |
| **Local / air-gapped** | No | Yes (Ollama, vLLM, LM Studio, …) |
| **Org / Team / Project hierarchy** | Limited | Full RBAC with admin/member/viewer |
| **Per-team LLM provider access control** | No | Yes |
| **Per-team MCP allow / block / require-approval** | No | Yes |
| **Infrastructure-as-code config** | No | JSON governance file loaded on boot |
| **Helm chart** | N/A | Included (sqlite + embedded + external postgres modes) |
| **Full audit log** | Limited | Every mutation logged with user + resource + details |
| **Encrypted credential vaults** | N/A | AES-256-GCM at rest |
| **OSS license** | Proprietary | Apache-2.0 |

## Features

### Agent Management
- **Quickstart Wizard** — 4-step guided flow: select template → create agent → configure environment → start session
- **10 Pre-built Templates** — Blank, Deep Researcher, Structured Extractor, Field Monitor, Support Agent, Incident Commander, Feedback Miner, Sprint Retro Facilitator, Support-to-Eng Escalator, Data Analyst
- **Agent Builder** — model selection, system prompts, tool configs (bash, edit, read, write, glob, grep, web_fetch, web_search), MCP servers, skills

### Multi-LLM Provider Support
Powered by the Vercel AI SDK — 7 providers out of the box, same `LLMProvider` interface everywhere:
- **Anthropic** — Claude Opus / Sonnet / Haiku
- **OpenAI** — GPT-5, GPT-4.1, GPT-4o, o3
- **Google Gemini** — Gemini 2.5 Pro / Flash
- **Mistral** — Mistral Large / Medium / Small, Codestral
- **Groq** — Llama 3.3 70B, Mixtral, Gemma 2
- **OpenAI-compatible** — OpenRouter, Together, vLLM, LM Studio, Azure OpenAI, Fireworks, any OpenAI-format API
- **Ollama** — Local models (Llama 3, Mistral, Qwen, Phi, Gemma — zero-config, pre-seeded at `http://localhost:11434/v1`)
- Per-agent provider selection — each agent can use a different LLM provider
- Provider management API — add, remove, list models

### Session & Event Streaming
- **Real-time SSE streaming** — live event stream as agents think, call tools, and respond
- **Transcript view** — clean conversation view with user/agent messages
- **Debug view** — all events: model request start/end, token usage, tool calls, timing
- **Interactive sessions** — send messages to running agents

### Enterprise Governance
- **Organization → Team → Project** hierarchy
- **RBAC** — admin, member, viewer roles at org and team level
- **Provider access control** — admins control which teams can use which LLM providers
- **Rate limits & budgets** — per-team RPM limits and monthly USD budgets
- **MCP integration policies** — allow, block, or require approval per connector per team
- **Audit logging** — track all actions with user, resource, and timestamp
- **Infra-as-code** — deploy governance config from a JSON file (see `governance.example.json`)

### Infrastructure
- **Environment Manager** — networking policies (unrestricted/limited), package managers
- **Credential Vaults** — AES-256-GCM encrypted secret storage
- **MCP Connector Discovery** — 12 built-in connectors (Slack, Notion, GitHub, Linear, Sentry, Asana, Amplitude, Intercom, Atlassian, Google Drive, PostgreSQL, Stripe)
- **OpenAPI Specs** — auto-generated from Zod schemas, Swagger UI at `/docs`
- **CLI** — full command-line interface (`oma`) with 1:1 API mapping

### Reliability
Every claim in this README is backed by an automated test. Running `pnpm test` executes:

| Package | Tests | What it covers |
|---|:---:|---|
| `@open-managed-agents/server` | 151 | **Global auth guard** (public-path allowlist, 401 on unauth, session cookie / Bearer / x-api-key unlock, bogus-token rejection), **agent builder chat** (real LLM round trip, fenced-draft parsing, 503 when no provider, done flag, prior-draft preservation), **MCP connector credential storage** (encrypted-at-rest tokens, upsert, connected flag, delete roundtrip), **real MCP client + engine tool loop** (listTools via StreamableHTTPClientTransport with Bearer auth, __mcp__ prefix routing back through callMCPTool, degraded-mode skip on broken connectors, 401/502 error shapes, cross-org isolation), **in-process MCP fixture round-trip**, **admin-created users with initial bcrypt password + login verification**, **cooperative session stop** (status=terminated + engine bails between iterations + transcript event), auth flow (login/logout/change-password + SSO discovery), agents (create/update/archive + metadata merge + versioning), sessions + events + archive + cascade delete + stop, providers CRUD (Anthropic/OpenAI/Google/Mistral/Groq/OpenAI-compatible/Ollama via Vercel AI SDK), environments + MCP discovery + delete, vaults + AES-256-GCM encryption round-trip + archive + delete, usage & cost aggregation, governance IAC config loading, governance direct CRUD (orgs/teams/projects/members/policies/users/audit), Postgres SQL placeholder translator, automatic audit log writes on every mutation, team-scoped provider access enforcement, team-scoped MCP policy enforcement, audit log `details` JSON parsing |
| `@open-managed-agents/web` | 109 | Sidebar with LangWatch-style sections, **two-column Quickstart** with real agent-builder chat (send/reply, draft preview, 503 error path), **agent detail with edit + archive**, **environments + vaults create modals + archive**, **vault credential CRUD**, **Settings → Organization Add team + Add user modals with initial password**, **Settings → Governance interactive toggles + policy cycling + RPM/budget inputs**, agents/sessions/environments/vaults/settings/usage pages, session detail with SSE streaming + send-composer + Stop button, API key dialog, MCP connector browser with connect modal |
| `@open-managed-agents/cli` | 5 | Client points at self-hosted server, not `api.anthropic.com`; API key precedence |
| `@open-managed-agents/scenario-tests` | 3 | End-to-end tests against the live server + real Anthropic provider + gpt-5-mini judge via LangWatch Scenario (opt-in with `OMA_SCENARIO_ENABLED=1`): simple factual question, multi-turn clarification dialogue, and the new agent-builder chat iteratively refining a support-agent draft |
| **Total** | **268** | |

GitHub Actions runs typecheck + tests + build + helm-lint on every PR, plus a smoke-test job that boots the production server with SQLite and drives the compiled `oma` binary against it end-to-end. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Quickstart

### Self-host in 60 seconds (Docker Compose)

The fastest path — production-ish stack with Postgres, the API server, the web UI, and nginx in one command. No Node.js, no pnpm, nothing to install locally.

```bash
git clone https://github.com/langwatch/open-managed-agents.git
cd open-managed-agents

# Add at least one LLM provider key (or none, to use local Ollama)
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY=sk-ant-... OR OPENAI_API_KEY=sk-proj-... OR
#            GOOGLE_GENERATIVE_AI_API_KEY=... OR MISTRAL_API_KEY=...
#            OR GROQ_API_KEY=... — any one is enough

docker compose up -d
```

That's it. Now open:

- **Web UI:**   http://localhost:5173 (log in as `admin@localhost` / see `OMA_DEFAULT_ADMIN_PASSWORD`)
- **API:**      http://localhost:3001
- **Swagger:**  http://localhost:3001/docs

The stack is a [multi-stage](Dockerfile.server) non-root server image with a curl HEALTHCHECK, plus a [Postgres](docker-compose.yml) container with a persistent volume. For SQLite instead of Postgres, set `DATABASE_PATH=/app/data/oma.db` and drop the `postgres` service.

### Run on Kubernetes (Helm)

```bash
helm install oma ./helm/open-managed-agents \
  --set env.ANTHROPIC_API_KEY=sk-ant-... \
  --set database.type=postgres \
  --set database.postgres.embedded=true
```

The chart ships with three supported database modes: **sqlite** (PVC-backed), **embedded postgres** (StatefulSet), and **external postgres** (DATABASE_URL in a Secret). All three are validated on every CI run. See [`helm/open-managed-agents`](helm/open-managed-agents).

### Local dev setup

If you want to hack on the code instead:

```bash
pnpm install
cp .env.example .env   # add your keys
pnpm dev               # server on :3001, web on :5173
```

Prereqs: Node.js 22+, pnpm 10+.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/quickstart-qa-01-empty.png" alt="Quickstart with chat on the left and templates on the right" />
      <p align="center"><strong>Quickstart</strong> — chat with the agent builder on the left, browse templates on the right</p>
    </td>
    <td width="50%">
      <img src="docs/screenshots/quickstart-qa-02-draft.png" alt="Draft agent preview with connectors" />
      <p align="center"><strong>Agent builder chat</strong> — real LLM round trip, YAML/JSON draft preview, connector pills</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/qa-sweep/03-agents.png" alt="Agents list" />
      <p align="center"><strong>Agents</strong> — create, version, archive; full CRUD via REST + CLI</p>
    </td>
    <td width="50%">
      <img src="docs/screenshots/qa-sweep/04-sessions.png" alt="Sessions list" />
      <p align="center"><strong>Sessions</strong> — trace + debug every turn, tool call, and token</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/qa-sweep/08-settings.png" alt="LLM provider management" />
      <p align="center"><strong>LLM providers</strong> — Anthropic, OpenAI, Google, Mistral, Groq, Ollama, any OpenAI-compatible</p>
    </td>
    <td width="50%">
      <img src="docs/screenshots/qa-sweep/07-usage.png" alt="Usage and cost analytics" />
      <p align="center"><strong>Usage &amp; cost</strong> — tokens and spend broken down by provider and agent</p>
    </td>
  </tr>
</table>

### Using with Ollama (no API key needed)

```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.1

# Start Open Managed Agents
pnpm dev

# Add Ollama as a provider via API:
curl -X POST http://localhost:3001/v1/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ollama",
    "type": "ollama",
    "base_url": "http://localhost:11434/v1",
    "default_model": "llama3.1",
    "is_default": true
  }'
```

## Multi-LLM Providers

Agents can use any configured LLM provider. Providers are managed via the API:

```bash
# List configured providers
curl http://localhost:3001/v1/providers

# Add OpenAI
curl -X POST http://localhost:3001/v1/providers \
  -H "Content-Type: application/json" \
  -d '{"name": "OpenAI", "type": "openai", "api_key": "sk-...", "default_model": "gpt-4o"}'

# List available models for a provider
curl http://localhost:3001/v1/providers/provider_openai/models

# Create an agent using a specific provider
curl -X POST http://localhost:3001/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT Agent",
    "model": "gpt-4o",
    "model_provider_id": "provider_openai",
    "system": "You are a helpful assistant."
  }'
```

## Enterprise Governance

### Governance Config File (Infra-as-Code)

Deploy access controls via a JSON config file:

```bash
# Set the governance config path
export GOVERNANCE_CONFIG=governance.json

# Start the server - config is applied on startup
pnpm --filter @open-managed-agents/server dev
```

See `governance.example.json` for a full example covering:
- Provider definitions with API key references from env vars
- Organization with multiple teams
- Per-team provider access with rate limits and budgets
- Per-team MCP connector policies (allow/block/require approval)
- Project structure

### API-based Governance

```bash
# Create organization
curl -X POST http://localhost:3001/v1/organizations \
  -d '{"name": "Acme Corp", "slug": "acme"}'

# Create team
curl -X POST http://localhost:3001/v1/organizations/org_acme/teams \
  -d '{"name": "Engineering", "slug": "engineering"}'

# Control which providers a team can use
curl -X POST http://localhost:3001/v1/teams/team_acme_engineering/provider-access \
  -d '{"provider_id": "provider_anthropic", "enabled": true, "rate_limit_rpm": 1000, "monthly_budget_usd": 500}'

# Block specific MCP integrations
curl -X POST http://localhost:3001/v1/teams/team_acme_engineering/mcp-policies \
  -d '{"connector_id": "stripe", "policy": "blocked"}'

# View audit log
curl http://localhost:3001/v1/audit-log
```

## Self-Hosting

For the basic deployment commands see [Quickstart](#quickstart) above. This section covers the knobs you'll want to tune for a real deployment.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ⭐ any one | — | Anthropic API key — auto-seeds a provider row at boot |
| `OPENAI_API_KEY` | ⭐ any one | — | OpenAI API key — auto-seeds a provider row |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ⭐ any one | — | Google Gemini API key — auto-seeds a provider row |
| `MISTRAL_API_KEY` | ⭐ any one | — | Mistral API key — auto-seeds a provider row |
| `GROQ_API_KEY` | ⭐ any one | — | Groq API key — auto-seeds a provider row |
| `OMA_SEED_OLLAMA` | No | `true` if no other key | If `true`, auto-seeds an Ollama provider pointing at `http://localhost:11434/v1` — zero-config local-LLM path |
| `DATABASE_URL` | No | — | Postgres connection string. When set, Postgres is used instead of SQLite |
| `DATABASE_PATH` | No | `data/oma.db` | SQLite database path (used when `DATABASE_URL` is not set) |
| `PORT` | No | `3001` | Server port |
| `AUTH_ENABLED` | No | `true` | Set to `false` to disable the session cookie guard (dev/test only) |
| `OMA_DEFAULT_ADMIN_PASSWORD` | No | `admin` | Initial password for `admin@localhost` on fresh installs — **change this in production** |
| `VAULT_ENCRYPTION_KEY` | No | Auto-generated | 32-byte hex key for AES-256-GCM credential encryption. Auto-generated on first boot and written back to `.env` if missing |
| `GOVERNANCE_CONFIG` | No | — | Path to a governance JSON file (orgs/teams/projects/policies) loaded on startup |

⭐ = you need at least one LLM provider configured. Either set one of the API key variables above, or leave them all unset and the server will auto-seed an Ollama provider so you can run fully locally with no cloud credentials.

### Databases

The server supports two database backends with the same schema:

- **SQLite** (default) — `data/oma.db`, zero-config, great for single-node deployments and local dev. Ships in the Helm chart as a PVC-backed volume.
- **Postgres** — set `DATABASE_URL=postgres://user:pass@host:5432/oma`. The schema auto-migrates on boot. The Helm chart supports both an **embedded** StatefulSet-based Postgres (great for self-contained cluster installs) and **external** Postgres (for RDS / Cloud SQL / Aurora / Supabase / Neon, etc.).

Either backend can be swapped in without code changes — the `DbAdapter` interface normalizes dialect differences (`?` vs `$1..$N` placeholders, datetime defaults, `INSERT ... ON CONFLICT`).

### Governance config (Infra-as-Code)

Set `GOVERNANCE_CONFIG=/path/to/governance.json` and the server will load orgs, teams, projects, memberships, provider access grants, and MCP policies on boot. See [`governance.example.json`](governance.example.json) for the full schema.

This is the pattern for GitOps-style deployments: commit `governance.json` alongside your Helm values, and every `helm upgrade` redeploys the latest access controls in sync with the code change.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────┐
│   React Web UI  │────▶│     Hono API Server      │
│  (Vite + React  │     │                          │
│   Router + TQ)  │     │  ┌────────────────────┐  │
└─────────────────┘     │  │   LLM Providers    │  │
                        │  │  ┌──────────────┐  │  │
┌─────────────────┐     │  │  │  Anthropic   │  │  │
│    CLI (oma)    │────▶│  │  │  OpenAI      │  │  │
│                 │     │  │  │  Ollama      │  │  │
└─────────────────┘     │  │  │  Compatible  │  │  │
                        │  │  └──────────────┘  │  │
                        │  │                    │  │
                        │  │   Agent Engine     │  │
                        │  │  ┌──────────────┐  │  │
                        │  │  │ Agent Loop   │  │  │
                        │  │  │ Tool Exec    │  │  │
                        │  │  │ SSE Stream   │  │  │
                        │  │  └──────────────┘  │  │
                        │  │                    │  │
                        │  │   Governance       │  │
                        │  │  ┌──────────────┐  │  │
                        │  │  │ Org/Team/Proj│  │  │
                        │  │  │ RBAC         │  │  │
                        │  │  │ MCP Policies │  │  │
                        │  │  │ Audit Log    │  │  │
                        │  │  └──────────────┘  │  │
                        │  └────────────────────┘  │
                        │                          │
                        │  SQLite (oma.db)          │
                        └──────────────────────────┘
```

## Project Structure

```
open-managed-agents/
├── packages/
│   ├── types/          # Shared TypeScript types (Zod schemas)
│   ├── server/         # Hono API server with agent engine
│   │   ├── src/
│   │   │   ├── db/           # SQLite database layer
│   │   │   ├── engine/       # Agent execution engine
│   │   │   ├── providers/    # LLM provider abstraction
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── openai.ts
│   │   │   ├── routes/       # API routes
│   │   │   │   ├── agents.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── events.ts
│   │   │   │   ├── providers.ts
│   │   │   │   ├── governance.ts
│   │   │   │   └── ...
│   │   │   └── lib/          # Auth, encryption, governance config
│   │   └── data/             # SQLite database (gitignored)
│   ├── web/            # React frontend
│   └── cli/            # CLI tool (oma)
├── helm/               # Kubernetes Helm chart
├── specs/              # BDD feature specifications (17 files)
├── governance.example.json  # Example governance config
├── docker-compose.yml
├── Dockerfile.server
├── Dockerfile.web
└── nginx.conf
```

## API Reference

Full OpenAPI documentation is available at `http://localhost:3001/docs` when the server is running.

### Core Resources
- `POST/GET /v1/agents` — Create, list, retrieve, update, archive agents
- `POST/GET /v1/sessions` — Create, list, retrieve sessions
- `POST/GET /v1/sessions/{id}/events` — Send messages, list events
- `GET /v1/sessions/{id}/events/stream` — SSE event stream
- `POST/GET /v1/environments` — Manage execution environments
- `POST/GET /v1/vaults` — Manage credential vaults

### Provider Management
- `GET/POST /v1/providers` — List and add LLM providers
- `GET /v1/providers/{id}/models` — List available models
- `DELETE /v1/providers/{id}` — Remove a provider

### Governance
- `GET/POST /v1/organizations` — Manage organizations
- `GET/POST /v1/organizations/{id}/teams` — Manage teams
- `GET/POST /v1/teams/{id}/projects` — Manage projects
- `GET/POST /v1/teams/{id}/members` — Manage team membership
- `GET/POST /v1/teams/{id}/provider-access` — Control LLM provider access per team
- `GET/POST /v1/teams/{id}/mcp-policies` — Control MCP connector access per team
- `GET /v1/audit-log` — View audit trail

### Discovery
- `GET /v1/mcp/connectors` — Browse available MCP connectors

## Development

```bash
pnpm dev          # Start server + frontend
pnpm build        # Build all packages
pnpm test         # Run tests (74 tests across 10 suites)
pnpm typecheck    # Type-check all packages
```

## Contributing

Contributions welcome. The project follows a BDD-first workflow — check `specs/` for feature specifications.

## License

MIT
