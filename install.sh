#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "  MailDeck — Installing..."
echo ""

# 1. Install dependencies
echo "  [1/3] Installing dependencies..."
npm install

# 2. Build shared + sync-daemon
echo "  [2/3] Building..."
npm run build

# 3. Create global 'maildeck' command
echo "  [3/3] Linking CLI..."
npm link --workspace=packages/sync-daemon

echo ""
echo "  Done! Run 'maildeck setup' to connect your Gmail account."
echo ""
