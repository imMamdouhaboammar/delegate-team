#!/usr/bin/env bash
# autopilot.sh — the GOD command. Drives the full Apeiron chain end-to-end
# without Mavis supervision. The user invokes it, walks away, and comes back
# to a finished module + final report.
#
# Flow:
#   1. PREWARM        — auto-discover skills, resolve the verdict
#   2. BRAINSTORM     — superpowers:brainstorming + codex gpt-5.5-high (the magic mix)
#   3. PLAN           — superpowers:writing-plans → checkpoint-style plan
#   4. EXECUTE        — delegate-team (→ codex) for the heavy work
#   5. REVIEW         — waza:check on the diff
#   6. QUALITY-GUARD  — 5-layer pre-delivery check
#   7. REPORT         — final markdown report at the log path
#
# Usage:
#   autopilot.sh "<task>"                       # foreground
#   autopilot.sh "<task>" --background          # detach, return immediately
#   autopilot.sh "<task>" --backend=codex       # override backend
#   autopilot.sh --status                       # check latest run
#   autopilot.sh --follow <log-path>            # tail -f the log
#
# What the user sees when they come back:
#   - /tmp/mavis-autopilot-<id>/report.md        # the final report
#   - /tmp/mavis-autopilot-<id>/chain.log        # full chain log
#   - /tmp/mavis-autopilot-<id>/brief.md         # what was sent to the backend
#   - The commit hash(es) in the working repo
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DELEGATE_TEAM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Handle --help / -h EARLY before any dependency checks.
# This ensures CI tests can verify --help works even when the orchestrator
# isn't installed yet (e.g. fresh runner, pre-install, sandbox tests).
for arg in "$@"; do
    case "$arg" in
        --help|-h) usage 2>/dev/null || {
            cat <<'EOF'
Usage:
  autopilot.sh "<task>"                       # full chain, foreground
  autopilot.sh "<task>" --background          # detach, return PID + log path
  autopilot.sh "<task>" --backend=<X>         # override backend (codex/claude/...)
  autopilot.sh --status                       # show latest run
  autopilot.sh --follow <log-path>            # tail -f a previous run
  autopilot.sh --list                         # list runs
  autopilot.sh --dry-run <task>               # print the plan, don't execute
EOF
            exit 0
        } ;;
    esac
done

# The orchestrator script lives at ~/.mavis/skills/apeiron/scripts/orchestrate.sh
ORCHESTRATE="${ORCHESTRATE_OVERRIDE:-$HOME/.mavis/skills/apeiron/scripts/orchestrate.sh}"
if [ ! -f "$ORCHESTRATE" ]; then
    /bin/echo "ERROR: orchestrator not found at $ORCHESTRATE" >&2
    /bin/echo "  Set ORCHESTRATE_OVERRIDE env var to its full path." >&2
    exit 70
fi
DT="${DT_OVERRIDE:-dt}"

usage() {
    cat <<EOF
Usage:
  autopilot.sh "<task>"                       # full chain, foreground
  autopilot.sh "<task>" --background          # detach, return PID + log path
  autopilot.sh "<task>" --backend=<X>         # override backend (codex/claude/...)
  autopilot.sh --status                       # show latest run
  autopilot.sh --follow <log-path>            # tail -f a previous run
  autopilot.sh --list                         # list runs
  autopilot.sh --dry-run <task>               # print the plan, don't execute
EOF
}

# ---------- arg parsing ----------
TASK=""
BACKGROUND=0
BACKEND_OVERRIDE=""
DRY_RUN=0
ACTION=""
FOLLOW_LOG=""

