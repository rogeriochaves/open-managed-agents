#!/usr/bin/env bash
#
# CLI smoke test — exercises the built `oma` binary against a running
# Open Managed Agents server. Proves the self-hosting path works
# end-to-end: the CLI must hit the local OMA API, NOT api.anthropic.com.
#
# Assumes the server is already running on OMA_API_BASE (default
# http://localhost:3001). Does not need ANTHROPIC_API_KEY.
#
# Usage:
#   ./scripts/cli-smoke-test.sh
#   OMA_API_BASE=https://oma.acme.internal ./scripts/cli-smoke-test.sh

set -euo pipefail

OMA_API_BASE="${OMA_API_BASE:-http://localhost:3001}"
export OMA_API_BASE

CLI_BIN="packages/cli/dist/index.js"

if [ ! -f "$CLI_BIN" ]; then
  echo "✗ CLI is not built. Run: pnpm --filter @open-managed-agents/cli build"
  exit 1
fi

echo "→ Testing CLI against $OMA_API_BASE"

# Health: we check the server is reachable first so the failure mode
# is clear if it isn't. /health is the canonical liveness endpoint
# (same path used by the Dockerfile HEALTHCHECK and helm probes).
if ! curl -sSf -o /dev/null "$OMA_API_BASE/health"; then
  echo "✗ Server at $OMA_API_BASE is not reachable"
  exit 1
fi
echo "✓ Server reachable"

# 1. Agents list (table output; OK even if empty)
if ! node "$CLI_BIN" agents list --limit 3 >/dev/null 2>&1; then
  echo "✗ oma agents list failed"
  exit 1
fi
echo "✓ oma agents list"

# 2. Create an agent so subsequent JSON test has real data
if ! node "$CLI_BIN" agents create \
  --name "smoke-test-agent-$$" \
  --model "claude-sonnet-4-6" \
  --system "smoke test agent" >/dev/null 2>&1; then
  echo "✗ oma agents create failed"
  exit 1
fi
echo "✓ oma agents create"

# 3. Agents list (JSON output must now include at least one agent)
if ! node "$CLI_BIN" --output json agents list --limit 5 | grep -q '"id":'; then
  echo "✗ oma agents list --output json did not return valid JSON"
  exit 1
fi
echo "✓ oma agents list --output json"

# 3. Environments list
if ! node "$CLI_BIN" environments list >/dev/null 2>&1; then
  echo "✗ oma environments list failed"
  exit 1
fi
echo "✓ oma environments list"

# 4. Sessions list (should work even if empty)
if ! node "$CLI_BIN" sessions list --limit 3 >/dev/null 2>&1; then
  echo "✗ oma sessions list failed"
  exit 1
fi
echo "✓ oma sessions list"

# 5. Vaults list
if ! node "$CLI_BIN" vaults list >/dev/null 2>&1; then
  echo "✗ oma vaults list failed"
  exit 1
fi
echo "✓ oma vaults list"

# 6. OpenAPI spec is published and looks like 3.x with several paths.
# The spec is minified JSON so we can't anchor to line starts; use a
# Node one-liner to parse it and count keys under `paths`.
OPENAPI=$(curl -sSf "$OMA_API_BASE/openapi.json")
PATH_COUNT=$(echo "$OPENAPI" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.openapi || !j.openapi.startsWith("3.")) {
    process.stderr.write("not openapi 3.x\n"); process.exit(2);
  }
  const paths = Object.keys(j.paths || {}).filter(p => p.startsWith("/v1/"));
  console.log(paths.length);
})' 2>/dev/null)
if [ -z "$PATH_COUNT" ] || [ "$PATH_COUNT" -lt 10 ]; then
  echo "✗ /openapi.json not valid OpenAPI 3.x with ≥10 /v1/* paths (got '$PATH_COUNT')"
  exit 1
fi
echo "✓ /openapi.json (declares $PATH_COUNT /v1/* paths)"

# 7. Swagger UI is reachable
if ! curl -sSf -o /dev/null "$OMA_API_BASE/docs"; then
  echo "✗ /docs (Swagger UI) is not reachable"
  exit 1
fi
echo "✓ /docs"

echo ""
echo "All CLI smoke tests passed — the 'oma' binary successfully"
echo "drives $OMA_API_BASE end-to-end."
