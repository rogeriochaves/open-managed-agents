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
# is clear if it isn't.
if ! curl -sSf -o /dev/null "$OMA_API_BASE/v1/auth/me"; then
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

echo ""
echo "All CLI smoke tests passed — the 'oma' binary successfully"
echo "drives $OMA_API_BASE end-to-end."
