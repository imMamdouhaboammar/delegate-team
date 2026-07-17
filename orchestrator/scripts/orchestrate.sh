#!/usr/bin/env bash
# orchestrate.sh — thin wrapper that delegates to orchestrate.py.
#
# v3.0.0: Bash regex couldn't do \b word boundaries, so the routing logic moved
# to Python. This file is now a stable CLI surface so the SKILL.md instructions
# still work.
#
# Usage:
#   orchestrate.sh "<task description>"
#   orchestrate.sh --selftest                  # regression battery
#   orchestrate.sh --prewarm "<task>"           # JSON manifest of skills
#   orchestrate.sh --dispatch "<task>"          # generate brief + dt run
#   orchestrate.sh --dispatch --direct "<task>"# bypass dt, call backend raw
#   orchestrate.sh --dispatch --team "<task>"   # force MMAS path
#   orchestrate.sh integration list             # show the 35-entry arsenal
#   orchestrate.sh integration info <id>        # show details
#   orchestrate.sh integration install <id>     # show install hint
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$SCRIPT_DIR/orchestrate.py"
CATALOG="$SCRIPT_DIR/catalog.py"
MESH="$SCRIPT_DIR/neural_mesh.py"

if [ ! -f "$PY" ]; then
    echo "orchestrate.py not found next to this script ($SCRIPT_DIR)" >&2
    exit 70
fi

# If the first argument is "mesh", forward to neural_mesh.py (introspection).
if [ "${1:-}" = "mesh" ]; then
    if [ ! -f "$MESH" ]; then
        echo "neural_mesh.py not found next to this script ($SCRIPT_DIR)" >&2
        exit 70
    fi
    exec python3 "$MESH" "${@:2}"
fi

# If the first argument is "integration", forward to catalog.py entirely
if [ "${1:-}" = "integration" ]; then
    if [ ! -f "$CATALOG" ]; then
        echo "catalog.py not found next to this script ($SCRIPT_DIR)" >&2
        exit 70
    fi
    exec python3 "$CATALOG" "${@:2}"
fi

# Default: no args → run selftest
if [ $# -eq 0 ]; then
    exec python3 "$PY" --selftest
fi

# Forward all args to the Python implementation. Word boundaries are handled
# there, so we don't need any shell-quoting gymnastics.
exec python3 "$PY" "$@"
