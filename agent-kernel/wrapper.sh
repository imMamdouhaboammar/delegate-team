#!/usr/bin/env bash
# agent-kernel/wrapper.sh — Resilient shim that picks the right agent-kernel binary.
#
# Resolution order:
#   1. $AGENT_KERNEL_BIN env var (override)
#   2. `agent-kernel` on $PATH (user's preferred install)
#   3. Vendored copy at <repo>/agent-kernel/dist/cli.mjs via `node`
#   4. `npx -y @mamdouh/agent-kernel` (when published) — best-effort, may fail offline
#
# Usage:
#   wrapper.sh <agent-kernel args...>
#   ./wrapper.sh remember "..." --type rule --publish
#
# All other delegate-team components call this wrapper via `agent-kernel <args>` —
# so a missing global binary never breaks the chain.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENDORED="$SCRIPT_DIR/dist/cli.mjs"

# 1. Explicit override
if [ -n "${AGENT_KERNEL_BIN:-}" ] && [ -x "$AGENT_KERNEL_BIN" ]; then
    exec "$AGENT_KERNEL_BIN" "$@"
fi

# 2. Global on PATH
if command -v agent-kernel >/dev/null 2>&1; then
    exec agent-kernel "$@"
fi

# 3. Vendored copy via node
if [ -f "$VENDORED" ] && command -v node >/dev/null 2>&1; then
    exec node "$VENDORED" "$@"
fi

# 4. npx fallback (best-effort; may need network)
if command -v npx >/dev/null 2>&1; then
    warn_fallback() {
        printf '%s[ak-wrapper]%s falling back to npx @mamdouh/agent-kernel\n' \
            '\033[0;33m' '\033[0m' >&2
    }
    warn_fallback
    exec npx -y @mamdouh/agent-kernel "$@"
fi

printf '%s[ak-wrapper]%s ERROR: no agent-kernel binary found.\n' \
    '\033[0;31m' '\033[0m' >&2
printf '  Try one of:\n' >&2
printf '    1. ./install.sh --kernel\n' >&2
printf '    2. npm install -g @mamdouh/agent-kernel\n' >&2
printf '    3. Set AGENT_KERNEL_BIN=/path/to/agent-kernel\n' >&2
exit 127