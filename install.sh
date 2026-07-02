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
# Safety modes (added in v2.6.0):
#   ./install.sh --all --dry-run              # Show what would happen, no writes
#   ./install.sh --all --no-network           # Skip npx/git/npm network calls
#   ./install.sh --all --trust-mode strict    # Conservative; print every sensitive op
#   ./install.sh --all --trust-mode normal    # Default; current safe behavior
#   ./install.sh --all --trust-mode dev       # Permissive; prints warnings
#   ./install.sh --all --yes                  # Non-interactive approval (for CI)
#
# Idempotent: re-running won't break anything.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERBOSE=0

# ---- safety modes (defaults) ----
DRY_RUN=0
NO_NETWORK=0
TRUST_MODE="normal"   # strict | normal | dev
ASSUME_YES=0

# ---- colors ----
RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YEL=$'\033[0;33m'
BLU=$'\033[0;34m'
DIM=$'\033[2m'
RST=$'\033[0m'

log()    { printf '%s[install]%s %s\n' "$BLU" "$RST" "$*"; }
ok()     { printf '%s[  ok  ]%s %s\n' "$GRN" "$RST" "$*"; }
warn()   { printf '%s[ warn ]%s %s\n' "$YEL" "$RST" "$*"; }
err()    { printf '%s[ fail ]%s %s\n' "$RED" "$RST" "$*" >&2; }
drylog() { printf '%s[dry-run]%s %s\n' "$YEL" "$RST" "$*"; }
netlog() { printf '%s[network]%s %s\n' "$BLU" "$RST" "$*"; }

# ---- safety wrappers ----

# run_cmd <desc> <cmd...>
# - In --dry-run: prints desc + cmd instead of executing.
# - Otherwise: executes cmd.
run_cmd() {
    local desc="$1"
    shift
    if [ "$DRY_RUN" = 1 ]; then
        drylog "$desc  →  $*"
        return 0
    fi
    [ "$VERBOSE" = 1 ] && log "$desc  →  $*"
    "$@"
}

# network_allowed <desc>
# - In --no-network: refuses and prints warning.
# - Otherwise: returns 0 (the caller is responsible for actually issuing the call).
network_allowed() {
    local desc="$1"
    if [ "$NO_NETWORK" = 1 ]; then
        warn "[no-network] blocked: $desc"
        return 1
    fi
    if [ "$TRUST_MODE" = "strict" ]; then
        warn "[trust=strict] network call: $desc — proceeding (strict still permits the call but warns)"
    fi
    netlog "$desc"
    return 0
}

# user-level hooks gate (strict mode blocks these)
write_user_hook_allowed() {
    local desc="$1"
    if [ "$TRUST_MODE" = "strict" ]; then
        warn "[trust=strict] USER-LEVEL HOOK WRITE: $desc"
        if [ "$ASSUME_YES" != 1 ]; then
            warn "  → re-run with --yes to proceed without interactive prompts, or switch --trust-mode."
            return 1
        fi
    fi
    return 0
}

# mcp autoload gate (strict mode refuses to enable auto-load)
mcp_autoload_allowed() {
    if [ "$TRUST_MODE" = "strict" ]; then
        warn "[trust=strict] refusing to enable DT_ENABLE_MCP / MCP auto-load"
        return 1
    fi
    return 0
}

# ---- helpers ----

ensure_dir() {
    if [ "$DRY_RUN" = 1 ]; then
        drylog "mkdir -p $*"
        return 0
    fi
    [ -d "$1" ] || mkdir -p "$1"
}

link_if_missing() {
    local src="$1" dst="$2"
    if [ "$DRY_RUN" = 1 ]; then
        if [ -e "$dst" ] || [ -L "$dst" ]; then
            drylog "exists (skip): $dst"
        else
            drylog "ln -sf $dst → $src"
        fi
        return 0
    fi
    if [ -e "$dst" ] || [ -L "$dst" ]; then
        warn "$(printf 'exists: %s' "$dst")"
        return 0
    fi
    ln -sf "$src" "$dst"
    ok "$(printf 'linked: %s → %s' "$dst" "$src")"
}

# copy_if_changed <src> <dst>
# - In dry-run: prints intent.
# - Otherwise: copies only if dst is missing or differs (uses cmp -s).
copy_if_changed() {
    local src="$1" dst="$2"
    if [ "$DRY_RUN" = 1 ]; then
        drylog "cp $src → $dst (only if changed)"
        return 0
    fi
    if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
        return 0
    fi
    cp "$src" "$dst"
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
    # npm install + build are local + non-destructive of user state.
    # They are not "network" in the --no-network sense (they hit the local
    # node_modules + npm cache). However, npm install fetches packages;
    # we honor --no-network for the npm step as well.
    if [ "$NO_NETWORK" = 1 ]; then
        warn "[no-network] skipping 'npm install' — assuming node_modules already present"
    else
        run_cmd "npm install (local deps)" bash -c "cd '$ROOT' && npm install"
    fi
    run_cmd "npm run build" bash -c "cd '$ROOT' && npm run build"
    [ "$DRY_RUN" = 1 ] || ok "dt CLI built. Source: $ROOT/src/. Bin: $ROOT/dist/cli.js"
}

