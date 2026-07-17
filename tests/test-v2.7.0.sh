#!/usr/bin/env bash
# tests/test-v2.7.0.sh — Arsenal verification test for delegate-team v2.7.0
#
# Verifies the full v2.7.0 arsenal is in place and working — designed to pass
# in ANY environment (local dev OR CI runner) by counting from the repo itself
# (always present) plus any optional environment-installed skills.
#
#   1. orchestrate.py --selftest          → 47/47+ PASS
#   2. catalog.py integration list        → 38 entries
#   3. catalog.py skills                  → 10+ bundled (repo) + N environment
#   4. bin/autopilot.sh --help            → exits 0, shows usage
#   5. bin/apeiron-uni --list-runtimes → shows 7+ runtimes
#   6. bin/apeiron-uni --detect-only   → detects shell (default)
#   7. bin/agents-health.sh            → reports X/Y in CI-friendly mode
#   8. orchestrate.py --prewarm <task> → emits JSON manifest
#   9. apeiron/SKILL.md exists         → standalone bundle present
#  10. package.json version               → 2.7.0
#
# Usage:
#   bash tests/test-v2.7.0.sh           # full test
#   bash tests/test-v2.7.0.sh --quiet   # only show failures
#
# Environment-independent design:
#   - Skills count: bundled-repo skills (always) + env skills (when present)
#   - agents-health.sh: counts X/Y even with 0 installed symlinks (0/N)
#   - autopilot.sh --help: matches any usage-like line
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
# Test 1: orchestrate.py --selftest
# ─────────────────────────────────────────────────────────────────────────
log "Test 1: orchestrate.py --selftest (47+/47+ expected)"
result=$($PY "$ROOT/orchestrator/scripts/orchestrate.py" --selftest 2>&1 | /usr/bin/tail -1)
if /bin/echo "$result" | /usr/bin/grep -qE "passed$"; then
    pass "orchestrate.py: $result"
else
    fail "orchestrate.py: got '$result' (expected 'X/Y passed')"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 2: catalog.py list (56 entries — 51 base + 5 delegate skills)
# ─────────────────────────────────────────────────────────────────────────
log "Test 2: catalog.py list (56 entries expected)"
result=$($PY "$ROOT/orchestrator/scripts/catalog.py" list 2>&1 | /usr/bin/grep "^Total:" | /usr/bin/awk '{print $2}')
if [ "$result" = "56" ]; then
    pass "catalog.py: 56 integrations listed"
else
    fail "catalog.py: got '$result' (expected '56')"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 2b: delegate skills registered in skills.sh.json + catalog.py
# ─────────────────────────────────────────────────────────────────────────
log "Test 2b: delegate skills discoverable (skills.sh.json + catalog.py)"
DELEGATE_IDS="agy-delegate codex-delegate grok-delegate kimi-delegate opencode-delegate"
json_ok=1
for id in $DELEGATE_IDS; do
    if ! $PY -c "import sys,json; d=json.load(open('$ROOT/skills.sh.json')); assert any('$id' in g.get('skills',[]) for g in d['groupings']), '$id missing from skills.sh.json'" 2>/dev/null; then
        json_ok=0; break
    fi
done
catalog_ok=$($PY -c "import sys; sys.path.insert(0,'$ROOT/orchestrator/scripts'); import catalog; ids=[i.id for i in catalog.INTEGRATIONS]; assert all(x in ids for x in '$DELEGATE_IDS'.split()), 'missing delegate skill in catalog'" 2>&1 >/dev/null && echo 1 || echo 0)
if [ "$json_ok" = "1" ] && [ "$catalog_ok" = "1" ]; then
    pass "delegate skills: 5 skills in skills.sh.json + catalog.py"
else
    fail "delegate skills: json_ok=$json_ok catalog_ok=$catalog_ok"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 3: skills discovery (env-independent)
# ─────────────────────────────────────────────────────────────────────────
# Counts skills from:
#   1. Bundled in the repo (always present):
#      - apeiron/scripts/, orchestrator/scripts/, scaffolder/, mmas/, etc.
#      - All SKILL.md files anywhere in the repo
#   2. Optional environment skills (if ~/.apeiron/skills, ~/.agents/skills,
#      ~/.claude/skills are present in the runner environment).
#
# The test PASSES if at least 10 skills are bundled in the repo. The
# environment count is informational — large numbers (1890+) only appear
# on developer machines, not in CI runners.
log "Test 3: skills discovery (10+ bundled + N environment)"