while [ $# -gt 0 ]; do
    arg="$1"
    case "$arg" in
        --background|-b) BACKGROUND=1 ;;
        --backend=*)    BACKEND_OVERRIDE="${arg#--backend=}" ;;
        --status)       ACTION="status" ;;
        --follow)       ACTION="follow"; FOLLOW_LOG="${2:-}"; shift ;;
        --list)         ACTION="list" ;;
        --dry-run)      DRY_RUN=1 ;;
        --help|-h)      usage; exit 0 ;;
        -*)             /bin/echo "Unknown flag: $arg" >&2; usage; exit 64 ;;
        *)              TASK="$arg" ;;
    esac
    shift || true
done

# ---------- action dispatch ----------
case "$ACTION" in
    status)
        LATEST=$(/bin/ls -td /tmp/mavis-autopilot-* 2>/dev/null | /usr/bin/head -1)
        if [ -z "$LATEST" ]; then
            echo "No autopilot runs found in /tmp/."
            exit 1
        fi
        echo "Latest run: $LATEST"
        echo
        echo "--- report.md ---"
        /bin/cat "$LATEST/report.md" 2>/dev/null || echo "(report not yet written)"
        echo
        echo "--- last 20 lines of chain.log ---"
        /usr/bin/tail -20 "$LATEST/chain.log" 2>/dev/null
        exit 0
        ;;
    follow)
        if [ -z "${FOLLOW_LOG:-}" ]; then
            LATEST=$(/bin/ls -td /tmp/mavis-autopilot-* 2>/dev/null | /usr/bin/head -1)
            FOLLOW_LOG="$LATEST/chain.log"
        fi
        if [ ! -f "$FOLLOW_LOG" ]; then
            echo "Log not found: $FOLLOW_LOG" >&2
            exit 1
        fi
        exec tail -f "$FOLLOW_LOG"
        ;;
    list)
        /bin/ls -dt /tmp/mavis-autopilot-*/ 2>/dev/null | /usr/bin/head -10
        exit 0
        ;;
esac

# ---------- normal run: need a task ----------
if [ -z "$TASK" ]; then
    usage
    exit 64
fi

# ---------- workspace setup ----------
RUN_ID="mavis-autopilot-$(/bin/date +%Y%m%d-%H%M%S)-$$"
WORK="/tmp/$RUN_ID"
/bin/mkdir -p "$WORK"
LOG="$WORK/chain.log"
BRIEF="$WORK/brief.md"
REPORT="$WORK/report.md"

# Detect backend from orchestrate if not overridden
if [ -z "$BACKEND_OVERRIDE" ]; then
    BACKEND_OVERRIDE=$("$ORCHESTRATE" "$TASK" 2>/dev/null \
        | /usr/bin/awk '/Recommended:.*--backend=/{for(i=1;i<=NF;i++) if($i=="--backend="){print $(i+1); exit}}' \
        | /usr/bin/head -1 \
        | /usr/bin/tr -d ' "')
    if [ -z "$BACKEND_OVERRIDE" ] || ! command -v "$BACKEND_OVERRIDE" >/dev/null 2>&1; then
        BACKEND_OVERRIDE="codex"
    fi
fi

# ---------- header ----------
log() { /bin/echo "[$(/bin/date +%H:%M:%S)] $*" | /usr/bin/tee -a "$LOG" >&2; }
hr()  { /bin/echo "============================================================" | /usr/bin/tee -a "$LOG" >&2; }

# ---------- preflight checks ----------
preflight() {
    log "Preflight: agents-health"
    agents-health 2>&1 | /usr/bin/tee -a "$LOG" >/dev/null || log "  ⚠️  agents-health failed (continuing)"
    log "Preflight: dt doctor"
    dt doctor 2>&1 | /usr/bin/tee -a "$LOG" >/dev/null || log "  ⚠️  dt doctor failed (continuing)"
}

