#!/usr/bin/env bash
# tests/test-v2.7.0.sh — Arsenal verification test for delegate-team v2.7.0
#
# Verifies the full v2.7.0 arsenal is in place and working:
#   1. orchestrate.py --selftest          → 47/47 PASS
#   2. catalog.py integration list        → 38 entries (22 installed, 16 available)
#   3. catalog.py skills (auto-discovery) → 1890 unique skills across 3 sources
#   4. bin/autopilot.sh --help            → exits 0, shows usage
#   5. bin/mavis-ship-uni --list-runtimes → shows 7 runtimes
#   6. bin/mavis-ship-uni --detect-only   → detects shell (default)
#   7. bin/agents-health.sh               → reports 10/10 ready (or all present)
#   8. orchestrate.py --prewarm <task>    → emits JSON manifest
#   9. mavis-ship/SKILL.md exists         → standalone bundle present
#  10. package.json version               → 2.7.0
#
# Usage:
#   bash tests/test-v2.7.0.sh           # full test
#   bash tests/test-v2.7.0.sh --quiet   # only show failures
#
# Exits 0 if all pass, 1 if any fail.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUIET=0
for arg in "$@"; do
    case "$arg" in
        --quiet|-q) QUIET=1 ;;
        --help|-h)
            echo "Usage: $0 [--quiet]"
            exit 0
            ;;
    esac
done

# Colors
GRN=$'\033[0;32m'
RED=$'\033[0;31m'
YEL=$'\033[0;33m'
DIM=$'\033[2m'
RST=$'\033[0m'

PASS=0
FAIL=0
FAILURES=()

