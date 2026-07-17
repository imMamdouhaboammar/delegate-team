#!/usr/bin/env bash
set -euo pipefail

# bin/integrations.sh - Automatically check, install, or update companion integrations.
# Supports Waza, unslop-preflight, superpowers, and autoresearch.

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RESET="\033[0m"

log() { printf "${BOLD}${CYAN}→ %s${RESET}\n" "$1"; }
ok() { printf "${BOLD}${GREEN}✓ %s${RESET}\n" "$1"; }
warn() { printf "${BOLD}${YELLOW}⚠️  %s${RESET}\n" "$1"; }
error() { printf "${BOLD}\033[31m❌ %s${RESET}\n" "$1" >&2; }

# Helper to check if command exists
has_cmd() {
    command -v "$1" >/dev/null 2>&1
}

NO_NETWORK="${NO_NETWORK:-0}"

# 1. Waza
check_waza() {
    log "Checking Waza integration..."
    if ! has_cmd npx; then
        warn "  npx not found; skipping Waza"
        return
    fi

    if [ "$NO_NETWORK" = 1 ]; then
        warn "  [no-network] skipping Waza update/install"
        return
    fi

    log "Updating/Installing Waza..."
    if npx -y skills add tw93/Waza -a claude-code -g -y 2>&1 | tail -3; then
        ok "Waza is successfully installed and up-to-date."
    else
        warn "Waza update/install failed (non-fatal)."
    fi
}

# 2. unslop-preflight
check_unslop() {
    log "Checking unslop-preflight integration..."
    if ! has_cmd npm; then
        warn "  npm not found; skipping unslop-preflight"
        return
    fi

    if [ "$NO_NETWORK" = 1 ]; then
        warn "  [no-network] skipping unslop-preflight update/install"
        return
    fi

    TMP_DIR="/tmp/unslop-preflight-install"
    rm -rf "$TMP_DIR"
    
    log "Cloning/Updating unslop-preflight..."
    if git clone --depth 1 https://github.com/imMamdouhaboammar/unslop-preflight "$TMP_DIR" 2>/dev/null; then
        log "Installing unslop-preflight globally..."
        if (cd "$TMP_DIR" && npm install -g . 2>&1 | tail -2); then
            mkdir -p "$HOME/.claude/skills/unslop"
            cp "$TMP_DIR/SKILL.md" "$HOME/.claude/skills/unslop/SKILL.md"
            ok "unslop-preflight is successfully installed and up-to-date."
        else
            warn "unslop-preflight global npm installation failed."
        fi
    else
        warn "Failed to clone unslop-preflight."
    fi
    rm -rf "$TMP_DIR"
}

# 3. superpowers
check_superpowers() {
    log "Checking superpowers integration..."
    if [ "$NO_NETWORK" = 1 ]; then
        warn "  [no-network] skipping superpowers update/install"
        return
    fi

    TMP_DIR="/tmp/superpowers-install"
    rm -rf "$TMP_DIR"
    
    log "Cloning/Updating superpowers..."
    if git clone --depth 1 https://github.com/obra/superpowers "$TMP_DIR" 2>/dev/null; then
        log "Copying superpowers skills..."
        mkdir -p "$HOME/.claude/skills"
        for skill_dir in "$TMP_DIR/skills"/*/; do
            if [ -d "$skill_dir" ]; then
                name=$(basename "$skill_dir")
                rm -rf "$HOME/.claude/skills/$name"
                cp -r "$skill_dir" "$HOME/.claude/skills/$name"
            fi
        done
        
        log "Installing SessionStart hook..."
        mkdir -p "$HOME/.claude/hooks/superpowers"
        cp "$TMP_DIR/hooks/run-hook.cmd" "$HOME/.claude/hooks/superpowers/"
        cp "$TMP_DIR/hooks/session-start" "$HOME/.claude/hooks/superpowers/"
        chmod +x "$HOME/.claude/hooks/superpowers/run-hook.cmd" "$HOME/.claude/hooks/superpowers/session-start"
        
        log "Creating symlinks..."
        mkdir -p "$HOME/.claude/hooks/skills"
        for skill in brainstorming dispatching-parallel-agents executing-plans \
                     finishing-a-development-branch receiving-code-review \
                     requesting-code-review subagent-driven-development \
                     systematic-debugging test-driven-development using-git-worktrees \
                     using-superpowers verification-before-completion \
                     writing-plans writing-skills; do
            ln -sf "$HOME/.claude/skills/$skill" "$HOME/.claude/hooks/skills/$skill"
        done
        
        log "Wiring hook into ~/.claude/settings.json..."
        node -e '
        const fs = require("fs");
        const path = require("path");
        const file = path.join(process.env.HOME, ".claude", "settings.json");
        let settings = {};
        if (fs.existsSync(file)) {
            try { settings = JSON.parse(fs.readFileSync(file, "utf8")); } catch(e) {}
        }
        settings.hooks = settings.hooks || {};
        settings.hooks.SessionStart = settings.hooks.SessionStart || [];
        
        const cmd = process.env.HOME + "/.claude/hooks/superpowers/run-hook.cmd session-start";
        const hasHook = settings.hooks.SessionStart.some(h => 
            h.hooks && h.hooks.some(sub => sub.command === cmd)
        );
        
        if (!hasHook) {
            settings.hooks.SessionStart.push({
                matcher: "startup|clear|compact",
                hooks: [{ type: "command", command: cmd }]
            });
            fs.writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
            console.log("✓ SessionStart hook wired.");
        } else {
            console.log("✓ SessionStart hook already wired.");
        }
        ' || warn "Failed to edit settings.json for superpowers"
        
        ok "superpowers is successfully installed and up-to-date."
    else
        warn "Failed to clone superpowers."
    fi
    rm -rf "$TMP_DIR"
}

# 4. autoresearch
check_autoresearch() {
    log "Checking autoresearch integration..."
    if [ "$NO_NETWORK" = 1 ]; then
        warn "  [no-network] skipping autoresearch update/install"
        return
    fi

    TMP_DIR="/tmp/autoresearch-install"
    rm -rf "$TMP_DIR"
    
    log "Cloning/Updating autoresearch..."
    if git clone --depth 1 https://github.com/uditgoenka/autoresearch "$TMP_DIR" 2>/dev/null; then
        log "Copying autoresearch commands..."
        mkdir -p "$HOME/.claude/commands"
        cp "$TMP_DIR/commands"/*.md "$HOME/.claude/commands/" 2>/dev/null || true
        
        log "Copying autoresearch skills..."
        mkdir -p "$HOME/.claude/skills"
        rm -rf "$HOME/.claude/skills/autoresearch"
        cp -r "$TMP_DIR/skills/autoresearch" "$HOME/.claude/skills/"
        
        if [ -f "$TMP_DIR/install-autoresearch-hooks.py" ]; then
            log "Merging autoresearch hooks..."
            python3 "$TMP_DIR/install-autoresearch-hooks.py" || warn "Autoresearch hook merging failed"
        fi
        
        ok "autoresearch is successfully installed and up-to-date."
    else
        warn "Failed to clone autoresearch."
    fi
    rm -rf "$TMP_DIR"
}

# Run updates
check_waza
check_unslop
check_superpowers
check_autoresearch

ok "Integrations health check and update complete!"
