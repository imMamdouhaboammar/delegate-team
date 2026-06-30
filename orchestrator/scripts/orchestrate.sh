#!/usr/bin/env bash
# orchestrate.sh — auto-route a task description through /mavis-ship's stages.
#
# Usage: orchestrate.sh "<task description>"
#
# Output: a one-line-per-stage plan that /mavis-ship will execute. The agent still
# drives the stages; this script just makes the routing decision so the agent
# doesn't have to ask the user.
#
# Detection rules (deliberately conservative — false-positive to /think is cheap,
# false-positive to autoresearch is expensive).

set -euo pipefail

task="${1:-}"
if [ -z "$task" ]; then
    echo "Usage: $0 \"<task>\"" >&2
    exit 64
fi

# Normalize: lowercase, collapse whitespace
n=$(printf '%s' "$task" | tr '[:upper:]' '[:lower:]')

# Score each candidate stage 0-3
score_think=0
score_unslop=0
score_writing=0
score_systematic=0
score_autoresearch=0
score_delegate=0
score_mmas=0
score_check=0
score_qguard=0
score_research=0

# /think — almost always, but skip for trivial renames
if [[ "$n" =~ (plan|design|build|create|implement|add|develop|architect|how should|what.s the best) ]]; then
    score_think=$((score_think + 2))
fi
if [[ "$n" =~ ^(rename|comment|remove|bump|update the version) ]]; then
    score_think=0  # trivial — skip planning
fi

# unslop UI quality gate
if [[ "$n" =~ (ui|frontend|page|component|layout|design|landing|dashboard|css|tailwind|shadcn|modal|form|button|theme|animation) ]]; then
    score_unslop=3
elif [[ "$n" =~ (api|server|backend|cli|query|sql|db|model|endpoint|route|handler|integration) ]]; then
    score_unslop=0  # backend-only
fi

# superpowers writing-plans
if (( score_think >= 2 )); then
    score_writing=2
fi

# systematic-debugging for bug signs
if [[ "$n" =~ (fix|bug|broken|regression|failing|wrong|crash|error|exception|hang|leak|memory|undefined) ]]; then
    score_systematic=2
fi

# autoresearch: has measurable metric?
if [[ "$n" =~ ([0-9]+%|p ?[0-9]+|< ?[0-9]|> ?[0-9]|reduce.*by|increase.*by|coverage|latency|bundle|size|throughput|perf|slow|faster|memory.*mb) ]]; then
    score_autoresearch=3
fi

# delegate-team: heavy multi-file
if [[ "$n" =~ (refactor|migrate|migration|overhaul|rewrite|across|multi.?file|architecture|integrate|service|module) ]]; then
    score_delegate=2
fi
# delegate is also the safe default for non-trivial
if (( score_think >= 2 )) && (( score_autoresearch == 0 )); then
    score_delegate=$((score_delegate + 1))
fi
# bug fixes typically benefit from delegate-team even after systematic-debugging
if (( score_systematic >= 2 )); then
    score_delegate=$((score_delegate + 1))
fi

# MMAS: parallel specialized
if [[ "$n" =~ (team|squad|parallel|specialize|division of labor|concurrent agents|swarm|crew) ]]; then
    score_mmas=3
fi

# /check always for non-trivial
if (( score_think >= 2 || score_systematic >= 2 || score_delegate >= 2 )); then
    score_check=2
fi

# quality-guard for UI + delivery
if (( score_unslop >= 3 || score_delegate >= 2 )); then
    score_qguard=2
fi

# research path
if [[ "$n" =~ (research|learn|understand|investigate|study|explore|survey|read about) ]]; then
    score_research=3
    score_think=0
    score_unslop=0
fi

# Print plan
echo "# /mavis-ship route for: \"$task\""
echo

stages=()
append() {
    local s="$1" n="$2"
    if (( n > 0 )); then
        stages+=("${s} (score=${n})")
    fi
}

append "/think (Waza)"              $score_think
append "/read + /learn (Waza)"       $score_research
append "systematic-debugging (superpowers)" $score_systematic
append "unslop audit (UI gate)"      $score_unslop
append "writing-plans (superpowers)" $score_writing
append "autoresearch: plan + loop"   $score_autoresearch
append "/delegate-team (multi-model)" $score_delegate
append "/mavis-team (MMAS)"          $score_mmas
append "/check (Waza)"               $score_check
append "quality-guard (Mavis)"       $score_qguard

if [ ${#stages[@]} -eq 0 ]; then
    echo "TRIVIAL — handle locally, skip the chain."
    exit 0
fi

echo "Stages (descending score):"
for s in "${stages[@]}"; do
    echo "  • $s"
done

echo
echo "# Verdict:"
if (( score_research >= 3 )); then
    echo "RESEARCH path — /read + /learn, no code."
elif (( score_autoresearch >= 3 )); then
    echo "PERFORMANCE/METRIC path — autoresearch loop is the engine."
elif (( score_unslop >= 3 )) && (( score_qguard >= 2 )); then
    echo "UI DELIVERY path — unslop audit is BLOCKING before /delegate-team."
elif (( score_systematic >= 2 )); then
    echo "BUG path — systematic-debugging before any patch."
elif (( score_delegate >= 2 )); then
    echo "FEATURE path — /delegate-team with minimax-coder default."
else
    echo "Default full chain."
fi
