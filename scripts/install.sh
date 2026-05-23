#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# OzRouter Installer — One-command setup
# ═══════════════════════════════════════════════════════════════════════════
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/batuhanozkose/OzRouter/main/scripts/install.sh | bash
#
# Environment variables:
#   OZROUTER_REPO_URL    — Git repo URL (default: this repo)
#   OZROUTER_INSTALL_DIR — Target directory (default: $HOME/ozrouter)
#   PM2_APP_NAME         — PM2 process name (default: ozrouter)

# ── Colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m';    GREEN='\033[0;32m';    YELLOW='\033[1;33m'
BLUE='\033[0;34m';   MAGENTA='\033[0;35m';  CYAN='\033[0;36m'
WHITE='\033[1;37m';  BOLD='\033[1m';        DIM='\033[2m'
NC='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────
REPO_URL="${OZROUTER_REPO_URL:-https://github.com/batuhanozkose/OzRouter.git}"
INSTALL_DIR="${OZROUTER_INSTALL_DIR:-$HOME/ozrouter}"
PM2_APP_NAME="${PM2_APP_NAME:-ozrouter}"
NODE_SUPPORTED_RANGE=">=20.20.2 <21 || >=22.22.2 <23 || >=24.0.0 <25"

# ── Spinner frames ────────────────────────────────────────────────────────
BRAILLE=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
SPINNER_FRAMES=("${BRAILLE[@]}")
SPINNER_DELAY=0.08

# ── Banner ────────────────────────────────────────────────────────────────
banner() {
  clear
  echo
  echo -e "  ${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "  ${CYAN}║${NC}  ${BOLD}${WHITE}       🛰️  OzRouter Installer${NC}                           ${CYAN}║${NC}"
  echo -e "  ${CYAN}║${NC}  ${DIM}Unified AI Proxy — 160+ providers, one endpoint${NC}        ${CYAN}║${NC}"
  echo -e "  ${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo
}

# ── Spinner helpers ───────────────────────────────────────────────────────
spinner_pid=""

_spin() {
  local msg="$1"
  local i=0
  while true; do
    printf "\r  ${CYAN}%s${NC} %s" "${SPINNER_FRAMES[$i]}" "$msg"
    i=$(( (i + 1) % ${#SPINNER_FRAMES[@]} ))
    sleep "$SPINNER_DELAY"
  done
}

spin_start() {
  _spin "$1" &
  spinner_pid=$!
}

_spin_stop() {
  if [[ -n "${spinner_pid:-}" ]]; then
    kill "$spinner_pid" 2>/dev/null || true
    wait "$spinner_pid" 2>/dev/null || true
    spinner_pid=""
  fi
}

spin_ok()   { _spin_stop; printf "\r  ${GREEN}✓${NC} %-70s\n" "$1"; }
spin_fail() { _spin_stop; printf "\r  ${RED}✗${NC} %-70s\n" "$1"; }
spin_warn() { _spin_stop; printf "\r  ${YELLOW}⚠${NC} %-70s\n" "$1"; }

# ── Section header ────────────────────────────────────────────────────────
section() {
  echo
  echo -e "  ${BOLD}${WHITE}── ${1} ──${NC}"
  echo
}

# ── Check command ─────────────────────────────────────────────────────────
has_cmd() { command -v "$1" &>/dev/null; }

pm2_bin() {
  if has_cmd pm2; then
    command -v pm2
  elif [[ -x "$INSTALL_DIR/node_modules/.bin/pm2" ]]; then
    echo "$INSTALL_DIR/node_modules/.bin/pm2"
  else
    return 1
  fi
}

run_pm2() {
  local bin
  bin=$(pm2_bin) || return 1
  "$bin" "$@"
}

as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif has_cmd sudo; then
    sudo "$@"
  else
    return 1
  fi
}

install_apt_packages() {
  as_root apt-get update -qq
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
}

install_yum_packages() {
  as_root yum install -y -q "$@"
}

install_dnf_packages() {
  as_root dnf install -y -q "$@"
}

install_brew_packages() {
  brew install "$@"
}

version_ge() {
  local version="$1" minimum="$2"
  local IFS=.
  local -a v=($version) m=($minimum)
  local i

  for i in 0 1 2; do
    local vi="${v[$i]:-0}"
    local mi="${m[$i]:-0}"
    if (( vi > mi )); then return 0; fi
    if (( vi < mi )); then return 1; fi
  done

  return 0
}

is_supported_node_version() {
  local version="$1"
  local major="${version%%.*}"

  case "$major" in
    20) version_ge "$version" "20.20.2" ;;
    22) version_ge "$version" "22.22.2" ;;
    24) return 0 ;;
    *) return 1 ;;
  esac
}

