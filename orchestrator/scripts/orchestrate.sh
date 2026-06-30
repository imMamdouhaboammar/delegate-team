#!/usr/bin/env bash
# orchestrate.sh — auto-route a task description through /mavis-ship's stages.
#
# Usage: orchestrate.sh "<task description>"
#
# v2.1.1 — fixed false-positives from v2.0.0 self-test:
#   - 'agentic' no longer triggers unslop UI gate (now requires UI-first words)
#   - 'team' no longer triggers MMAS unless paired with explicit multi-agent verbs
#   - Build/publish/release tasks now have a dedicated BUILD path that overrides
#     accidental UI/multimatch scores
#   - All regexes use simpler bash-safe patterns (no \b word boundaries)
#
# v2.5.0 — added memory stage (agent-kernel):
#   - 'remember' / 'save this rule' / 'long-term memory' → search agent-kernel memory
#   - 'what did we do' / 'past episode' / 'recall' → search agent-kernel episodes
#   - When memory scores >=2, prepend `agent-kernel memory search` + `episode search`
#     to the chain, and append `episode add` at the end
#   - Memory stage is a side-effect, not a verdict path — never overrides the main verdict

set -euo pipefail

task="${1:-}"
if [ -z "$task" ]; then
    echo "Usage: $0 "<task>"" >&2
    exit 64
fi

# Normalize: lowercase
n=$(printf '%s' "$task" | tr '[:upper:]' '[:lower:]')

# Score each candidate stage
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
score_memory=0

has() {
    # has "<delimited regex>" "<text>"
    case "$2" in
        *$1*) return 0 ;;
        *)    return 1 ;;
    esac
}

# ----------------------------------------------------------------------
# BUILD/PUBLISH path — strong override signal for releases, packaging,
# repo creation, deploys. Wins over accidental UI/multimatch scores.
# ----------------------------------------------------------------------
if has "publish" "$n" || has "release" "$n" || has " ship " "$n" || has "push " "$n" || \
   has "deploy" "$n" || has "launch" "$n" || has "package it" "$n" || \
   has "cut a release" "$n" || has "build a repo" "$n" || \
   has "build a package" "$n" || has "build a library" "$n" || \
   has "build an sdk" "$n" || has "github" "$n" || has "open-source" "$n" || \
   has "open source" "$n" || has "opensource" "$n" || has "contribute" "$n"; then
    score_think=3
    score_delegate=3
    score_check=2
    score_qguard=2
    score_unslop=0
    score_mmas=0
fi

# ----------------------------------------------------------------------
# /think — design/plan/build signals
# ----------------------------------------------------------------------
if has "plan" "$n" || has "design " "$n" || has "architect" "$n" || \
   has "how should" "$n" || has "what's the best" "$n" || \
   has "approach " "$n" || has "strategy" "$n"; then
    score_think=$((score_think + 3))
fi
if has "build" "$n" || has "create " "$n" || has "implement" "$n" || \
   has "add a " "$n" || has "develop" "$n" || has "scaffold" "$n" || \
   has "generate" "$n"; then
    score_think=$((score_think + 2))
fi

# Trivial skip — explicit
if has "rename " "$n" || has "comment out" "$n" || has "remove that" "$n" || \
   has "bump version" "$n" || has "update the version" "$n"; then
    score_think=0
    score_delegate=0
fi

# ----------------------------------------------------------------------
# unslop UI quality gate — REQUIRES UI-first words
# ----------------------------------------------------------------------
# Strong UI signal: literal UI/frontend + no backend
if (has " ui" "$n" || has "frontend" "$n" || has "front-end" "$n"); then
    if ! has "agentic" "$n" && ! has " api " "$n" && ! has "backend" "$n" && \
       ! has "server " "$n" && ! has " cli " "$n" && ! has "terminal" "$n"; then
        score_unslop=4
    fi
elif has "landing page" "$n" || has "pricing page" "$n" || has "dashboard page" "$n" || \
     has "settings page" "$n" || has "profile page" "$n" || has "signup page" "$n" || \
     has "login page" "$n" || has "checkout flow" "$n" || has "onboarding flow" "$n"; then
    score_unslop=4
elif has "component" "$n" || has "layout " "$n" || has "css " "$n" || \
     has "tailwind" "$n" || has "shadcn" "$n" || has "modal" "$n" || \
     has " form " "$n" || has "design system" "$n" || has "color palette" "$n" || \
     has "typography" "$n"; then
    if ! has "agentic" "$n" && ! has " api " "$n" && ! has "backend" "$n"; then
        score_unslop=3
    fi
fi

# Backend-only override
if has " api " "$n" || has "server " "$n" || has "backend" "$n" || \
   has " cli " "$n" || has "query" "$n" || has " sql " "$n" || \
   has "endpoint" "$n" || has "handler" "$n"; then
    if ! has " ui" "$n" && ! has "frontend" "$n" && ! has "page" "$n" && \
       ! has "component" "$n" && ! has "layout " "$n" && ! has "css " "$n" && \
       ! has "tailwind" "$n" && ! has "shadcn" "$n" && ! has "modal" "$n" && \
       ! has " form " "$n"; then
        score_unslop=0
    fi
