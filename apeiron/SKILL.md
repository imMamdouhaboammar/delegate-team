---
name: apeiron
description: |
  The ONE-COMMAND orchestrator that wires the full delegate-team arsenal for any task in any
  project. Use when the user says "use everything you got", "use full engineering
  arsenal", "go all-in", "/Apeiron <task>", "/ship <task>", "use all capabilities",
  "full stack", "end to end", "everything intelligently". Composes 38 curated
  integrations (superpowers, Waza, unslop, autoresearch, agent-kernel, ...) and routes
  tasks through 7-stage autopilot chain (PREWARM → BRAINSTORM → PLAN → EXECUTE →
  REVIEW → QUALITY-GUARD → REPORT). Auto-discovers 1890+ skills across 3 sources
  (mavis, agents, claude) with intelligent dedupe. Includes apeiron-uni — the
  smart universal wrapper that detects the calling runtime (Mavis / codex / claude /
  gemini / opencode / mmx / shell) and dispatches the right flow. Skip this skill
  only when the user wants a SPECIFIC tool (e.g. "run /autoresearch with metric X"
  or "delegate to god-agent").
allowed-tools: [Bash, Read, Write, Edit, Grep, Glob, TodoWrite, Task, Skill, WebFetch, WebSearch]
---

# /Apeiron — the orchestrator

> **The single switch** that exposes the full delegate-team arsenal under one natural-language
> command. Type `/Apeiron "<task>"` and the orchestrator does the rest.

## What this skill IS

A **bundle** that exposes the full Mavis arsenal under one natural-language command.
Bundles:

1. **`orchestrate.py`** — 47-case routing selftest; routes by task signature to the
   right chain (FEATURE / BUG / UI / PERFORMANCE / RESEARCH / TRIVIAL / MULTI-AGENT).
2. **`catalog.py`** — 38 curated integrations + 1890 unique skills auto-discovered
   from `~/.mavis/skills/`, `~/.agents/skills/`, `~/.claude/skills/` (with dedupe).
3. **`autopilot.sh`** — the GOD command: 7-stage chain (PREWARM → BRAINSTORM with
   superpowers + codex gpt-5.5-high → PLAN → EXECUTE → REVIEW → QUALITY-GUARD →
   REPORT). Runs in foreground or `--background`.
4. **`apeiron-uni`** — smart universal wrapper: detects calling runtime and
   dispatches the right flow (Mavis → prewarm; agents → autopilot --background;
   shell → autopilot foreground).

## Outcome contract

- **Outcome**: A task entered as natural language → routed through the right stack →
  shipped (or audit-blocked if quality gates fail).
- **Done when**: every stage green OR explicit user override, with evidence at each step.
- **Evidence**: skill outputs, unslop audit score, autoresearch deltas, code review
  findings, quality-guard pass.
- **Output**: shipped code (or blocked-task report with reasons).

## When to use this skill (the DEFAULT)

| User said | Orchestrator does |
|---|---|
| `<any task>` and they want full leverage | full chain, route by signature |
| "use everything", "all-in", "go crazy" | full chain |
| "I have a feature / bug / perf task" | abbreviated chain based on signature |
| `<UI task>` | unslop audit is BLOCKING (score ≥70) |
| `<trivial edit>` | skip chain, handle locally |

## When NOT to use this skill

| User said | Use instead |
|---|---|
| "run /autoresearch with metric X" | `/autoresearch` directly |
| "delegate to god-agent" | `/delegate-team god-agent` directly |
| "spawn atlas + forge" | `/mavis-team atlas forge` directly |
| "explain X to me" | direct answer, no orchestration |
| "research X" | `/read` + `/learn` only |

## Usage

### From any Mavis session (canonical):

```bash
Apeiron "<task>"
# → orchestrate emits JSON manifest → Mavis loads skills → executes
```

### From any agent (codex, claude, gemini, opencode, mmx):

```bash
apeiron-uni "<task>"
# → autopilot --background (returns PID + log path; agent can move on)
```

### From plain shell:

```bash
apeiron-uni "<task>"
# → autopilot foreground (you watch the log scroll)
```

### Direct (bypass the smart wrapper):

```bash
# Get the route + plan only (no execution)
orchestrate.py --prewarm "<task>"

# Run the full chain in foreground
autopilot.sh "<task>"

# Run the full chain in background
autopilot.sh "<task>" --background

# Dry-run (just show the plan)
autopilot.sh --dry-run "<task>"
```

## The 7-layer chain (autopilot.sh)

