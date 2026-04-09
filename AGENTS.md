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
- `packages/web` - React + Vite + TailwindCSS v4 frontend (matching Anthropic console UI)
- `packages/cli` - Commander-based CLI (1:1 command mapping to API)
- `specs/` - BDD feature specs (Gherkin format)

## Key Decisions

- **Hono** over Express for OpenAPI spec generation via zod-openapi
- **Vault encryption** uses AES-256-GCM with a key derived from `VAULT_ENCRYPTION_KEY` env var (auto-generated in .env)
- **Proxy pattern** - server proxies to Anthropic API, users bring their own API key
- **MCP discovery** - connectors discovered via MCP registry service
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

## Reference Repos (cloned in .refs/)

- `.refs/anthropic-sdk-typescript` - Official Anthropic TypeScript SDK (types source of truth)
- `.refs/claude-agent-sdk-typescript` - Claude Agent SDK (harness)