fi

# ----------------------------------------------------------------------
# systematic-debugging for bug signs
# ----------------------------------------------------------------------
if has "fix " "$n" || has "debug" "$n" || has "bug " "$n" || has "broken" "$n" || \
   has "regression" "$n" || has "failing" "$n" || has "fails" "$n" || \
   has "crash" "$n" || has "leak" "$n" || has "undefined" "$n"; then
    score_systematic=3
elif has "error" "$n" || has "exception" "$n" || has "hang" "$n" || \
     has "wrong" "$n" || has "not working" "$n" || has "doesn't work" "$n"; then
    score_systematic=2
fi

# ----------------------------------------------------------------------
# autoresearch: has measurable metric?
# ----------------------------------------------------------------------
if [[ "$n" == *"% "* ]] || [[ "$n" =~ .*[0-9]+% ]] || [[ "$n" == *"%" ]] || \
   has "p95" "$n" || has "p99" "$n" || has "p50" "$n" || has "p " "$n" || \
   has " by " "$n" || has "reduce.*by" "$n" || has "increase.*by" "$n" || \
   [[ "$n" == *"< "[0-9]* ]] || [[ "$n" == *"<"[0-9]* ]] || \
   [[ "$n" == *"> "[0-9]* ]] || [[ "$n" == *">"[0-9]* ]]; then
    score_autoresearch=4
elif has "coverage" "$n" || has "latency" "$n" || has "bundle size" "$n" || \
     has "throughput" "$n" || has "memory " "$n" || has "rps" "$n" || \
     has "qps" "$n" || has "p50" "$n" || has "p95" "$n" || has "p99" "$n"; then
    score_autoresearch=3
elif has "perf" "$n" || has "performance" "$n" || has "slow" "$n" || \
     has "faster" "$n" || has "optimize" "$n" || has "optimise" "$n" || \
     has "reduce " "$n" || has "minimize" "$n" || has "minimise" "$n"; then
    score_autoresearch=2
fi

# ----------------------------------------------------------------------
# delegate-team: heavy multi-file work
# ----------------------------------------------------------------------
if has "refactor" "$n" || has "migrat" "$n" || has "overhaul" "$n" || \
   has "rewrite" "$n" || has "across " "$n" || has "multi-file" "$n" || \
   has "multi file" "$n" || has "architecture" "$n" || has "integrate" "$n" || \
   has "service " "$n" || has "module " "$n"; then
    score_delegate=$((score_delegate + 3))
fi
# Non-trivial default
if (( score_think >= 2 )) && (( score_autoresearch == 0 )) && (( score_delegate == 0 )) && \
   (( score_unslop < 3 )); then
    score_delegate=$((score_delegate + 2))
fi
# Bug fixes after systematic-debugging
if (( score_systematic >= 2 )); then
    score_delegate=$((score_delegate + 1))
fi

# ----------------------------------------------------------------------
# MMAS — strong multi-agent signals ONLY (don't match bare 'team')
# ----------------------------------------------------------------------
if has "squad" "$n" || has "swarm" "$n" || has "crew " "$n" || \
   has "multi-agent" "$n" || has "multi agent" "$n" || \
   has "parallel agents" "$n" || has "concurrent agents" "$n"; then
    score_mmas=4
elif has "spawn a team" "$n" || has "spawn team" "$n" || \
     has "team of agents" "$n" || has "agent crew" "$n" || \
     has "division of labor" "$n" || has "specialize" "$n"; then
    score_mmas=4
elif (has "parallel" "$n" || has "concurrent" "$n") && \
     (has "agents" "$n" || has "specialists" "$n" || has "roles " "$n"); then
    score_mmas=3
fi

# ----------------------------------------------------------------------
# Memory stage (agent-kernel) — side-effect, never overrides verdict
# ----------------------------------------------------------------------
# Detect explicit memory commands first
if has "remember " "$n" || has "remember this" "$n" || has "save this rule" "$n" || \
   has "save this memory" "$n" || has "memorize " "$n" || has "memorise " "$n" || \
   has "long-term memory" "$n" || has "long term memory" "$n" || \
   has "add to memory" "$n" || has "store in memory" "$n"; then
    score_memory=5
elif has "what did we" "$n" || has "what did i" "$n" || has "last time we" "$n" || \
     has "past episode" "$n" || has "past conversation" "$n" || \
     has "recall " "$n" || has "search memory" "$n" || \
     has "search past" "$n" || has "search episodes" "$n"; then
    score_memory=4
elif has "memory " "$n" || has " episode " "$n" || has " episodes " "$n" || \
     has "approval inbox" "$n" || has "approve this rule" "$n" || \
     has "propose a rule" "$n" || has "agent-kernel" "$n" || has "ak " "$n"; then
    score_memory=3
