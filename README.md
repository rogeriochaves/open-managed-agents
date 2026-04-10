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

---

## Why Open Managed Agents?

Claude Managed Agents is great — but it's locked to Anthropic's cloud, Anthropic's models, and Anthropic's access controls. **Open Managed Agents** gives you the same experience with:

| | Claude Managed Agents | Open Managed Agents |
|---|:---:|:---:|
| **Self-hosted** | No | Yes |
| **Multi-LLM** (Anthropic, OpenAI, Ollama, etc.) | No | Yes |
| **Org/Team/Project hierarchy** | Limited | Full RBAC |
| **API key governance per team** | No | Yes |
| **MCP integration policies** | No | Per-team allow/block |
| **Infra-as-code config** | No | JSON/YAML governance file |
| **Helm chart** | N/A | Included |
| **Audit logging** | Limited | Full |
| **Local/air-gapped deployment** | No | Yes (Ollama) |

## Features

### Agent Management
- **Quickstart Wizard** — 4-step guided flow: select template → create agent → configure environment → start session
- **10 Pre-built Templates** — Blank, Deep Researcher, Structured Extractor, Field Monitor, Support Agent, Incident Commander, Feedback Miner, Sprint Retro Facilitator, Support-to-Eng Escalator, Data Analyst
- **Agent Builder** — model selection, system prompts, tool configs (bash, edit, read, write, glob, grep, web_fetch, web_search), MCP servers, skills

### Multi-LLM Provider Support
- **Anthropic** — Claude Opus, Sonnet, Haiku
- **OpenAI** — GPT-4o, GPT-4o-mini, o3, o4
- **OpenAI-compatible** — Any API following the OpenAI format (Azure OpenAI, Together, Groq, Fireworks, etc.)
- **Ollama** — Local models (Llama 3, Mistral, CodeLlama, Phi, etc.)
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

## Quickstart

### Prerequisites
- Node.js 22+
- pnpm 10+

### Setup

```bash
git clone https://github.com/langwatch/open-managed-agents.git
cd open-managed-agents
pnpm install

# Add at least one LLM provider API key
cp .env.example .env
# Edit .env with your keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   OPENAI_API_KEY=sk-proj-...

# Start development servers
pnpm dev
```

Open http://localhost:5173 and follow the Quickstart wizard.

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

### Docker Compose

```bash
docker-compose up
# Web UI: http://localhost:5173
# API:    http://localhost:3001
# Docs:   http://localhost:3001/docs
```

### Helm Chart (Kubernetes)

```bash
helm install oma ./helm/open-managed-agents \
  --set server.env.ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --set ingress.enabled=true \
  --set ingress.host=agents.your-company.com
```

See `helm/open-managed-agents/values.yaml` for all configuration options.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No* | — | Anthropic API key (auto-creates provider) |
| `OPENAI_API_KEY` | No* | — | OpenAI API key (auto-creates provider) |
| `DATABASE_PATH` | No | `data/oma.db` | SQLite database path |
| `PORT` | No | `3001` | Server port |
| `VAULT_ENCRYPTION_KEY` | No | Auto-generated | AES-256 key for credential encryption |
| `GOVERNANCE_CONFIG` | No | — | Path to governance config JSON file |

*At least one LLM provider API key is needed, or configure Ollama for local models.

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