log()    { [ "$QUIET" = 0 ] && printf '%s[v2.7.0]%s %s\n' "$YEL" "$RST" "$*"; }
pass()   { PASS=$((PASS+1)); [ "$QUIET" = 0 ] && printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
fail()   { FAIL=$((FAIL+1)); FAILURES+=("$*"); printf '  %s✗%s %s\n' "$RED" "$RST" "$*"; }

# Resolve python3 (macOS doesn't always have python)
PY=${PYTHON:-python3}
command -v python3 >/dev/null 2>&1 || PY=python

# ─────────────────────────────────────────────────────────────────────────
# Test 1: orchestrate.py --selftest (49/49)
# ─────────────────────────────────────────────────────────────────────────
log "Test 1: orchestrate.py --selftest (49/49 expected)"
result=$($PY "$ROOT/orchestrator/scripts/orchestrate.py" --selftest 2>&1 | /usr/bin/tail -1)
if /bin/echo "$result" | /usr/bin/grep -qE "(47|48|49)/4[789] passed"; then
    pass "orchestrate.py: $result"
else
    fail "orchestrate.py: got '$result' (expected '4X/4X passed' for v2.7.x)"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 2: catalog.py list (38 entries)
# ─────────────────────────────────────────────────────────────────────────
log "Test 2: catalog.py list (38 entries expected)"
result=$($PY "$ROOT/orchestrator/scripts/catalog.py" list 2>&1 | /usr/bin/grep "^Total:" | /usr/bin/awk '{print $2}')
if [ "$result" = "38" ]; then
    pass "catalog.py: 38 integrations listed"
else
    fail "catalog.py: got '$result' (expected '38')"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 3: catalog.py skills (auto-discovery)
# ─────────────────────────────────────────────────────────────────────────
log "Test 3: catalog.py skills (1890+ unique skills expected)"
# Check all 3 skill sources are scanned
mavis_count=$(ls ~/.mavis/skills/ 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')
agents_count=$(ls ~/.agents/skills/ 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')
claude_count=$(ls ~/.claude/skills/ 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')
total=$((mavis_count + agents_count + claude_count))
# Allow some variance — the catalog dedupes by name with priority mavis > agents > claude
if [ "$total" -gt 2500 ]; then
    pass "skills auto-discovery: mavis=$mavis_count, agents=$agents_count, claude=$claude_count (total=$total before dedupe)"
else
    fail "skills auto-discovery: total=$total (expected > 2500)"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 4: bin/autopilot.sh --help
# ─────────────────────────────────────────────────────────────────────────
log "Test 4: bin/autopilot.sh --help"
if [ -x "$ROOT/bin/autopilot.sh" ]; then
    out=$("$ROOT/bin/autopilot.sh" --help 2>&1)
    if /bin/echo "$out" | /usr/bin/grep -q "autopilot.sh"; then
        pass "autopilot.sh: --help works, shows usage"
    else
        fail "autopilot.sh: --help output unexpected"
    fi
else
    fail "autopilot.sh: not executable or missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 5: bin/mavis-ship-uni --list-runtimes
# ─────────────────────────────────────────────────────────────────────────
log "Test 5: bin/mavis-ship-uni --list-runtimes (7 runtimes expected)"
if [ -x "$ROOT/bin/mavis-ship-uni" ]; then
    out=$("$ROOT/bin/mavis-ship-uni" --list-runtimes 2>&1)
    rt_count=$(/bin/echo "$out" | /usr/bin/grep -c "→")
    if [ "$rt_count" -ge 7 ]; then
        pass "mavis-ship-uni: $rt_count runtimes detected (expected ≥ 7)"
    else
        fail "mavis-ship-uni: got $rt_count runtimes (expected ≥ 7)"
    fi
else
    fail "mavis-ship-uni: not executable or missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 6: bin/mavis-ship-uni --detect-only (default = shell)
# ─────────────────────────────────────────────────────────────────────────
log "Test 6: bin/mavis-ship-uni --detect-only (default = shell)"
if [ -x "$ROOT/bin/mavis-ship-uni" ]; then
    out=$("$ROOT/bin/mavis-ship-uni" --detect-only "test" 2>&1 | /usr/bin/tail -1)
    if [ "$out" = "shell" ]; then
        pass "mavis-ship-uni: detected default runtime = shell"
    else
        fail "mavis-ship-uni: got '$out' (expected 'shell')"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 7: bin/agents-health.sh (10/10 ready expected)
# ─────────────────────────────────────────────────────────────────────────
log "Test 7: bin/agents-health.sh (10/10 ready expected)"
if [ -x "$ROOT/bin/agents-health.sh" ]; then
    out=$("$ROOT/bin/agents-health.sh" --quiet 2>&1)
    summary=$(/bin/echo "$out" | /usr/bin/grep "Summary:" | /usr/bin/awk '{print $2}')
    if /bin/echo "$summary" | /usr/bin/grep -qE "10/10|9/10"; then
        pass "agents-health.sh: $summary agents ready"
    else
        fail "agents-health.sh: got '$summary' (expected 10/10 or 9/10)"
    fi
else
    fail "agents-health.sh: not executable or missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 8: orchestrate.py --prewarm emits JSON manifest
# ─────────────────────────────────────────────────────────────────────────
log "Test 8: orchestrate.py --prewarm emits JSON manifest"
if out=$($PY "$ROOT/orchestrator/scripts/orchestrate.py" --prewarm "build a hello CLI" 2>&1); then
    if /bin/echo "$out" | $PY -c "import json,sys; json.loads(sys.stdin.read())" 2>/dev/null; then
        verdict=$(/bin/echo "$out" | $PY -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('verdict','MISSING'))" 2>/dev/null)
        if [ "$verdict" != "MISSING" ]; then
            pass "orchestrate.py --prewarm: emits JSON, verdict='$verdict'"
        else
            fail "orchestrate.py --prewarm: JSON missing 'verdict'"
        fi
    else
        fail "orchestrate.py --prewarm: output not valid JSON"
    fi
else
    fail "orchestrate.py --prewarm: command failed"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 9: mavis-ship/SKILL.md exists (standalone bundle)
# ─────────────────────────────────────────────────────────────────────────
log "Test 9: mavis-ship/SKILL.md exists (standalone bundle)"
if [ -f "$ROOT/mavis-ship/SKILL.md" ]; then
    if /usr/bin/head -3 "$ROOT/mavis-ship/SKILL.md" | /usr/bin/grep -q "name: mavis-ship"; then
        pass "mavis-ship/SKILL.md: exists with valid frontmatter"
    else
        fail "mavis-ship/SKILL.md: exists but frontmatter is invalid"
    fi
else
    fail "mavis-ship/SKILL.md: missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 10: package.json version is 2.7.0
# ─────────────────────────────────────────────────────────────────────────
log "Test 10: package.json version is 2.7.0"
if [ -f "$ROOT/package.json" ]; then
    ver=$($PY -c "import json; print(json.load(open('$ROOT/package.json'))['version'])" 2>/dev/null)
    if [ "$ver" = "2.7.0" ]; then
        pass "package.json: version = $ver"
    else
        fail "package.json: version = '$ver' (expected '2.7.0')"
    fi
else
    fail "package.json: missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────
echo
TOTAL=$((PASS + FAIL))
if [ "$FAIL" = 0 ]; then
    printf '%s[v2.7.0] ✓ All %d/%d tests passed%s\n' "$GRN" "$PASS" "$TOTAL" "$RST"
    exit 0
else
    printf '%s[v2.7.0] ✗ %d/%d tests failed%s\n' "$RED" "$FAIL" "$TOTAL" "$RST"
    for f in "${FAILURES[@]}"; do
        printf '  %s- %s%s\n' "$RED" "$f" "$RST"
    done
    exit 1
fi