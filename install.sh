#!/usr/bin/env bash
# Neo-Agent — Production-grade installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lobsteryogi/neo-agent/main/install.sh | bash
#   curl ... | bash -s -- --dir ~/my-neo --skip-onboard --build
#   NEO_INSTALL_DIR=~/my-neo bash install.sh
set -euo pipefail

# ─── Constants ─────────────────────────────────────────────────
REPO_URL="https://github.com/lobsteryogi/neo-agent.git"
REQUIRED_NODE_MAJOR=22
REQUIRED_PNPM_MAJOR=9
SCRIPT_VERSION="1.1.0"

# ─── Colors & Formatting ──────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
  BOLD=$(tput bold)
  DIM=$(tput dim)
  GREEN=$(tput setaf 2)
  CYAN=$(tput setaf 6)
  RED=$(tput setaf 1)
  YELLOW=$(tput setaf 3)
  RESET=$(tput sgr0)
else
  BOLD="" DIM="" GREEN="" CYAN="" RED="" YELLOW="" RESET=""
fi

info()  { echo "${CYAN}▸${RESET} $*"; }
ok()    { echo "${GREEN}✔${RESET} $*"; }
warn()  { echo "${YELLOW}⚠${RESET} $*"; }
fail()  { echo "${RED}✖${RESET} $*" >&2; exit 1; }
step()  { echo ""; echo "${BOLD}${CYAN}──── $* ────${RESET}"; }

# ─── Parse Arguments ──────────────────────────────────────────
INSTALL_DIR=""
SKIP_ONBOARD=false
RUN_BUILD=false
BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)        INSTALL_DIR="$2";  shift 2 ;;
    --branch)     BRANCH="$2";       shift 2 ;;
    --skip-onboard) SKIP_ONBOARD=true; shift ;;
    --build)      RUN_BUILD=true;    shift ;;
    --version)    echo "install.sh v${SCRIPT_VERSION}"; exit 0 ;;
    --help|-h)
      echo "Usage: install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --dir PATH         Install directory (default: neo-agent)"
      echo "  --branch NAME      Git branch to clone (default: main)"
      echo "  --skip-onboard     Don't run the onboard wizard after install"
      echo "  --build            Build all packages after install"
      echo "  --version          Show installer version"
      echo "  -h, --help         Show this help"
      echo ""
      echo "Environment variables:"
      echo "  NEO_INSTALL_DIR    Same as --dir"
      exit 0
      ;;
    *) fail "Unknown option: $1 (use --help for usage)" ;;
  esac
done

INSTALL_DIR="${INSTALL_DIR:-${NEO_INSTALL_DIR:-neo-agent}}"

# ─── Banner ───────────────────────────────────────────────────
echo ""
echo "${GREEN}${BOLD}  ╔══════════════════════════════════════╗${RESET}"
echo "${GREEN}${BOLD}  ║${RESET}${DIM}      Wake up, Neo...                 ${GREEN}${BOLD}║${RESET}"
echo "${GREEN}${BOLD}  ║${RESET}${DIM}      The Matrix has you.             ${GREEN}${BOLD}║${RESET}"
echo "${GREEN}${BOLD}  ╚══════════════════════════════════════╝${RESET}"
echo "${DIM}  installer v${SCRIPT_VERSION}${RESET}"
echo ""

# ─── Preflight Checks ────────────────────────────────────────
step "Preflight checks"

# Git
command -v git &>/dev/null || fail "git is required — install from https://git-scm.com"
ok "git $(git --version | awk '{print $3}')"

# Node.js
command -v node &>/dev/null || fail "Node.js ≥ ${REQUIRED_NODE_MAJOR} is required — install from https://nodejs.org"
NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]]; then
  fail "Node.js ≥ ${REQUIRED_NODE_MAJOR} required (found v${NODE_VERSION})"
fi
ok "Node.js v${NODE_VERSION}"

# pnpm
command -v pnpm &>/dev/null || fail "pnpm ≥ ${REQUIRED_PNPM_MAJOR} is required — install: npm i -g pnpm"
PNPM_VERSION=$(pnpm --version)
PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
if [[ "$PNPM_MAJOR" -lt "$REQUIRED_PNPM_MAJOR" ]]; then
  fail "pnpm ≥ ${REQUIRED_PNPM_MAJOR} required (found v${PNPM_VERSION})"
