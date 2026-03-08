#!/usr/bin/env bash
# Neo-Agent — One-liner installer
# Usage: curl -fsSL https://raw.githubusercontent.com/lobsteryogi/neo-agent/main/install.sh | bash
set -euo pipefail

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║      Wake up, Neo...                 ║"
echo "  ║      The Matrix has you.             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# --- Pre-flight checks ---
command -v node >/dev/null 2>&1 || { echo "❌ Node.js ≥ 22 is required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm ≥ 9 is required. Install: npm i -g pnpm"; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "❌ git is required."; exit 1; }

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node.js ≥ 22 is required (found v$(node -v))"
  exit 1
fi

# --- Clone & install ---
INSTALL_DIR="${NEO_INSTALL_DIR:-neo-agent}"

if [ -d "$INSTALL_DIR" ]; then
  echo "📁 Directory '$INSTALL_DIR' already exists — pulling latest..."
  cd "$INSTALL_DIR" && git pull
else
  echo "📥 Cloning neo-agent..."
  git clone https://github.com/lobsteryogi/neo-agent.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "  ✅ Neo-Agent installed successfully!"
echo ""
echo "  Next steps:"
echo "    cd $INSTALL_DIR"
echo "    pnpm neo:onboard      # Run the setup wizard"
echo "    pnpm neo:dev           # Start in dev mode"
echo ""
