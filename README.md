# Open Managed Agents

An open-source clone of [Anthropic's Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/quickstart) platform. TypeScript monorepo with a React UI matching the Anthropic console, a Hono API server with auto-generated OpenAPI specs, and a CLI tool.

> **Verified E2E**: Creates real agents, environments, and sessions on Anthropic's API. Sends messages, receives event streams, and displays them in real-time.

## Features

- **Quickstart Wizard** — guided 4-step flow: create agent, configure environment, start session, test run. Template browser with 10 pre-built agent templates
- **Agent Builder** — create and configure agents with model selection, system prompts, tool configurations (bash, edit, read, write, glob, grep, web_fetch, web_search), MCP server connections, and skills
- **Environment Manager** — configure cloud containers with networking policies (unrestricted/limited), package managers (pip, npm, apt, cargo, gem, go)
- **Session Viewer** — real-time event streaming with Transcript and Debug views, color-coded event badges (Running/User/Model/Tool/Agent/Idle), token usage, elapsed time, search/filter, message input to interact with running agents
- **Credential Vaults** — AES-256-GCM encrypted credential storage for MCP server tokens and OAuth credentials
- **OpenAPI Specs** — auto-generated from Zod schemas, Swagger UI at `/docs`
- **CLI** — full command-line interface (`oma`) with 1:1 API endpoint mapping
- **Dark Theme** — UI matching the Anthropic console aesthetic

## Authentication

Multiple auth methods, in priority order:

| Method | How | Best for |
|---|---|---|
| **API Key (env)** | Set `ANTHROPIC_API_KEY` in `.env` or environment | Server deployments |
| **API Key (header)** | Pass `x-api-key` header per request | Multi-tenant / frontend |
| **Claude Code Auth** | _(coming soon)_ Reuse your Claude Max/Pro subscription via local OAuth token | Local development |

### Claude Code Auth (Roadmap)

If you have Claude Code installed and authenticated, Open Managed Agents can detect your local OAuth credentials from `~/Library/Application Support/Claude/config.json` (macOS) or `~/.config/Claude/config.json` (Linux). This lets Claude Max/Pro subscribers use their existing subscription without a separate API key.

**Status:** Detection is implemented; decryption via macOS Keychain (keytar) is in progress.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 10+
- An Anthropic API key (or Claude Code subscription, coming soon)

### Setup

```bash
git clone https://github.com/your-org/open-managed-agents.git
cd open-managed-agents
pnpm install

# Set your API key
echo 'ANTHROPIC_API_KEY=your-key-here' > .env
```

### Run

```bash
# Start both server + frontend (recommended)
pnpm dev

# Or start individually:
pnpm --filter @open-managed-agents/server dev  # API server on port 3001
pnpm --filter @open-managed-agents/web dev     # Frontend on port 5173
```

Open [http://localhost:5173](http://localhost:5173) for the UI, or [http://localhost:3001/docs](http://localhost:3001/docs) for the Swagger UI.

### CLI

```bash
# Run directly
npx tsx packages/cli/src/index.ts agents list

# Or alias it
alias oma="npx tsx $(pwd)/packages/cli/src/index.ts"

# Create an agent
oma agents create --name "My Agent" --model claude-sonnet-4-6 --system "You are helpful."

# Create an environment
oma environments create --name "dev-env" --networking unrestricted

# Create a session and interact
oma sessions run --agent agent_xxx --environment env_xxx

# Stream session events
oma sessions stream sesn_xxx

# Full help
oma --help
oma sessions --help
```

## Architecture

```
packages/
  types/     — Shared TypeScript types (strict 1:1 mapping from Anthropic SDK)
  server/    — Hono API server with @hono/zod-openapi
  web/       — React 19 + Vite + Tailwind v4 frontend
  cli/       — Commander-based CLI tool
specs/       — BDD feature specs (Gherkin format)
.refs/       — Cloned reference repos (gitignored)
```

### API Server

The server proxies requests to the Anthropic Managed Agents API, adding:

- **OpenAPI documentation** — auto-generated from Zod schemas, served at `/openapi.json`
- **Swagger UI** — interactive API explorer at `/docs`
- **Vault encryption** — AES-256-GCM encryption for credential storage
- **CORS** — enabled for frontend development
- **Auth middleware** — flexible API key resolution (env, header, Claude Code)

### Endpoints

| Group | Endpoints |
|---|---|
| **Agents** | `POST/GET /v1/agents`, `GET/POST /v1/agents/:id`, `POST /v1/agents/:id/archive` |
| **Environments** | `POST/GET /v1/environments`, `GET/POST/DELETE /v1/environments/:id`, `POST /v1/environments/:id/archive` |
| **Sessions** | `POST/GET /v1/sessions`, `GET/POST/DELETE /v1/sessions/:id`, `POST /v1/sessions/:id/archive` |
| **Events** | `GET/POST /v1/sessions/:id/events`, `GET /v1/sessions/:id/events/stream` (SSE) |
| **Resources** | `GET/POST /v1/sessions/:id/resources`, `GET/POST/DELETE /v1/sessions/:id/resources/:rid` |
| **Vaults** | `POST/GET /v1/vaults`, `GET/POST/DELETE /v1/vaults/:id`, `POST /v1/vaults/:id/archive` |
| **Credentials** | `POST/GET /v1/vaults/:id/credentials`, `GET/POST/DELETE /v1/vaults/:vid/credentials/:cid` |

### Vault Encryption

Credential secrets (tokens, client secrets, refresh tokens) are encrypted at rest using:

- **Algorithm:** AES-256-GCM
- **Key:** 32-byte key from `VAULT_ENCRYPTION_KEY` env var (auto-generated on first run)
- **IV:** Random 12-byte nonce per credential
- **Auth tag:** 16-byte GCM authentication tag for tamper detection
- **Storage:** Base64-encoded `IV + ciphertext + authTag`

Secret values are **never** returned in API responses.

## Frontend

React 19 with Vite 6, Tailwind CSS v4, TanStack React Query, React Router, and Lucide icons.

### Pages

| Page | Route | Description |
|---|---|---|
| Quickstart | `/quickstart` | 4-step wizard: template → agent → environment → session |
| Agents | `/agents` | List, filter, paginate agents |
| Agent detail | `/agents/:id` | YAML/JSON config view, details sidebar |
| Sessions | `/sessions` | List, filter by agent, checkboxes |
| Session detail | `/sessions/:id` | Transcript/Debug views, SSE streaming, send messages |
| Environments | `/environments` | List with All/Active filter |
| Environment detail | `/environments/:id` | Networking, packages, details |
| Vaults | `/vaults` | List with All/Active filter |
| Vault detail | `/vaults/:id` | Credentials table, vault details |

### Tests

74 tests across 10 test suites using Vitest + React Testing Library:

```bash
pnpm --filter @open-managed-agents/web test
```

## BDD Specs

All features are specified upfront in `specs/` using Gherkin format:

| Spec | Covers |
|---|---|
| `quickstart.feature` | Full 4-step wizard flow, template browser |
| `agents-api.feature` | Agents CRUD, validation, versioning, concurrency |
| `sessions-api.feature` | Sessions lifecycle, status transitions, agent snapshots |
| `events-api.feature` | Event send/list/stream, SSE, all event types |
| `environments-api.feature` | Networking, packages, CRUD |
| `vaults-api.feature` | Vault + credential CRUD, encryption, secret redaction |
| `encryption.feature` | AES-256-GCM algorithm, key management |
| `auth.feature` | API key, Claude Code auth, per-request override |
| `cli.feature` | All CLI commands, output formats, interactive mode |
| `openapi.feature` | Auto-generated spec, Swagger UI, schema validation |
| `*-ui.feature` | UI pages: agents, sessions, environments, vaults, layout |

**Workflow:** Specs are written before implementation. When new behaviors are discovered, specs are updated first.

## Development

```bash
# Type-check all packages
pnpm typecheck

# Run frontend tests
pnpm --filter @open-managed-agents/web test

# Build all packages
pnpm build

# Build types (needed before other packages)
pnpm --filter @open-managed-agents/types build
```

## Roadmap

- [x] Full quickstart wizard (template → agent → environment → session)
- [x] Session detail page with Transcript/Debug views
- [x] Real E2E with Anthropic API (agent create, env create, session, events)
- [ ] Claude Code OAuth token decryption (keytar / macOS Keychain)
- [ ] Live SSE streaming in session detail (currently polls)
- [ ] Agent editor/detail page with inline config editing
- [ ] MCP discovery service integration for connector marketplace
- [ ] Connector logo icons (replacing text badges)
- [ ] Server integration tests
- [ ] CLI interactive session REPL improvements
- [ ] Docker compose for easy deployment
- [ ] File upload support for session resources
- [ ] GitHub repository resource mounting

## License

MIT
