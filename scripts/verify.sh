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
pnpm run typecheck

echo ""
echo "4. Running tests..."
pnpm --filter @open-managed-agents/web test

echo ""
echo "5. Building frontend..."
pnpm --filter @open-managed-agents/web exec vite build

echo ""
echo "6. Verifying CLI..."
pnpm --filter @open-managed-agents/cli exec tsx src/index.ts --version

echo ""
echo "=== All checks passed! ==="
echo ""
echo "To start development:"
echo "  1. Copy .env.example to .env and add your API key"
echo "  2. Run: pnpm dev"
echo "  3. Open: http://localhost:5173"