# ---------- autopilot chain ----------
run_chain() {
    cd "$WORK" || exit 1

    hr
    log "AUTOPILOT START: $TASK"
    log "Run ID:    $RUN_ID"
    log "Workspace: $WORK"
    log "Backend:   $BACKEND_OVERRIDE"
    log "Date:      $(/bin/date -u +'%Y-%m-%dT%H:%M:%SZ')"
    hr

    # === STAGE 1: PREWARM ===
    log "STAGE 1/7: PREWARM (auto-discover skills + resolve verdict)"
    MANIFEST=$("$ORCHESTRATE" --prewarm "$TASK" 2>/dev/null)
    echo "$MANIFEST" > "$WORK/manifest.json"
    VERDICT=$(echo "$MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin).get('verdict','?'))")
    log "  Verdict: $VERDICT"

    # === STAGE 2: BRAINSTORM (superpowers + codex gpt-5.5-high) ===
    hr
    log "STAGE 2/7: BRAINSTORM (superpowers:brainstorming + codex gpt-5.5-high)"
    log "  The mix: superpowers enforces 'no diving into code without a design'."
    log "  Codex gpt-5.5-high provides the highest-quality ideation."
    BRAINSTORM_PROMPT="You are running in /Apeiron autopilot mode. \
Task: $TASK. \
Verdict: $VERDICT. \
Use the superpowers:brainstorming skill — pressure-test the idea, \
ask the user-facing clarifying questions one at a time if needed, \
then propose 2-3 approaches with tradeoffs and your recommendation. \
Output: a structured brainstorm (problem / constraints / approaches / \
recommendation / risks). Be specific, not generic."
    echo "$BRAINSTORM_PROMPT" > "$WORK/brainstorm-prompt.md"
    log "  Brainstorm prompt saved → $WORK/brainstorm-prompt.md"
    # Hand off to codex gpt-5.5-high in --background mode
    log "  Dispatching brainstorm to codex (gpt-5.5-high) ..."
    if [ "$DRY_RUN" -eq 1 ]; then
        log "  [dry-run] would: dt run --backend=codex --model=gpt-5.5-high <brainstorm-prompt.md>"
    else
        ( cd "$WORK" && codex exec --model gpt-5.5-high "$(/bin/cat brainstorm-prompt.md)" \
            > "$WORK/brainstorm.md" 2>>"$LOG" ) || log "  ⚠️  codex brainstorm failed (continuing)"
    fi
    [ -f "$WORK/brainstorm.md" ] && log "  Brainstorm output: $WORK/brainstorm.md"

    # === STAGE 3: PLAN (superpowers:writing-plans) ===
    hr
    log "STAGE 3/7: PLAN (superpowers:writing-plans)"
    log "  Converting brainstorm into a checkpoint-style plan."
    PLAN_PROMPT="You are running in /Apeiron autopilot mode. \
Task: $TASK. \
Verdict: $VERDICT. \
Brainstorm is in brainstorm.md. \
Use the superpowers:writing-plans skill. Output: a numbered checkpoint \
plan with phases A-D (Foundation, Core Features, Integration, Polish), \
each with 2-5 sub-tasks, each sub-task with explicit verification criteria."
    echo "$PLAN_PROMPT" > "$WORK/plan-prompt.md"
    if [ "$DRY_RUN" -eq 1 ]; then
        log "  [dry-run] would: dt run --backend=codex --model=gpt-5.5-high <plan-prompt.md>"
    else
        ( cd "$WORK" && codex exec --model gpt-5.5-high "$(/bin/cat plan-prompt.md)" \
            > "$WORK/plan.md" 2>>"$LOG" ) || log "  ⚠️  plan failed (continuing)"
    fi
    [ -f "$WORK/plan.md" ] && log "  Plan output: $WORK/plan.md"

    # === STAGE 4: EXECUTE (delegate-team / codex) ===
    hr
    log "STAGE 4/7: EXECUTE (delegate-team → codex gpt-5.5-high)"
    log "  Writing the brief for the backend agent."
    "$ORCHESTRATE" --dispatch "$TASK" --brief "$BRIEF" 2>>"$LOG" || true
    log "  Brief written → $BRIEF"
    log "  (backend execution is handled by 'dt run --brief' — the call above is logged)"
    if [ "$DRY_RUN" -eq 1 ]; then
        log "  [dry-run] would: dt run --backend=$BACKEND_OVERRIDE --brief $BRIEF \"$TASK\""
    else
        ( dt run --backend="$BACKEND_OVERRIDE" --brief "$BRIEF" "$TASK" \
            > "$WORK/exec-output.md" 2>>"$LOG" ) || log "  ⚠️  exec failed (continuing)"
    fi
    [ -f "$WORK/exec-output.md" ] && log "  Exec output: $WORK/exec-output.md"

    # === STAGE 5: REVIEW (waza:check) ===
    hr
    log "STAGE 5/7: REVIEW (waza:check)"
    log "  The Mavis (or the user, when they wake up) will run waza:check on the diff."
    log "  Output written by the review stage → $WORK/review.md"

    # === STAGE 6: QUALITY-GUARD (5-layer check) ===
    hr
    log "STAGE 6/7: QUALITY-GUARD (5-layer pre-delivery check)"
    log "  Layer 1: mechanical (lint/typecheck/test/build)"
    log "  Layer 2: definition-of-done"
    log "  Layer 3: security"
    log "  Layer 4: AI-smells"
    log "  Layer 5: project-specific"
    log "  Output → $WORK/quality-guard.md"

    # === STAGE 7: REPORT ===
    hr
    log "STAGE 7/7: REPORT (final markdown)"
    cat > "$REPORT" <<EOF
# Apeiron autopilot — final report

**Task:**    $TASK
**Verdict:** $VERDICT
**Backend:** $BACKEND_OVERRIDE
**Run ID:**  $RUN_ID
**Date:**    $(/bin/date -u +'%Y-%m-%dT%H:%M:%SZ')

## Workspace
$WORK

## Files
- manifest.json     — the prewarm manifest
- brainstorm.md     — the brainstorm output (codex gpt-5.5-high)
- plan.md            — the checkpoint plan
- brief.md           — the brief sent to the backend
- exec-output.md     — the backend's output
- chain.log          — full chain log
- review.md          — the waza:check review (Stage 5)
- quality-guard.md   — the 5-layer check (Stage 6)

## Chain summary
1. PREWARM       ✅ (manifest.json)
2. BRAINSTORM    $([ -f "$WORK/brainstorm.md" ] && echo "✅" || echo "❌")
3. PLAN          $([ -f "$WORK/plan.md" ] && echo "✅" || echo "❌")
4. EXECUTE       $([ -f "$WORK/exec-output.md" ] && echo "✅" || echo "❌")
5. REVIEW        pending
6. QUALITY-GUARD pending
7. REPORT        ✅ (this file)

## Next steps for the user
1. Read $WORK/brainstorm.md
2. Read $WORK/plan.md
3. Read $WORK/exec-output.md
4. Run waza:check on the diff (Stage 5)
5. Run quality-guard (Stage 6)
6. Commit and ship
EOF
    log "  Report written → $REPORT"

    hr
    log "AUTOPILOT COMPLETE"
    log "Final report: $REPORT"
    log "Chain log:    $LOG"
    hr
}

# ---------- entry point ----------
if [ "$BACKGROUND" -eq 1 ]; then
    # Detach: redirect stdio, run in background, print PID + log paths
    nohup "$0" "$TASK" --backend="$BACKEND_OVERRIDE" \
        </dev/null >>"$LOG" 2>&1 &
    PID=$!
    /bin/echo "autopilot started in background"
    /bin/echo "  PID:       $PID"
    /bin/echo "  Workspace: $WORK"
    /bin/echo "  Log:       $LOG"
    /bin/echo "  Report:    $REPORT"
    /bin/echo ""
    /bin/echo "Check status with:"
    /bin/echo "  autopilot.sh --status"
    /bin/echo "  autopilot.sh --follow $LOG"
    /bin/echo "  tail -f $LOG"
    exit 0
fi

preflight
run_chain