```
[Apeiron "<task>"]
    │
    ▼ 1. PREWARM (orchestrate.py + catalog.py)
       Detect task signature → load relevant skills → emit manifest JSON
       Backend selection: codex (PERFORMANCE), claude (UI), minimax (BUILD/BUG/FEATURE)
    │
    ▼ 2. BRAINSTORM (superpowers:brainstorming + codex gpt-5.5-high)
       The mix: superpowers enforces 'no diving into code without a design'.
       Codex gpt-5.5-high provides the highest-quality ideation.
    │
    ▼ 3. PLAN (superpowers:writing-plans)
       Convert brainstorm into checkpoint-style plan with evidence gates.
    │
    ▼ 4. EXECUTE (delegate-team → backend agent)
       Hand off to dt with the brief. Backend writes the code.
    │
    ▼ 5. REVIEW (waza:check)
       Project-aware review with evidence. Surface constraints.
    │
    ▼ 6. QUALITY-GUARD (5-layer pre-delivery check)
       Layer 1: mechanical (lint/typecheck/test/build)
       Layer 2: definition-of-done
       Layer 3: security
       Layer 4: AI-smells
       Layer 5: project-specific
    │
    ▼ 7. REPORT
       Markdown report with all evidence + next steps for the user.
```

## Routing intelligence (47 cases, 100% selftest passing)

```python
signature = detect(task)
# detect():
#   has_metric = re.search(r'(\d+)%|p\d+|p \d+|< \d|>\d+|reduce.*by|increase.*by', task)
#   is_ui = 'frontend' in task or 'ui' in task or 'design' in task or 'page' in task
#   is_bug = 'fix' in task or 'broken' in task or 'regression' in task
#   is_research = 'research' in task or 'learn' in task or 'understand' in task
#   is_trivial = len(task) < 60 and 'fix' not in task

if is_research:
    return ["read", "learn"]
if is_trivial:
    return ["local"]
if is_bug:
    return ["think", "systematic-debugging", "hunt", "delegate-team", "check"]
if has_metric:
    return ["think", "autoresearch:plan", "autoresearch:fix", "autoresearch:regression"]
if is_ui:
    return ["think", "unslop", "writing-plans", "delegate-team", "check", "quality-guard"]
return ["think", "writing-plans", "delegate-team", "check", "quality-guard"]
```

## Worked examples

```bash
# 1. Performance (PERFORMANCE path)
Apeiron "Make API p95 < 200ms"
# → autoresearch loop is the engine, then quality-guard

# 2. UI feature (UI DELIVERY path)
Apeiron "Build a beautiful settings page with dark mode"
# → unslop audit is BLOCKING (score≥70) before delegate-team

# 3. Bug fix (BUG path)
Apeiron "Mobile header wrong on Safari iOS 17"
# → debug-issue before any patch, then quality-guard

# 4. Plain feature (FEATURE path)
Apeiron "Build a TypeScript CLI that converts CSV to JSON"
# → delegate-team (→ mini-coder-max), then quality-guard

# 5. Trivial (TRIVIAL path)
Apeiron "rename getCurrentUser to getActiveUser across src/"
# → handle locally, skip the chain
```

## Files in this skill

- `SKILL.md` — this file (skill manifest)
- `scripts/orchestrate.py` — router (47-case selftest, v4.1.0)
- `scripts/orchestrate.sh` — bash wrapper that delegates to orchestrate.py
- `scripts/catalog.py` — 38 integrations + 1890 skills indexer
- `scripts/.DS_Store`, `scripts/__pycache__/` — local artifacts (gitignored)

## Helper scripts

The apeiron-uni + autopilot.sh scripts are also part of this arsenal but live in
`~/delegate-team/bin/` (the central symlink bin). They are installed alongside this
skill by `install.sh` (the delegate-team installer).

## Companion frameworks (lazy-loaded on demand)

| Framework | What it adds | Install via |
|---|---|---|
| **superpowers** | Methodology — brainstorm-first hard gate, TDD, review | bundled |
| **Waza** | Entry-point skills — /think /check /hunt /ui | bundled |
| **unslop-preflight** | UI quality gate — 23 gates block generic slop | bundled |
| **autoresearch** | Metric-driven iteration loop | bundled |
| **agent-kernel** | Local-first memory + governance layer | bundled |
| **delegate-team** | The CLI gateway + multi-model router | bundled |

## Compatibility

| Agent | Install | Status |
|---|---|---|
| Mavis session | `install.sh --all` | ✅ canonical |
| Claude Code | `npx skills add imMamdouhaboammar/delegate-team` | ✅ via `~/.claude/skills/apeiron/` |
| Codex | `npx skills add ...` | ✅ via `~/.codex/skills/` |
| Cursor | `npx skills add ...` | ✅ via `~/.agents/skills/` |
| Copilot, Windsurf, OpenCode, 60+ more | `npx skills add ...` | ✅ via `~/.{tool}/skills/` |

## License

MIT — see https://github.com/imMamdouhaboammar/delegate-team

## Repository

https://github.com/imMamdouhaboammar/delegate-team/tree/master/apeiron