install_supported_node() {
  spin_warn "Installing supported Node.js runtime..."

  if has_cmd apt-get; then
    install_apt_packages ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | as_root bash -
    install_apt_packages nodejs
  elif has_cmd dnf; then
    as_root dnf module reset -y nodejs >/dev/null 2>&1 || true
    as_root dnf module enable -y nodejs:22 >/dev/null 2>&1 || true
    install_dnf_packages nodejs npm
  elif has_cmd yum; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | as_root bash -
    install_yum_packages nodejs
  elif has_cmd brew; then
    install_brew_packages node@22
    export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:${PATH}"
  else
    spin_fail "No supported package manager found for automatic Node.js installation"
    echo -e "  ${YELLOW}Install Node.js manually:${NC} ${NODE_SUPPORTED_RANGE}"
    exit 1
  fi
}

install_system_dependencies() {
  spin_start "Checking system dependencies..."

  if has_cmd apt-get; then
    spin_ok "APT detected"
    spin_start "Installing system dependencies..."
    install_apt_packages git curl ca-certificates gnupg openssl python3 make g++ build-essential
    spin_ok "System dependencies installed"
  elif has_cmd dnf; then
    spin_ok "DNF detected"
    spin_start "Installing system dependencies..."
    install_dnf_packages git curl ca-certificates openssl python3 make gcc-c++
    spin_ok "System dependencies installed"
  elif has_cmd yum; then
    spin_ok "YUM detected"
    spin_start "Installing system dependencies..."
    install_yum_packages git curl ca-certificates openssl python3 make gcc-c++
    spin_ok "System dependencies installed"
  elif has_cmd brew; then
    spin_ok "Homebrew detected"
    spin_start "Installing system dependencies..."
    install_brew_packages git openssl python make
    spin_ok "System dependencies installed"
  else
    spin_warn "No supported package manager detected; continuing with existing tools"
  fi
}

# ── Generate a secure random string ───────────────────────────────────────
rand_hex() { openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "CHANGE_ME_$(date +%s)"; }
rand_b64() { openssl rand -base64 48 2>/dev/null || python3 -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(48)).decode())" 2>/dev/null || echo "CHANGE_ME_$(date +%s)"; }

