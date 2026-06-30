#!/usr/bin/env bash
# install.sh — Bootstrap the delegate-team supersystem on a fresh machine.
#
# Usage:
#   ./install.sh                    # Detect what's installed, install missing
#   ./install.sh --all              # Install everything
#   ./install.sh --orchestrator     # /mavis-ship skill
#   ./install.sh --scaffolder       # mavis-skill-scaffold CLI
#   ./install.sh --mmas             # Multi-agent team framework
#   ./install.sh --kernel           # agent-kernel (memory + governance layer)
#   ./install.sh --integrations     # superpowers + Waza + unslop + autoresearch
#   ./install.sh --dt               # Build the dt CLI
#   ./install.sh --verify           # Verify what's installed without changes
#   ./install.sh --uninstall        # Remove everything install.sh added
#
# Idempotent: re-running won't break anything.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERBOSE=0

# ---- colors ----
RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YEL=$'\033[0;33m'
BLU=$'\033[0;34m'
RST=$'\033[0m'

log()  { printf '%s[install]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[  ok  ]%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s[ warn ]%s %s\n' "$YEL" "$RST" "$*"; }
err()  { printf '%s[ fail ]%s %s\n' "$RED" "$RST" "$*" >&2; }

# ---- helpers ----
ensure_dir() {
    [ -d "$1" ] || mkdir -p "$1"
}

link_if_missing() {
    local src="$1" dst="$2"
    if [ -e "$dst" ] || [ -L "$dst" ]; then
        warn "$(printf 'exists: %s' "$dst")"
        return 0
    fi
    ln -sf "$src" "$dst"
    ok "$(printf 'linked: %s → %s' "$dst" "$src")"
}

# ---- components ----

install_dt() {
    log "Building dt CLI (TypeScript)..."
    if ! command -v node >/dev/null 2>&1; then
        err "Node.js required"; return 1
    fi
    if ! command -v npm >/dev/null 2>&1; then
        err "npm required"; return 1
    fi
    (cd "$ROOT" && npm install && npm run build)
    ok "dt CLI built. Source: $ROOT/src/. Bin: $ROOT/dist/cli.js"
}

install_orchestrator() {
    log "Installing orchestrator/ → ~/.mavis/skills/mavis-ship + symlinks..."
    ensure_dir "$HOME/.mavis/skills/mavis-ship/scripts"
    cp "$ROOT/orchestrator/SKILL.md" "$HOME/.mavis/skills/mavis-ship/"
    cp "$ROOT/orchestrator/scripts/orchestrate.sh" "$HOME/.mavis/skills/mavis-ship/scripts/"
    chmod +x "$HOME/.mavis/skills/mavis-ship/scripts/orchestrate.sh"

    # Symlink for global discovery
    link_if_missing "$HOME/.mavis/skills/mavis-ship" "$HOME/.claude/skills/mavis-ship"

    # Slash command (Claude Code-native entry point)
    ensure_dir "$HOME/.claude/commands"
    link_if_missing "$HOME/.mavis/skills/mavis-ship/SKILL.md" "$HOME/.claude/commands/mavis-ship.md"

    # CLI on PATH
    for bindir in "$HOME/.local/bin" "$HOME/bin"; do
        if [ -d "$bindir" ] || mkdir -p "$bindir" 2>/dev/null; then
            link_if_missing "$HOME/.mavis/skills/mavis-ship/scripts/orchestrate.sh" "$bindir/mavis-orchestrate"
            chmod +x "$bindir/mavis-orchestrate" 2>/dev/null || true
        fi
    done

    ok "orchestrator installed. Run /mavis-ship \"<task>\" or mavis-orchestrate \"<task>\""
}

install_scaffolder() {
    log "Installing scaffolder/ → ~/.mavis/skills/skill-scaffold + bin..."
    ensure_dir "$HOME/.mavis/skills/skill-scaffold"
    cp "$ROOT/scaffolder/SKILL.md" "$HOME/.mavis/skills/skill-scaffold/"

    ensure_dir "$HOME/.mavis/bin"
    cp "$ROOT/scaffolder/bin/mavis-skill-scaffold" "$HOME/.mavis/bin/"
    chmod +x "$HOME/.mavis/bin/mavis-skill-scaffold"

    ok "scaffolder installed. Run: mavis-skill-scaffold --name <name>"
}

