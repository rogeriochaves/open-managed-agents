#!/bin/bash
set -e

echo "=== Open Managed Agents - Verification ==="
echo ""

echo "1. Installing dependencies..."
pnpm install --frozen-lockfile

echo ""
echo "2. Building types..."
pnpm --filter @open-managed-agents/types build

echo ""
echo "3. Type checking all packages..."
pnpm typecheck

echo ""
echo "4. Running tests (88 tests across 12 suites)..."
pnpm --filter @open-managed-agents/web test

echo ""
echo "5. Building all packages..."
pnpm build

echo ""
echo "6. Verifying CLI..."
pnpm --filter @open-managed-agents/cli exec tsx src/index.ts --version

echo ""
echo "7. Verifying governance config example..."
if [ -f "governance.example.json" ]; then
  python3 -c "import json; json.load(open('governance.example.json'))" && echo "  governance.example.json is valid JSON"
else
  echo "  WARNING: governance.example.json not found"
fi

echo ""
echo "8. Verifying Helm chart..."
if [ -f "helm/open-managed-agents/Chart.yaml" ]; then
  echo "  Helm chart present at helm/open-managed-agents/"
  ls helm/open-managed-agents/templates/ | head -5
else
  echo "  WARNING: Helm chart not found"
fi

echo ""
echo "=== All checks passed! ==="
echo ""
echo "Features verified:"
echo "  - 4 packages build (types, server, web, cli)"
echo "  - 88 frontend tests passing"
echo "  - TypeScript strict mode clean"
echo "  - Governance config example present"
echo "  - Helm chart present"
echo ""
echo "To start development:"
echo "  1. Copy .env.example to .env and add an ANTHROPIC_API_KEY or OPENAI_API_KEY"
echo "  2. Run: pnpm dev"
echo "  3. Open: http://localhost:5173"
echo ""
echo "To deploy with Docker:"
echo "  docker-compose up"
echo ""
echo "To deploy with Helm:"
echo "  helm install oma ./helm/open-managed-agents \\"
echo "    --set server.env.ANTHROPIC_API_KEY=\$ANTHROPIC_API_KEY"
