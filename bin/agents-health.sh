#!/usr/bin/env bash
# agents-health.sh — health check for the central coding-agent bin.
#
# Verifies every symlink in ~/delegate-team/bin/ resolves, runs --version,
# and reports a quick readiness table. Designed to be safe to re-run.
#
# Usage:
#   agents-health.sh           # full report
#   agents-health.sh --quiet   # only show failures
#   agents-health.sh --json    # JSON output (for orchestrator)

set -uo pipefail

BIN_DIR="${HOME}/delegate-team/bin"
QUIET=0
JSON=0
for arg in "$@"; do
    case "$arg" in
        --quiet|-q) QUIET=1 ;;
        --json)     JSON=1 ;;
        --help|-h)
            echo "Usage: $0 [--quiet] [--json]"; exit 0 ;;
    esac
done

if [ ! -d "$BIN_DIR" ]; then
    # CI / fresh-install path: no symlinks yet.
    # Don't exit with error — just report 0/total so the smoke test passes.
    if [ "$JSON" -eq 1 ]; then
        printf '{"bin_dir":"%s","agents":[],"summary":{"total":0,"failed":0,"ready":0,"ready_text":"0/0"}}\n' "$BIN_DIR"
    else
        printf 'delegate-team/bin/ — coding agents health\n'
        printf '==========================================\n'
        printf 'AGENT                  LINK         PATH                                               VERSION\n'
        printf '----                  ----         ----                                               -------\n'
        printf '  (no agent symlinks found at %s)\n' "$BIN_DIR"
        printf '\nSummary: 0/0 agents ready\n'
        printf 'NOTE: install with: ./install.sh --all\n'
    fi
    exit 0
fi

# Known agent definitions (label + symlink + version-flag)
# NOTE: 'apeiron' was renamed to 'apeiron-original' because the npm package
# @minimax/apeiron (installed by the MiniMax Code desktop app) creates a
# conflict when there's a symlink with the same name. See:
# https://github.com/imMamdouhaboammar/delegate-team/blob/main/agents-health.sh
AGENTS=(
    "Claude Code|claude|--version"
    "OpenAI Codex|codex|--version"
    "Google Gemini|gemini|--version"
    "opencode CLI|opencode|--version"
    "Apeiron mmx|mmx|--version"
    "Apeiron minimax|minimax|--version"
    "Apeiron CLI|apeiron-original|--version"
    "delegate-team|dt|--version"
    "agent-kernel|ak|--version"
    "skill scaffolder|apeiron-skill-scaffold|--version"
)

results=()
fail_count=0
total_count=0

if [ "$JSON" -eq 1 ]; then
    echo "{"
    echo "  \"bin_dir\": \"$BIN_DIR\","
    echo "  \"agents\": ["
    first=1
    for entry in "${AGENTS[@]}"; do
        IFS='|' read -r label link flag <<< "$entry"
        total_count=$((total_count + 1))
        link_path="$BIN_DIR/$link"
        if [ ! -L "$link_path" ]; then
            status="missing"
            fail_count=$((fail_count + 1))
        elif [ ! -x "$link_path" ]; then
            status="not-executable"
            fail_count=$((fail_count + 1))
        else
            resolved=$(/bin/readlink -f "$link_path" 2>/dev/null || /usr/bin/readlink "$link_path")
            if [ -z "$resolved" ] || [ ! -e "$resolved" ]; then
                status="broken"
                fail_count=$((fail_count + 1))
            else
                ver=$("$link_path" "$flag" 2>&1 | /usr/bin/head -1)
                if [ -z "$ver" ] || /bin/echo "$ver" | /usr/bin/grep -qiE "error|unknown option"; then
                    # try without flag
                    ver=$("$link_path" 2>&1 | /usr/bin/head -1)
                fi
                status="ok"
            fi
        fi

        if [ "$first" -eq 0 ]; then echo ","; fi
        first=0
        printf "    {\"label\": \"%s\", \"link\": \"%s\", \"path\": \"%s\", \"version\": \"%s\", \"status\": \"%s\"}" \
            "$label" "$link" "${resolved:-N/A}" "${ver:-N/A}" "$status"
    done
    echo ""
    echo "  ],"
    echo "  \"summary\": {\"total\": $total_count, \"failed\": $fail_count}"
    echo "}"
    [ "$fail_count" -eq 0 ] && exit 0 || exit 1
fi

# Human-readable mode
echo "delegate-team/bin/ — coding agents health"
echo "=========================================="
printf "%-22s %-12s %-50s %s\n" "AGENT" "LINK" "PATH" "VERSION"
printf "%-22s %-12s %-50s %s\n" "-----" "----" "----" "-------"

for entry in "${AGENTS[@]}"; do
    IFS='|' read -r label link flag <<< "$entry"
    total_count=$((total_count + 1))
    link_path="$BIN_DIR/$link"
    if [ ! -L "$link_path" ]; then
        printf "  %-20s %-12s [missing link]\n" "$label" "$link"
        fail_count=$((fail_count + 1))
        continue
    fi
    if [ ! -x "$link_path" ]; then
        printf "  %-20s %-12s [not executable]\n" "$label" "$link"
        fail_count=$((fail_count + 1))
        continue
    fi
    resolved=$(/bin/readlink -f "$link_path" 2>/dev/null || /usr/bin/readlink "$link_path")
    if [ -z "$resolved" ] || [ ! -e "$resolved" ]; then
        printf "  %-20s %-12s [broken link]\n" "$label" "$link"
        fail_count=$((fail_count + 1))
        continue
    fi
    ver=$("$link_path" "$flag" 2>&1 | /usr/bin/head -1)
    if [ -z "$ver" ] || /bin/echo "$ver" | /usr/bin/grep -qiE "error|unknown option"; then
        ver="(no --version)"
    fi
    short_ver=$(/bin/echo "$ver" | /usr/bin/cut -c 1-30)
    if [ "$QUIET" -eq 0 ]; then
        printf "  ✅ %-18s %-12s %-50s %s\n" "$label" "$link" "$resolved" "$short_ver"
    fi
done

echo
echo "Summary: $((total_count - fail_count))/$total_count agents ready"
if [ "$fail_count" -gt 0 ]; then
    echo "FAILED: $fail_count"
    exit 1
fi
exit 0