install_mmas() {
    log "Installing mmas/ → ~/.mavis/agents/mavis/multi-agent/..."
    local dst="$HOME/.mavis/agents/mavis/multi-agent"
    ensure_dir "$dst/agents" "$dst/examples"

    cp "$ROOT/mmas/SKILL.md" "$dst/" 2>/dev/null || true
    cp "$ROOT/mmas/README.md" "$dst/" 2>/dev/null || true
    cp "$ROOT/mmas/spawn-team.py" "$dst/"
    cp "$ROOT/mmas/watchdog.sh" "$dst/"
    cp "$ROOT/mmas/hash-edit.py" "$dst/"
    cp "$ROOT/mmas/agents/"*.yaml "$dst/agents/" 2>/dev/null || true
    cp "$ROOT/mmas/examples/"*.json "$dst/examples/" 2>/dev/null || true

    chmod +x "$dst/spawn-team.py" "$dst/watchdog.sh" "$dst/hash-edit.py"

    ok "MMAS installed. Run: python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py --atlas"
}

install_kernel() {
    log "Installing agent-kernel/ → ~/.agent-kernel/ (memory + governance)..."
    if [ -x "$ROOT/agent-kernel/install.sh" ]; then
        bash "$ROOT/agent-kernel/install.sh"
    else
        warn "agent-kernel/install.sh missing — skipping"
        return 1
    fi
}

install_integrations() {
    log "Installing companion frameworks..."

    # Waza (one-liner, official installer)
    if command -v npx >/dev/null 2>&1; then
        log "  → Waza (npx skills add)"
        npx -y skills add tw93/Waza -a claude-code -g -y 2>&1 | tail -3 || warn "Waza install failed (non-fatal)"
    else
        warn "  npx not available; skip Waza"
    fi

    # unslop-preflight (npm global)
    if command -v npm >/dev/null 2>&1; then
        log "  → unslop-preflight (npm install -g)"
        if ! command -v unslop >/dev/null 2>&1; then
            git clone --depth 1 https://github.com/imMamdouhaboammar/unslop-preflight /tmp/unslop-preflight 2>/dev/null || true
            if [ -d /tmp/unslop-preflight ]; then
                (cd /tmp/unslop-preflight && npm install -g . 2>&1 | tail -2) || warn "unslop install failed (non-fatal)"
                ensure_dir "$HOME/.claude/skills/unslop"
                cp /tmp/unslop-preflight/SKILL.md "$HOME/.claude/skills/unslop/" 2>/dev/null || true
            fi
        else
            ok "  unslop already on PATH"
        fi
    fi

    # superpowers + autoresearch are documented in integrations/{superpowers,waza,...}.md
    warn "  superpowers + autoresearch need manual install (see integrations/{superpowers,autoresearch}.md)"

    ok "integrations done. Run: unslop doctor (then read integrations/*.md)"
}

verify() {
    log "Verifying install state..."
    echo
    printf '%-40s ' "dt CLI on PATH:"
    command -v dt >/dev/null && echo "yes" || echo "no (run: ./install.sh --dt)"
    printf '%-40s ' "/mavis-ship skill:"
    [ -e "$HOME/.mavis/skills/mavis-ship/SKILL.md" ] && echo "installed" || echo "missing"
    printf '%-40s ' "/mavis-ship slash command:"
    [ -L "$HOME/.claude/commands/mavis-ship.md" ] && echo "installed" || echo "missing"
    printf '%-40s ' "mavis-orchestrate CLI:"
    command -v mavis-orchestrate >/dev/null && echo "yes" || echo "no"
    printf '%-40s ' "mavis-skill-scaffold CLI:"
    command -v mavis-skill-scaffold >/dev/null && echo "yes" || echo "no"
    printf '%-40s ' "MMAS framework:"
    [ -e "$HOME/.mavis/agents/mavis/multi-agent/spawn-team.py" ] && echo "installed" || echo "missing"
    printf '%-40s ' "agent-kernel CLI:"
    command -v agent-kernel >/dev/null && echo "yes ($(command -v agent-kernel))" || echo "no (run: ./install.sh --kernel)"
    printf '%-40s ' "agent-kernel memory home:"
    [ -d "$HOME/.agent-kernel" ] && echo "yes" || echo "no (run: agent-kernel init --sync)"
    printf '%-40s ' "Waza skills:"
    [ -d "$HOME/.claude/skills/think" ] && echo "installed" || echo "missing"
    printf '%-40s ' "unslop CLI:"
    command -v unslop >/dev/null && echo "yes" || echo "no"
    printf '%-40s ' "superpowers hook:"
    [ -e "$HOME/.claude/hooks/superpowers/run-hook.cmd" ] && echo "installed" || echo "missing"
    printf '%-40s ' "autoresearch commands:"
    ls "$HOME/.claude/commands/autoresearch"*.md >/dev/null 2>&1 && echo "installed" || echo "missing"
    echo
}

