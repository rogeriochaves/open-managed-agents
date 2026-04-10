# Security Policy

Open Managed Agents is self-hostable software that is often deployed with real LLM API keys, database credentials, MCP connector tokens, and arbitrary user-supplied prompts. We take vulnerability reports seriously.

## Supported versions

This project is pre-1.0 and iterating quickly. Security fixes land on `main` only — we do not currently maintain patch branches. Self-hosters are encouraged to track `main` or pin to a commit SHA and update regularly.

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories:

  [github.com/rogeriochaves/open-managed-agents/security/advisories/new](https://github.com/rogeriochaves/open-managed-agents/security/advisories/new)

Do **not** open a regular public issue for anything that looks exploitable. Once a fix lands and has been in `main` for a release cycle, we can coordinate public disclosure.

When reporting, please include:

- A clear description of the issue and its impact.
- Reproduction steps (a minimal `curl` against a local server is ideal).
- The commit SHA you were testing.
- Any suggested mitigation if you have one.

We aim to acknowledge reports within 72 hours.

## In scope

- The Hono server (`packages/server`) — auth, vaults, governance, audit log, routes.
- The web app (`packages/web`) — XSS, CSRF on mutating routes, auth boundary.
- The CLI (`packages/cli`).
- The Helm chart and Dockerfiles as shipped in this repo.

## Out of scope

- Vulnerabilities in third-party dependencies that already have public CVEs — please report upstream.
- Bugs in MCP connectors that live outside this repo (e.g. `https://mcp.slack.com/sse`).
- Attacks that require pre-existing admin-level access to the self-hosted instance.
- Findings from automated scanners without a demonstrated impact.

## Security posture by design

The project already ships with several baseline protections — documented here so reporters know what the existing model looks like:

- **Credentials at rest**: vault credentials are encrypted with AES-256-GCM. Tampered ciphertext fails auth-tag verification. See `specs/vaults.feature`.
- **Passwords**: admin passwords are hashed with bcrypt (cost 10) and never stored in plaintext. Session tokens are stored as SHA-256 hashes so the DB can't replay cookies.
- **Cookies**: session cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- **API keys in responses**: LLM provider API keys are never echoed back by `/v1/providers` — only a `has_api_key` boolean. See `packages/server/src/__tests__/providers.test.ts`.
- **Audit log**: every mutation across agents, sessions, environments, providers, vaults, credentials, and governance CRUD is written to `audit_log` with the acting user. See `specs/audit-auto.feature`.
- **Infrastructure-as-code**: all governance (orgs, teams, providers, MCP policies) can be loaded from a JSON config file, so self-hosters never have to shell into the server to configure access.

If you find a way to bypass any of these, that's a report we want to hear.

## Hall of fame

Reporters will be credited here unless they ask otherwise.
