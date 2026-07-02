#!/usr/bin/env bash
# agent-kernel/install.sh — Install the vendored agent-kernel CLI.
#
# Usage:
#   ./install.sh                    # Auto-detect: install if missing
#   ./install.sh --force            # Re-link even if already installed
#   ./install.sh --verify           # Check what's installed
#   ./install.sh --uninstall        # Remove what we added
#
# Idempotent: safe to re-run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CLIMJS="$ROOT/dist/cli.mjs"

# ---- colors ----
RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YEL=$'\033[0;33m'
BLU=$'\033[0;34m'
RST=$'\033[0m'

log()  { printf '%s[ak-install]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[   ok   ]%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s[  warn  ]%s %s\n' "$YEL" "$RST" "$*"; }
err()  { printf '%s[  fail  ]%s %s\n' "$RED" "$RST" "$*" >&2; }

[ -f "$CLIMJS" ] || { err "dist/cli.mjs missing — repository corrupt"; exit 2; }

VERSION=$(node -e "process.stdout.write('0.0.5')" 2>/dev/null || node "$CLIMJS" --version 2>/dev/null || echo "0.0.5")
log "agent-kernel v$VERSION (vendored at $ROOT)"

# ---- detect global ----
GLOBAL_AK="$(command -v agent-kernel || true)"
GLOBAL_BINDIR=""

# ---- link bin ----
link_bin() {
    local src="$1"
    for bindir in "$HOME/.local/bin" "$HOME/bin"; do
        if [ -d "$bindir" ] || mkdir -p "$bindir" 2>/dev/null; then
            if [ -e "$bindir/agent-kernel" ] && [ "$FORCE" != 1 ]; then
                warn "exists: $bindir/agent-kernel (use --force to overwrite)"
                GLOBAL_BINDIR="$bindir"
                return 0
            fi
            ln -sf "$src" "$bindir/agent-kernel"
            ln -sf "$src" "$bindir/ak" 2>/dev/null || true
            chmod +x "$src" 2>/dev/null || true
            ok "linked: $bindir/agent-kernel -> $src"
            ok "linked: $bindir/ak -> $src"
            GLOBAL_BINDIR="$bindir"
            return 0
        fi
    done
    warn "no ~/bin or ~/.local/bin — skipping PATH install"
    warn "to enable manually: alias agent-kernel='node $CLIMJS'"
    return 1
}

# ---- run CLI through vendored copy ----
run_cli() {
    (cd "$ROOT" && node "$CLIMJS" "$@")
}

# ---- enforce install (Claude hooks etc.) ----
enforce_install() {
    log "Installing Claude + git hooks via vendored CLI..."
    if run_cli enforce install >/dev/null 2>&1; then
        ok "Claude hooks installed at ~/.claude/hooks/"
    else
        warn "enforce install skipped (Claude hooks dir missing or denied)"
    fi
}

# ---- verify ----
verify() {
    log "Verifying agent-kernel install state..."
    echo
    printf '%-40s ' "vendored cli.mjs:"
    [ -f "$CLIMJS" ] && echo "yes ($CLIMJS)" || echo "no"
    printf '%-40s ' "global agent-kernel on PATH:"
    if command -v agent-kernel >/dev/null 2>&1; then
        echo "yes ($(command -v agent-kernel))"
    else
        echo "no (run: ./install.sh)"
    fi
    printf '%-40s ' "global ak on PATH:"
    if command -v ak >/dev/null 2>&1; then
        echo "yes ($(command -v ak))"
    else
        echo "no"
    fi
    printf '%-40s ' "~/.agent-kernel/ home:"
    if [ -d "$HOME/.agent-kernel" ]; then
        echo "yes (use 'agent-kernel doctor' to check)"
    else
        echo "no (run: agent-kernel init --sync)"
    fi
    printf '%-40s ' "Claude hook installed:"
    if [ -e "$HOME/.claude/hooks/agent-kernel/pre-tool.sh" ] || \
       [ -e "$HOME/.claude/hooks/agent-kernel/post-tool.sh" ] || \
       [ -e "$HOME/.claude/hooks/session-end" ]; then
        echo "yes"
    else
        echo "no (run: agent-kernel enforce install)"
    fi
    echo
}

# ---- uninstall ----
uninstall() {
    log "Uninstalling (idempotent — only removes what we added)..."
    for bindir in "$HOME/.local/bin" "$HOME/bin"; do
        for cmd in agent-kernel ak; do
            target="$bindir/$cmd"
            if [ -L "$target" ] && readlink "$target" | grep -q "delegate-team.*agent-kernel"; then
                rm -f "$target"
                ok "removed: $target"
            fi
        done
    done
    warn "did not remove ~/.agent-kernel/ (your memories) — run 'agent-kernel doctor' to inspect"
    warn "did not remove ~/.claude/hooks/agent-kernel/ (re-run 'agent-kernel enforce install' to fix)"
}

# ---- main ----

FORCE=0
DO_VERIFY=0
DO_UNINSTALL=0

while [ $# -gt 0 ]; do
    case "$1" in
        --force)      FORCE=1 ;;
        --verify)     DO_VERIFY=1 ;;
        --uninstall)  DO_UNINSTALL=1 ;;
        -h|--help)
            sed -n '2,/^set -e/p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *) err "unknown flag: $1"; exit 64 ;;
    esac
    shift
done

if [ "$DO_UNINSTALL" = 1 ]; then uninstall; exit $?; fi
if [ "$DO_VERIFY"   = 1 ]; then verify;   exit $?; fi

# Already on PATH globally?
if command -v agent-kernel >/dev/null 2>&1 && [ "$FORCE" != 1 ]; then
    ok "agent-kernel already on PATH ($(command -v agent-kernel)) — skipping link"
    GLOBAL_AK="$(command -v agent-kernel)"
else
    link_bin "$CLIMJS" || true
fi

# Try first run via wrapper
if command -v agent-kernel >/dev/null 2>&1; then
    if agent-kernel --version >/dev/null 2>&1; then
        ok "agent-kernel --version works"
    else
        warn "agent-kernel on PATH but not executable"
    fi
else
    warn "agent-kernel not on PATH — use 'node $CLIMJS' or alias"
fi

# First-time init prompt
if [ ! -d "$HOME/.agent-kernel" ]; then
    echo
    log "~/.agent-kernel/ doesn't exist yet — recommended first run:"
    echo "    agent-kernel init --sync --enforce"
    echo "    agent-kernel doctor"
    echo
    log "auto-running init --sync (no enforce)..."
    run_cli init --sync 2>&1 | tail -10 || warn "init --sync failed (non-fatal)"
fi

echo
verify
echo
ok "agent-kernel install done."
ok "Try: agent-kernel remember \"<your rule>\" --type rule --publish"