uninstall() {
    log "Uninstalling (idempotent — only removes what we added)..."
    mavis-trash "$HOME/.mavis/skills/mavis-ship" 2>/dev/null || true
    mavis-trash "$HOME/.claude/skills/mavis-ship" 2>/dev/null || true
    mavis-trash "$HOME/.claude/commands/mavis-ship.md" 2>/dev/null || true
    mavis-trash "$HOME/.claude/commands/mavis-team.md" 2>/dev/null || true
    mavis-trash "$HOME/.mavis/skills/skill-scaffold" 2>/dev/null || true
    mavis-trash "$HOME/.mavis/bin/mavis-skill-scaffold" 2>/dev/null || true
    mavis-trash "$HOME/.mavis/agents/mavis/multi-agent" 2>/dev/null || true
    # agent-kernel: only remove the symlinks we created in ~/.local/bin / ~/bin
    for bindir in "$HOME/.local/bin" "$HOME/bin"; do
        for cmd in agent-kernel ak; do
            target="$bindir/$cmd"
            if [ -L "$target" ] && readlink "$target" | grep -q "delegate-team.*agent-kernel"; then
                rm -f "$target"
            fi
        done
    done
    ok "Uninstall complete. Note: companion frameworks (Waza/unslop/superpowers/autoresearch/agent-kernel) installed via their own installers — uninstall them separately. Your ~/.agent-kernel/ memories are kept (run agent-kernel doctor to inspect)."
}

# ---- main ----

main() {
    local do_dt=0 do_orch=0 do_scaff=0 do_mmas=0 do_kernel=0 do_intg=0 do_verify=0 do_uninst=0

    if [ $# -eq 0 ]; then
        # Auto-detect
        do_dt=1; do_orch=1; do_scaff=1; do_mmas=1; do_kernel=1; do_intg=1
    fi

    while [ $# -gt 0 ]; do
        case "$1" in
            --all)         do_dt=1; do_orch=1; do_scaff=1; do_mmas=1; do_kernel=1; do_intg=1 ;;
            --dt)          do_dt=1 ;;
            --orchestrator) do_orch=1 ;;
            --scaffolder)  do_scaff=1 ;;
            --mmas)        do_mmas=1 ;;
            --kernel)      do_kernel=1 ;;
            --integrations) do_intg=1 ;;
            --verify)      do_verify=1 ;;
            --uninstall)   do_uninst=1 ;;
            --verbose|-v)  VERBOSE=1 ;;
            -h|--help)
                sed -n '2,/^set -e/p' "$0" | sed 's/^# \?//'
                exit 0
                ;;
            *) err "unknown flag: $1"; exit 64 ;;
        esac
        shift
    done

    if [ "$do_uninst" = 1 ]; then uninstall; exit $?; fi
    if [ "$do_verify" = 1 ]; then verify; exit $?; fi

    [ "$do_dt"     = 1 ] && install_dt
    [ "$do_orch"   = 1 ] && install_orchestrator
    [ "$do_scaff"  = 1 ] && install_scaffolder
    [ "$do_mmas"   = 1 ] && install_mmas
    [ "$do_kernel" = 1 ] && install_kernel
    [ "$do_intg"   = 1 ] && install_integrations

    echo
    verify
    echo
    ok "Install done. Try: /mavis-ship \"<your task>\" or agent-kernel remember \"<rule>\" --publish"
}

main "$@"