fi
ok "pnpm v${PNPM_VERSION}"

# Claude Code CLI
command -v claude &>/dev/null || fail "Claude Code CLI is required — install: https://docs.anthropic.com/en/docs/claude-code"
if ! claude auth status 2>/dev/null | grep -q '"loggedIn": true'; then
  fail "Claude Code CLI is not logged in — run: claude auth login"
fi
ok "Claude Code CLI (authenticated)"

# Native build tools (required for better-sqlite3 when no prebuilt binary exists)
if [[ "$(uname -s)" == "Linux" ]]; then
  MISSING_TOOLS=()
  command -v make   &>/dev/null || MISSING_TOOLS+=("make")
  command -v g++    &>/dev/null || { command -v gcc &>/dev/null || MISSING_TOOLS+=("g++"); }
  command -v python3 &>/dev/null || MISSING_TOOLS+=("python3")

  if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
    fail "Native build tools missing: ${MISSING_TOOLS[*]}
    better-sqlite3 requires compilation tools on Linux.
    Install them with:
      Debian/Ubuntu:  sudo apt-get install -y build-essential python3
      RHEL/CentOS:    sudo yum groupinstall 'Development Tools' && sudo yum install python3
      Alpine:         sudo apk add build-base python3
      Fedora:         sudo dnf groupinstall 'Development Tools' && sudo dnf install python3"
  fi
  ok "Native build tools (make, g++, python3)"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  # macOS: Xcode CLI tools provide make/g++ — just check once
  if ! xcode-select -p &>/dev/null; then
    warn "Xcode Command Line Tools not found — may be needed for native modules"
    warn "Install: xcode-select --install"
  else
    ok "Xcode Command Line Tools"
  fi
fi

# ─── Clone / Update ──────────────────────────────────────────
step "Repository"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Directory '${BOLD}${INSTALL_DIR}${RESET}' already exists — pulling latest..."
  git -C "$INSTALL_DIR" fetch --prune
  git -C "$INSTALL_DIR" pull --rebase --autostash
  ok "Updated to $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
else
  info "Cloning neo-agent (branch: ${BOLD}${BRANCH}${RESET})..."
  git clone --branch "$BRANCH" --single-branch --depth 1 "$REPO_URL" "$INSTALL_DIR"
  ok "Cloned to ${BOLD}${INSTALL_DIR}${RESET}"
fi

# ─── Install Dependencies ────────────────────────────────────
step "Dependencies"

info "Installing dependencies via pnpm..."
(cd "$INSTALL_DIR" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
ok "Dependencies installed"

# ─── Build (optional) ────────────────────────────────────────
if [[ "$RUN_BUILD" == true ]]; then
  step "Build"
  info "Building all packages..."
  (cd "$INSTALL_DIR" && pnpm build)
  ok "Build complete"
fi

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo "${GREEN}${BOLD}  ✅ Neo-Agent installed successfully!${RESET}"
echo ""
echo "  ${BOLD}Next steps:${RESET}"

# Show cd instruction only if not already inside
RESOLVED_DIR=$(cd "$INSTALL_DIR" && pwd)
if [[ "$(pwd)" != "$RESOLVED_DIR" ]]; then
  echo "    ${DIM}cd ${INSTALL_DIR}${RESET}"
fi

if [[ "$SKIP_ONBOARD" == false ]]; then
  echo "    ${CYAN}pnpm neo:onboard${RESET}      ${DIM}# Run the setup wizard${RESET}"
fi
echo "    ${CYAN}pnpm neo:dev${RESET}           ${DIM}# Start in dev mode${RESET}"
echo "    ${CYAN}pnpm neo:pm2${RESET}           ${DIM}# Start with pm2 (production)${RESET}"
echo ""

# ─── Auto-launch onboard (unless skipped) ─────────────────────
if [[ "$SKIP_ONBOARD" == false ]] && [[ -t 0 ]]; then
  echo -n "  ${YELLOW}Launch the onboard wizard now? [Y/n]${RESET} "
  read -r REPLY </dev/tty 2>/dev/null || REPLY="n"
  if [[ -z "$REPLY" || "$REPLY" =~ ^[Yy]$ ]]; then
    (cd "$INSTALL_DIR" && pnpm neo:onboard)
  fi
fi