# ── Resolve a value from .env (handles KEY=VALUE, KEY = VALUE, and ~) ─────
env_val() {
  local key="$1" default="$2"
  local val
  val=$(awk -F= -v key="$key" '
    $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
      sub(/^[^=]*=/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      gsub(/^"|"$/, "")
      gsub(/^'"'"'|'"'"'$/, "")
      print
      exit
    }
  ' "$INSTALL_DIR/.env" 2>/dev/null || true)
  val="${val:-$default}"
  val="${val/#\~/$HOME}"
  echo "$val"
}

# ═══════════════════════════════════════════════════════════════════════════
# Steps
# ═══════════════════════════════════════════════════════════════════════════

check_node() {
  if ! has_cmd node; then
    install_supported_node
  fi

  local version
  version=$(node -v | sed 's/^v//' | cut -d- -f1)
  if ! is_supported_node_version "$version"; then
    spin_warn "Node.js v${version} found; installing supported runtime..."
    install_supported_node
    version=$(node -v | sed 's/^v//' | cut -d- -f1)
    if ! is_supported_node_version "$version"; then
      spin_fail "Node.js v${version} found, but supported range is ${NODE_SUPPORTED_RANGE}"
      exit 1
    fi
  fi

  spin_ok "Node.js $(node -v) detected"
}

check_npm() {
  if has_cmd npm; then
    spin_ok "npm $(npm -v) detected"
    return
  fi

  spin_warn "npm not found, installing..."
  if has_cmd apt-get; then
    install_apt_packages npm
  elif has_cmd dnf; then
    install_dnf_packages npm
  elif has_cmd yum; then
    install_yum_packages npm
  elif has_cmd brew; then
    install_brew_packages node@22
    export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:${PATH}"
  else
    spin_fail "Cannot install npm automatically — please install npm first"
    exit 1
  fi

  if ! has_cmd npm; then
    spin_fail "npm installation did not make npm available on PATH"
    exit 1
  fi

  spin_ok "npm $(npm -v) detected"
}

check_git() {
  if ! has_cmd git; then
    spin_warn "Git not found, installing..."
    if has_cmd apt-get; then
      install_apt_packages git
    elif has_cmd dnf; then
      install_dnf_packages git
    elif has_cmd yum; then
      install_yum_packages git
    elif has_cmd brew; then
      install_brew_packages git
    else
      spin_fail "Cannot install git automatically — please install git first"
      exit 1
    fi
  fi
  spin_ok "Git $(git --version | cut -d' ' -f3) detected"
}

check_existing() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    spin_warn "OzRouter is already installed at ${INSTALL_DIR}"
    echo
    echo -e "  ${DIM}This installer is for first-time setup only.${NC}"
    echo -e "  ${DIM}To update an existing installation, use Air Update from the dashboard${NC}"
    echo -e "  ${DIM}or run: cd ${INSTALL_DIR} && git pull && npm install && npm run build${NC}"
    echo -e "  ${DIM}To reinstall from scratch, delete ${INSTALL_DIR} first.${NC}"
    echo
    exit 0
  fi

  if [[ -e "$INSTALL_DIR" ]] && [[ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    spin_fail "Install directory exists and is not empty: ${INSTALL_DIR}"
    echo -e "  ${DIM}Choose another path with OZROUTER_INSTALL_DIR or empty the directory first.${NC}"
    exit 1
  fi
}

clone_repo() {
  spin_start "Cloning OzRouter to ${INSTALL_DIR}..."
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if git clone "$REPO_URL" "$INSTALL_DIR" 2>&1 | tail -1; then
    spin_ok "Repository cloned"
  else
    spin_fail "Failed to clone repository"
    exit 1
  fi
}

install_deps() {
  spin_start "Installing npm dependencies..."
  cd "$INSTALL_DIR"
  if npm install --legacy-peer-deps 2>&1 | tail -3; then
    spin_ok "Dependencies installed"
  else
    spin_fail "Failed to install dependencies"
    exit 1
  fi
}

setup_env() {
  cd "$INSTALL_DIR"

  if [[ -f .env ]]; then
    spin_ok ".env already exists — using existing configuration"
    return
  fi

  spin_start "Creating .env with secure defaults..."
  local jwt_secret api_secret enc_key pass

  jwt_secret=$(rand_b64)
  api_secret=$(rand_hex)
  enc_key=$(rand_hex)
  pass="admin-$(rand_hex | cut -c1-12)"

  cat > .env <<EOF
# OzRouter
PORT=20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
HOST=0.0.0.0

# Data
DATA_DIR=\$HOME/.ozrouter

# Secrets (auto-generated — change if desired)
INITIAL_PASSWORD=${pass}
JWT_SECRET=${jwt_secret}
API_KEY_SECRET=${api_secret}
STORAGE_ENCRYPTION_KEY=${enc_key}

# Optional
# REQUIRE_API_KEY=false
# APP_LOG_TO_FILE=true
# APP_LOG_FILE_PATH=./logs/application/app.log
EOF

  spin_ok ".env created with random secrets"
  echo -e "  ${YELLOW}⚠${NC}  Dashboard password: ${BOLD}${pass}${NC}"
  echo -e "  ${DIM}   Edit ${INSTALL_DIR}/.env to change it.${NC}"
}

setup_data_dir() {
  cd "$INSTALL_DIR"
  local data_dir
  data_dir=$(env_val "DATA_DIR" "$HOME/.ozrouter")
  mkdir -p "$data_dir/logs" "$data_dir/db_backups"
  spin_ok "Data directory: ${data_dir}"
}

install_pm2() {
  if pm2_bin >/dev/null 2>&1; then
    spin_ok "PM2 $(run_pm2 -v) available"
    return 0
  fi

  spin_start "Installing PM2 globally..."
  if npm install -g pm2@6.0.14 2>&1 | tail -1; then
    spin_ok "PM2 installed"
    return 0
  elif as_root npm install -g pm2@6.0.14 2>&1 | tail -1; then
    spin_ok "PM2 installed"
    return 0
  else
    spin_fail "Failed to install PM2"
    echo -e "  ${YELLOW}⚠${NC}  Auto-restart and Air Update won't work without PM2"
    echo -e "  ${DIM}   Install manually: npm install -g pm2${NC}"
    return 1
  fi
}

build_app() {
  spin_start "Building OzRouter (this may take a minute)..."
  cd "$INSTALL_DIR"
  if npm run build; then
    spin_ok "Build complete"
  else
    spin_fail "Build failed — check the output above for details"
    exit 1
  fi
}

start_pm2() {
  if ! pm2_bin >/dev/null 2>&1; then
    spin_warn "PM2 not available — skipping process registration"
    echo -e "  ${YELLOW}⚠${NC}  Start manually: cd ${INSTALL_DIR} && npm run start"
    return
  fi

  spin_start "Starting OzRouter via PM2..."

  # Stop existing instance if any
  run_pm2 delete "$PM2_APP_NAME" 2>/dev/null || true

  cd "$INSTALL_DIR"
  run_pm2 start npm --name "$PM2_APP_NAME" -- run start

  spin_ok "OzRouter started via PM2"

  spin_start "Configuring PM2 auto-start on boot..."
  run_pm2 save --silent 2>/dev/null || true
  if run_pm2 startup >/dev/null 2>&1; then
    spin_ok "PM2 will auto-start on system boot"
  else
    spin_warn "PM2 started, but boot auto-start could not be configured automatically"
    echo -e "  ${DIM}Run 'pm2 startup' manually if you want OzRouter to start on boot.${NC}"
  fi
}

show_summary() {
  local port
  port=$(env_val "PORT" "20128")
  echo
  echo -e "  ${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "  ${GREEN}║${NC}  ${BOLD}${WHITE}✨ Installation Complete!${NC}                               ${GREEN}║${NC}"
  echo -e "  ${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
  echo -e "  ${GREEN}║${NC}                                                        ${GREEN}║${NC}"
  echo -e "  ${GREEN}║${NC}  ${DIM}Dashboard:${NC}  http://localhost:${port}                       ${GREEN}║${NC}"
  echo -e "  ${GREEN}║${NC}  ${DIM}API:${NC}        http://localhost:${port}/v1                   ${GREEN}║${NC}"
  echo -e "  ${GREEN}║${NC}  ${DIM}Install:${NC}    ${INSTALL_DIR}${NC}"
  if pm2_bin >/dev/null 2>&1; then
    echo -e "  ${GREEN}║${NC}                                                        ${GREEN}║${NC}"
    echo -e "  ${GREEN}║${NC}  ${DIM}Status:${NC}     npm run pm2:status                    ${GREEN}║${NC}"
    echo -e "  ${GREEN}║${NC}  ${DIM}Logs:${NC}       npm run pm2:logs                      ${GREEN}║${NC}"
    echo -e "  ${GREEN}║${NC}  ${DIM}Restart:${NC}    npm run pm2:restart                   ${GREEN}║${NC}"
    echo -e "  ${GREEN}║${NC}  ${DIM}Stop:${NC}       npm run pm2:stop                      ${GREEN}║${NC}"
  else
    echo -e "  ${GREEN}║${NC}  ${DIM}Start:${NC}      cd ${INSTALL_DIR} && npm run start          ${GREEN}║${NC}"
    echo -e "  ${GREEN}║${NC}                                                        ${GREEN}║${NC}"
    echo -e "  ${GREEN}║${NC}  ${YELLOW}⚠ PM2 not installed — auto-restart not available${NC}      ${GREEN}║${NC}"
  fi
  echo -e "  ${GREEN}║${NC}                                                        ${GREEN}║${NC}"
  echo -e "  ${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo
}

# ── Cleanup ───────────────────────────────────────────────────────────────
cleanup() {
  _spin_stop
  echo -e "\n  ${YELLOW}⚠ Installation interrupted${NC}"
  exit 1
}
trap cleanup SIGINT SIGTERM

# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════
main() {
  banner

  section "Pre-flight Checks"
  install_system_dependencies
  check_node
  check_npm
  check_git
  check_existing

  section "Repository"
  clone_repo

  section "Environment"
  setup_env
  setup_data_dir

  section "Dependencies"
  install_deps

  section "Process Manager"
  install_pm2

  section "Build"
  build_app

  section "Start"
  start_pm2

  show_summary
}

main "$@"
