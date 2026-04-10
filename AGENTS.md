# Open Managed Agents - Development Guide

## Workflow: BDD Specs First

**Every feature follows this flow:**

1. **Discover** - Explore the Anthropic console UI and SDK to understand the behavior
2. **Spec** - Write BDD specs in `specs/` capturing requirements and behaviors
3. **Implement** - Build the feature to satisfy the specs
4. **Test** - Write tests that verify the specs pass (react-testing-library for frontend, vitest for backend)
5. **Compare** - Open the Anthropic console and our solution side-by-side, iterate

When discovering new features or behaviors during implementation:
- **STOP implementation**
- **Update or add BDD specs first**
- **Then continue implementation**

## Architecture

- `packages/types` - Shared TypeScript types (strict, 1:1 mapping from Anthropic SDK)
- `packages/server` - Hono API server with @hono/zod-openapi (auto-generated OpenAPI specs)
  - `src/db/` - SQLite local storage (better-sqlite3)
  - `src/engine/` - Agent execution engine with tool execution and SSE streaming
  - `src/providers/` - LLM provider abstraction (Anthropic, OpenAI, Ollama, OpenAI-compatible)
  - `src/routes/` - API routes (agents, sessions, events, environments, vaults, providers, governance, usage, auth)
  - `src/lib/` - Auth (bcrypt + sessions), encryption, governance config loader
- `packages/web` - React + Vite + TailwindCSS v4 frontend (matching Anthropic console UI)
- `packages/cli` - Commander-based CLI (1:1 command mapping to API)
- `helm/` - Kubernetes Helm chart for production self-hosting
- `specs/` - BDD feature specs (Gherkin format)
- `governance.example.json` - Example governance config for infra-as-code deployments

## Key Decisions

- **Self-hosted execution** - Previously a proxy to Anthropic; now a full local execution engine
  storing agents, sessions, and events in SQLite
- **Multi-LLM provider abstraction** - pluggable LLM backends (Anthropic, OpenAI, OpenAI-compatible,
  Ollama) with unified `chat()` / `chatStream()` interface
- **Hono** over Express for OpenAPI spec generation via zod-openapi
- **Vault encryption** uses AES-256-GCM with a key derived from `VAULT_ENCRYPTION_KEY` env var
- **Session auth** via bcrypt-hashed passwords and SHA-256-hashed session tokens in httpOnly cookies
- **Governance** - Org > Team > Project hierarchy with per-team provider access control and MCP
  integration policies, loadable from a JSON config file
- **pnpm** workspaces for monorepo management
- **Tailwind v4** for styling matching the Anthropic dark theme

## BDD Specs Index

All specs live in `specs/` using Gherkin format:

| File | Covers |
|---|---|
| `quickstart.feature` | The full quickstart wizard: template selection, agent creation, environment config, session start, test run, event streaming |
| `agents-api.feature` | Agents CRUD API: create, retrieve, update, list, archive, versions, validation |
| `agents-ui.feature` | Agents list page, table, filters, navigation, agent detail |
| `environments-api.feature` | Environments CRUD API: networking (unrestricted/limited), packages, metadata |
| `environments-ui.feature` | Environments list page, filters, creation form |
| `sessions-api.feature` | Sessions CRUD API: creation with resources/vaults, status lifecycle, agent snapshot |
| `sessions-ui.feature` | Sessions list, detail, transcript/debug views, event streaming, filtering |
| `events-api.feature` | Session events: send (message/interrupt/confirm/custom_tool_result), list, SSE stream |
| `vaults-api.feature` | Vaults CRUD + credentials CRUD, encryption at rest, secret redaction |
| `vaults-ui.feature` | Vaults list, creation, credential management UI |
| `encryption.feature` | AES-256-GCM encryption: key management, algorithm, what gets encrypted, API response behavior |
| `cli.feature` | CLI tool: all commands for agents/environments/sessions/vaults/events, output formats |
| `layout.feature` | App shell: sidebar nav, workspace selector, stepper, dark theme |
| `openapi.feature` | Auto-generated OpenAPI spec: all endpoints documented, Swagger UI |
| `auth.feature` | API key, Claude Code auth, per-request override |
| `agent-detail.feature` | Agent detail page: config view, sidebar, archive |
| `mcp-discovery.feature` | MCP connector registry: list, search, filter, details |

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No* | — | Anthropic provider API key |
| `OPENAI_API_KEY` | No* | — | OpenAI provider API key |
| `DATABASE_PATH` | No | `data/oma.db` | SQLite database path |
| `PORT` | No | `3001` | Server port |
| `VAULT_ENCRYPTION_KEY` | No | auto-generated | AES-256 vault encryption key |
| `GOVERNANCE_CONFIG` | No | — | Path to governance config JSON |
| `OMA_DEFAULT_ADMIN_PASSWORD` | No | `admin` | Default admin password on first run |

*At least one LLM provider is required, or configure Ollama for local models.

## Reference Repos (cloned in .refs/)

- `.refs/anthropic-sdk-typescript` - Official Anthropic TypeScript SDK (types source of truth)
- `.refs/claude-agent-sdk-typescript` - Claude Agent SDK (harness)

## Current Status

**Production-ready self-hostable platform.** Full feature parity with Claude Managed Agents
for end-user experience, plus enterprise governance layer on top.

### Implemented Features (beyond Claude Managed Agents):
- Multi-LLM provider support (Anthropic, OpenAI, OpenAI-compatible, Ollama)
- Organization / Team / Project hierarchy with RBAC
- Per-team provider access control with rate limits and budgets
- Per-team MCP integration policies (allow/block/require_approval)
- Infra-as-code governance config
- Session-based authentication with bcrypt + httpOnly cookies
- Usage & Cost analytics with provider/agent breakdowns
- Audit logging
- Helm chart for Kubernetes deployment
- Self-hosted SQLite storage (no external dependencies)

### Verified E2E:
- Agent creation via quickstart wizard → real LLM call → agent response
- Multi-LLM tested: Anthropic Claude and OpenAI GPT-4o-mini both produce responses
- Event streaming in Transcript/Debug views with event detail side panel
- Token usage tracking in real time
- All CRUD pages with local data
- Governance controls: provider access (enabled 1000 RPM $500/mo), MCP policies (Stripe blocked)
- Login flow: bcrypt password verification + session cookies
- Full build pipeline: 4 packages build clean, 88 tests passing, typecheck clean