install_orchestrator() {
    log "Installing orchestrator/ → ~/.mavis/skills/mavis-ship + symlinks..."
    ensure_dir "$HOME/.mavis/skills/mavis-ship/scripts"
    copy_if_changed "$ROOT/orchestrator/SKILL.md" "$HOME/.mavis/skills/mavis-ship/SKILL.md"
    copy_if_changed "$ROOT/orchestrator/scripts/orchestrate.sh" "$HOME/.mavis/skills/mavis-ship/scripts/orchestrate.sh"
    run_cmd "chmod +x orchestrate.sh" chmod +x "$HOME/.mavis/skills/mavis-ship/scripts/orchestrate.sh"

    # Symlink for global discovery
    link_if_missing "$HOME/.mavis/skills/mavis-ship" "$HOME/.claude/skills/mavis-ship"

    # Slash command (Claude Code-native entry point)
    ensure_dir "$HOME/.claude/commands"
    link_if_missing "$HOME/.mavis/skills/mavis-ship/SKILL.md" "$HOME/.claude/commands/mavis-ship.md"

    # CLI on PATH
    for bindir in "$HOME/.local/bin" "$HOME/bin"; do
        if [ "$DRY_RUN" = 1 ]; then
            drylog "ensure $bindir exists"
            drylog "ln -sf $bindir/mavis-orchestrate"
            continue
        fi
        if [ -d "$bindir" ] || mkdir -p "$bindir" 2>/dev/null; then
            link_if_missing "$HOME/.mavis/skills/mavis-ship/scripts/orchestrate.sh" "$bindir/mavis-orchestrate"
            chmod +x "$bindir/mavis-orchestrate" 2>/dev/null || true
        fi
    done

    [ "$DRY_RUN" = 1 ] || ok "orchestrator installed. Run /mavis-ship \"<task>\" or mavis-orchestrate \"<task>\""
}

install_scaffolder() {
    log "Installing scaffolder/ → ~/.mavis/skills/skill-scaffold + bin..."
    ensure_dir "$HOME/.mavis/skills/skill-scaffold"
    copy_if_changed "$ROOT/scaffolder/SKILL.md" "$HOME/.mavis/skills/skill-scaffold/SKILL.md"

    ensure_dir "$HOME/.mavis/bin"
    copy_if_changed "$ROOT/scaffolder/bin/mavis-skill-scaffold" "$HOME/.mavis/bin/mavis-skill-scaffold"
    run_cmd "chmod +x mavis-skill-scaffold" chmod +x "$HOME/.mavis/bin/mavis-skill-scaffold"

    [ "$DRY_RUN" = 1 ] || ok "scaffolder installed. Run: mavis-skill-scaffold --name <name>"
}

install_mmas() {
    log "Installing mmas/ → ~/.mavis/agents/mavis/multi-agent/..."
    local dst="$HOME/.mavis/agents/mavis/multi-agent"
    ensure_dir "$dst/agents" "$dst/examples"

    copy_if_changed "$ROOT/mmas/SKILL.md" "$dst/SKILL.md"
    copy_if_changed "$ROOT/mmas/README.md" "$dst/README.md"
    copy_if_changed "$ROOT/mmas/spawn-team.py" "$dst/spawn-team.py"
    copy_if_changed "$ROOT/mmas/watchdog.sh" "$dst/watchdog.sh"
    copy_if_changed "$ROOT/mmas/hash-edit.py" "$dst/hash-edit.py"

    if [ "$DRY_RUN" = 1 ]; then
        drylog "cp $ROOT/mmas/agents/*.yaml → $dst/agents/"
        drylog "cp $ROOT/mmas/examples/*.json → $dst/examples/"
    else
        cp "$ROOT/mmas/agents/"*.yaml "$dst/agents/" 2>/dev/null || true
        cp "$ROOT/mmas/examples/"*.json "$dst/examples/" 2>/dev/null || true
    fi

    run_cmd "chmod +x mmas scripts" chmod +x "$dst/spawn-team.py" "$dst/watchdog.sh" "$dst/hash-edit.py"

    [ "$DRY_RUN" = 1 ] || ok "MMAS installed. Run: python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py --atlas"
}