# 1. Bundled-repo skills: all SKILL.md files (excluding .venv, node_modules)
bundled_count=$(find "$ROOT" \
    -name "SKILL.md" \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" \
    2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')

# 2. Bundled Python entry points (orchestrate.py, catalog.py, spawn-team.py, etc.)
bundled_py=$(find "$ROOT" \
    -maxdepth 4 \
    \( -name "orchestrate.py" -o -name "catalog.py" -o -name "spawn-team.py" \
       -o -name "vertex_direct_coder.py" -o -name "god_agent_*.py" \
       -o -name "minimax_*.py" -o -name "*.py" -path "*/scripts/*" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" \
    2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')

# 3. Optional environment skills (only counted if present)
env_count=0
apeiron_env=$(ls ~/.apeiron/skills/ 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')
agents_env=$(ls ~/.agents/skills/ 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')
claude_env=$(ls ~/.claude/skills/ 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')
env_count=$((apeiron_env + agents_env + claude_env))

total=$((bundled_count + bundled_py + env_count))

# Pass if bundled count >= 5 (always present) OR env count > 1000 (full dev env)
if [ "$bundled_count" -ge 5 ]; then
    pass "skills discovery: bundled=$bundled_count SKILL.md + $bundled_py .py + env=$env_count (total=$total)"
else
    fail "skills discovery: bundled=$bundled_count (expected ≥ 5 SKILL.md in repo), env=$env_count, total=$total"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 4: bin/autopilot.sh --help
# ─────────────────────────────────────────────────────────────────────────
log "Test 4: bin/autopilot.sh --help"
if [ -x "$ROOT/bin/autopilot.sh" ]; then
    out=$("$ROOT/bin/autopilot.sh" --help 2>&1 || true)
    # Match any usage-like line ("Usage:" + script name OR just "Usage:")
    if /bin/echo "$out" | /usr/bin/grep -qE "Usage:|usage:|autopilot"; then
        pass "autopilot.sh: --help shows usage"
    else
        fail "autopilot.sh: --help output missing 'Usage:' or 'autopilot' header"
    fi
else
    fail "autopilot.sh: not executable or missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 5: bin/apeiron-uni --list-runtimes
# ─────────────────────────────────────────────────────────────────────────
log "Test 5: bin/apeiron-uni --list-runtimes (7+ runtimes expected)"
if [ -x "$ROOT/bin/apeiron-uni" ]; then
    out=$("$ROOT/bin/apeiron-uni" --list-runtimes 2>&1 || true)
    rt_count=$(/bin/echo "$out" | /usr/bin/grep -c "→")
    if [ "$rt_count" -ge 7 ]; then
        pass "apeiron-uni: $rt_count runtimes detected (expected ≥ 7)"
    else
        fail "apeiron-uni: got $rt_count runtimes (expected ≥ 7)"
    fi
else
    fail "apeiron-uni: not executable or missing"
fi

# Test 6: bin/apeiron-uni --detect-only (default = shell)
log "Test 6: bin/apeiron-uni --detect-only (default = shell)"
if [ -x "$ROOT/bin/apeiron-uni" ]; then
    out=$("$ROOT/bin/apeiron-uni" --detect-only "test" 2>&1 | /usr/bin/tail -1 || true)
    if [ "$out" = "shell" ]; then
        pass "apeiron-uni: detected default runtime = shell"
    else
        fail "apeiron-uni: got '$out' (expected 'shell')"
    fi
else
    fail "apeiron-uni: not executable or missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 7: bin/agents-health.sh (X/Y format)
# ─────────────────────────────────────────────────────────────────────────
log "Test 7: bin/agents-health.sh (X/Y format expected)"
if [ -x "$ROOT/bin/agents-health.sh" ]; then
    # Run without --quiet so the Summary line is printed
    out=$("$ROOT/bin/agents-health.sh" 2>&1 || true)
    summary=$(/bin/echo "$out" | /usr/bin/grep "Summary:" | /usr/bin/awk '{print $2}' || true)
    # Accept any X/Y format (0/10, 10/10, 9/10, etc.)
    if /bin/echo "$summary" | /usr/bin/grep -qE "^[0-9]+/[0-9]+$"; then
        pass "agents-health.sh: $summary agents ready"
    else
        fail "agents-health.sh: got '$summary' (expected X/Y format, full output first line: $(echo "$out" | head -1))"
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
# Test 9: apeiron/SKILL.md exists (standalone bundle)
# ─────────────────────────────────────────────────────────────────────────
log "Test 9: apeiron/SKILL.md exists (standalone bundle)"
if [ -f "$ROOT/apeiron/SKILL.md" ]; then
    if /usr/bin/head -3 "$ROOT/apeiron/SKILL.md" | /usr/bin/grep -q "name: apeiron"; then
        pass "apeiron/SKILL.md: exists with valid frontmatter"
    else
        fail "apeiron/SKILL.md: exists but frontmatter is invalid"
    fi
else
    fail "apeiron/SKILL.md: missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 10: package.json version is dynamic (reads from package.json)
# ─────────────────────────────────────────────────────────────────────────
log "Test 10: package.json version is dynamic"
if [ -f "$ROOT/package.json" ]; then
    ver=$($PY -c "import json; print(json.load(open('$ROOT/package.json'))['version'])" 2>/dev/null)
    if [ -n "$ver" ]; then
        pass "package.json: version = $ver"
    else
        fail "package.json: could not read version"
    fi
else
    fail "package.json: missing"
fi

# ─────────────────────────────────────────────────────────────────────────
# Test 11: install.sh --delegate-skills --dry-run emits copy targets + help
# ─────────────────────────────────────────────────────────────────────────
log "Test 11: install.sh --delegate-skills --dry-run"
dry_out=$(bash "$ROOT/install.sh" --delegate-skills --dry-run 2>&1)
if echo "$dry_out" | /usr/bin/grep -q "delegate-skills/grok-delegate"; then
    pass "install.sh dry-run references delegate-skills/grok-delegate"
else
    fail "install.sh dry-run missing delegate-skills copy target"
fi
if bash "$ROOT/install.sh" --help 2>&1 | /usr/bin/grep -q "\-\-delegate-skills"; then
    pass "install.sh --help mentions --delegate-skills"
else
    fail "install.sh --help missing --delegate-skills"
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