elif has "remember" "$n" || has "rule" "$n" || has "policy" "$n" || \
     has "standard" "$n" || has "convention" "$n"; then
    # Subtle signals — only trigger if user explicitly asks about persistent state
    if has "always " "$n" || has "from now on" "$n" || has "going forward" "$n" || \
       has "every time " "$n" || has "never " "$n"; then
        score_memory=2
    fi
fi

# ----------------------------------------------------------------------
# Derived stages
# ----------------------------------------------------------------------
if (( score_think >= 2 )); then
    score_writing=2
fi
if (( score_think >= 2 || score_systematic >= 2 || score_delegate >= 2 )); then
    score_check=2
fi
if (( score_unslop >= 3 || score_delegate >= 2 )); then
    score_qguard=2
fi

# ----------------------------------------------------------------------
# Research path — overrides everything (no code)
# ----------------------------------------------------------------------
if has "research " "$n" || has "investigate " "$n" || has "survey " "$n" || \
   has "study " "$n" || has "explore " "$n" || has "read about" "$n" || \
   has "learn about" "$n" || has "understand how" "$n" || \
   has "understand why" "$n" || has "understand what" "$n"; then
    score_research=4
    score_think=0
    score_unslop=0
    score_delegate=0
    score_mmas=0
    score_systematic=0
fi

# ----------------------------------------------------------------------
# Output
# ----------------------------------------------------------------------
echo "# /mavis-ship route for: "$task""
echo

# Build all stages list
stages=()
append() {
    local s="$1" v="$2"
    if (( v > 0 )); then
        stages+=("$v $s")   # prefix by score for sort
    fi
}

append "/think (Waza)"                       "$score_think"
append "/read + /learn (Waza)"               "$score_research"
append "agent-kernel memory + episode"       "$score_memory"
append "systematic-debugging (superpowers)"  "$score_systematic"
append "unslop audit (UI gate)"              "$score_unslop"
append "writing-plans (superpowers)"         "$score_writing"
append "autoresearch: plan + loop"           "$score_autoresearch"
append "/delegate-team (multi-model)"        "$score_delegate"
append "/mavis-team (MMAS)"                  "$score_mmas"
append "/check (Waza)"                       "$score_check"
append "quality-guard (Mavis)"               "$score_qguard"

if [ ${#stages[@]} -eq 0 ]; then
    echo "TRIVIAL — handle locally, skip the chain."
    exit 0
fi

# Sort by descending score (numeric prefix)
IFS=$'\n'
sorted=($(printf '%s\n' "${stages[@]}" | sort -nr))
unset IFS

echo "Stages (descending score):"
for s in "${sorted[@]}"; do
    # Strip the leading score number for display
    name=${s#* }
    score=${s%% *}
    echo "  • $name (score=$score)"
done

echo
echo "# Verdict:"

# Verdict priority:
# 1. RESEARCH (highest — overrides all)
# 2. MEMORY (agent-kernel — second-highest; pure memory tasks)
# 3. BUILD/PUBLISH (override for publish/release tasks — wins over MMAS!)
# 4. PERFORMANCE/METRIC (autoresearch loop)
# 5. UI DELIVERY (unslop BLOCKING)
# 6. MULTI-AGENT TEAM (MMAS)
# 7. BUG (systematic-debugging)
# 8. FEATURE (/delegate-team)
# 9. Default full chain
is_build_publish=false
if has "publish" "$n" || has "release" "$n" || has " ship " "$n" || has "push " "$n" || \
   has "deploy" "$n" || has "launch" "$n" || has "package it" "$n" || \
   has "cut a release" "$n" || has "build a repo" "$n" || \
   has "build a package" "$n" || has "build a library" "$n" || \
   has "build an sdk" "$n" || has "github" "$n" || has "open-source" "$n" || \
   has "open source" "$n" || has "opensource" "$n"; then
    is_build_publish=true
fi

if (( score_research >= 4 )); then
    echo "RESEARCH path — /read + /learn, no code."
elif (( score_memory >= 4 )); then
    echo "MEMORY path — agent-kernel remember / episode add / search."
elif [ "$is_build_publish" = true ] && (( score_unslop == 0 )); then
    echo "BUILD/PUBLISH path — /delegate-team with minimax-coder default. (build + delivery, not UI)"
elif (( score_autoresearch >= 3 )); then
    echo "PERFORMANCE/METRIC path — autoresearch loop is the engine."
elif (( score_unslop >= 3 )); then
    echo "UI DELIVERY path — unslop audit is BLOCKING before /delegate-team."
elif (( score_mmas >= 3 )); then
    echo "MULTI-AGENT TEAM path — /mavis-team MMAS Atlas+ agents."
elif (( score_systematic >= 3 )); then
    echo "BUG path — systematic-debugging before any patch."
elif (( score_delegate >= 2 )); then
    echo "FEATURE path — /delegate-team with minimax-coder default."
else
    echo "Default full chain."
fi