install_kernel() {
    log "Installing agent-kernel/ → ~/.agent-kernel/ (memory + governance)..."
    if [ -x "$ROOT/agent-kernel/install.sh" ]; then
        # strict mode: warn before delegating to the kernel installer.
        if [ "$TRUST_MODE" = "strict" ]; then
            warn "[trust=strict] delegating to agent-kernel/install.sh — it may create hooks under ~/.claude/. Re-run with --yes to confirm."
            if [ "$ASSUME_YES" != 1 ]; then
                warn "  → skipping kernel install under strict mode without --yes"
                return 0
            fi
        fi
        if [ "$DRY_RUN" = 1 ]; then
            drylog "would run: bash $ROOT/agent-kernel/install.sh (and any nested installer behavior)"
            return 0
        fi
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
        if network_allowed "npx skills add tw93/Waza"; then
            run_cmd "Waza skills install" npx -y skills add tw93/Waza -a claude-code -g -y 2>&1 | tail -3 || warn "Waza install failed (non-fatal)"
        fi
    else
        warn "  npx not available; skip Waza"
    fi

    # unslop-preflight (npm global)
    if command -v npm >/dev/null 2>&1; then
        if [ "$NO_NETWORK" = 1 ]; then
            warn "[no-network] skipping unslop-preflight (npm global)"
        elif ! command -v unslop >/dev/null 2>&1; then
            if network_allowed "git clone unslop-preflight to /tmp"; then
                run_cmd "git clone unslop-preflight" git clone --depth 1 https://github.com/imMamdouhaboammar/unslop-preflight /tmp/unslop-preflight 2>/dev/null || true
            fi
            if [ -d /tmp/unslop-preflight ] && [ "$DRY_RUN" != 1 ]; then
                if network_allowed "npm install -g unslop-preflight"; then
                    run_cmd "npm install -g unslop" bash -c "cd /tmp/unslop-preflight && npm install -g . 2>&1 | tail -2" || warn "unslop install failed (non-fatal)"
                fi
                ensure_dir "$HOME/.claude/skills/unslop"
                copy_if_changed "/tmp/unslop-preflight/SKILL.md" "$HOME/.claude/skills/unslop/SKILL.md"
            elif [ -d /tmp/unslop-preflight ] && [ "$DRY_RUN" = 1 ]; then
                drylog "would copy /tmp/unslop-preflight/SKILL.md → $HOME/.claude/skills/unslop/"
            fi
        else
            ok "  unslop already on PATH"
        fi
    fi

    # superpowers + autoresearch are documented in integrations/{superpowers,waza,...}.md
    warn "  superpowers + autoresearch need manual install (see integrations/{superpowers,autoresearch}.md)"

    [ "$DRY_RUN" = 1 ] || ok "integrations done. Run: unslop doctor (then read integrations/*.md)"
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
            --dry-run)     DRY_RUN=1 ;;
            --no-network)  NO_NETWORK=1 ;;
            --trust-mode)
                shift
                case "${1:-}" in
                    strict|normal|dev) TRUST_MODE="$1" ;;
                    *) err "invalid --trust-mode value: ${1:-missing} (use strict|normal|dev)"; exit 64 ;;
                esac
                ;;
            --yes|-y)     ASSUME_YES=1 ;;
            -h|--help)
                sed -n '2,/^set -e/p' "$0" | sed 's/^# \?//'
                exit 0
                ;;
            *) err "unknown flag: $1"; exit 64 ;;
        esac
        shift
    done

    # Banner
    echo
    printf '%s%s=== delegate-team installer ===%s\n' "$DIM" "" "$RST"
    printf '  Trust mode : %s\n' "$TRUST_MODE"
    printf '  Dry run    : %s\n' "$( [ "$DRY_RUN" = 1 ] && echo yes || echo no )"
    printf '  No network : %s\n' "$( [ "$NO_NETWORK" = 1 ] && echo yes || echo no )"
    printf '  Assume yes : %s\n' "$( [ "$ASSUME_YES" = 1 ] && echo yes || echo no )"
    echo

    if [ "$do_uninst" = 1 ]; then uninstall; exit $?; fi
    if [ "$do_verify" = 1 ]; then verify; exit $?; fi

    [ "$do_dt"     = 1 ] && install_dt
    [ "$do_orch"   = 1 ] && install_orchestrator
    [ "$do_scaff"  = 1 ] && install_scaffolder
    [ "$do_mmas"   = 1 ] && install_mmas
    [ "$do_kernel" = 1 ] && install_kernel
    [ "$do_intg"   = 1 ] && install_integrations

    if [ "$DRY_RUN" = 1 ]; then
        echo
        warn "Dry run complete. Re-run without --dry-run to apply."
        exit 0
    fi

    echo
    verify
    echo
    ok "Install done. Try: /mavis-ship \"<your task>\" or agent-kernel remember \"<rule>\" --publish"
}

main "$@"