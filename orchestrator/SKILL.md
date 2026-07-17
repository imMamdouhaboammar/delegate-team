---
name: apeiron
description: |
  The ONE-COMMAND orchestrator that wires the full delegate-team arsenal for any task in any
  project. Use when the user says "use everything you got", "use full engineering
  arsenal", "go all-in", "/Apeiron <task>", "/ship <task>", "use all capabilities",
  "full stack", "end to end", "everything intelligently". Composes: Waza /think →
  unslop audit → superpowers writing-plans → autoresearch | /delegate-team | /apeiron-team
  (routed by task signature) → Waza /check → quality-guard. Skip this skill only when
  the user wants a SPECIFIC tool (e.g. "run /autoresearch with metric X" or "delegate
  to aonios-agent").
allowed-tools: [Bash, Read, Write, Edit, Grep, Glob, TodoWrite]
---

# /Apeiron — the orchestrator

> **The single switch** that exposes the full delegate-team arsenal under one natural-language
> command. Type `/Apeiron "<task>"` and the orchestrator does the rest.

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
| "delegate to aonios-agent" | `/delegate-team aonios-agent` directly |
| "spawn atlas + forge" | `/apeiron-team atlas forge` directly |
| "explain X to me" | direct answer, no orchestration |
| "research X" | `/read` + `/learn` only |

## The 7-layer chain

```
[Apeiron "<task>"]
    │
    ▼ 1. WAZA /think
   Pressure-test the idea. Decision-complete plan. User approves.
    │
    ▼ 2. UNSLOP-PREFLIGHT audit   (only if UI task)
   Score must be ≥70 to proceed. BLOCKING.
    │
    ▼ 3. SUPERPOWERS writing-plans
   Convert /think output into checkpoint-style plan.
    │
    ▼ 4. ROUTE (auto-decided by signature)
   ┌─ metric-driven      → autoresearch:plan + loop
   ├─ heavy multi-file  → /delegate-team (minimax-coder | aonios-agent | vertex-coder)
   ├─ parallel special  → /apeiron-team (MMAS)
   └─ trivial            → execute locally, skip the rest
    │
    ▼ 5. EXECUTE (routed tool runs)
   Apeiron supervises. Failures route to /hunt.
    │
    ▼ 6. WAZA /check
   Review the diff with evidence. Project-aware constraints surfaced.
    │
    ▼ 7. quality-guard (Apeiron)
   5-layer pre-delivery check: mechanical / definition-of-done / security
   / AI-smells / project-specific.
    │
    ▼
   SHIP — or stop with audit findings.
```

## Routing intelligence (skill)

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

## Helper script

For automated routing decisions (skip the prompt-asking step), use the bundled
`scripts/orchestrate.sh` which detects the task signature and prints the route:

```bash
~/.apeiron/skills/apeiron/scripts/orchestrate.sh "<task>"
# → think → unslop → writing-plans → delegate-team → check → quality-guard
```

## Worked examples

```bash
# 1. Performance
/Apeiron "Make API p95 < 200ms"
# Route: /think → autoresearch:plan → autoresearch:fix → autoresearch:regression → /check

# 2. UI feature  
/Apeiron "Build a CLI to convert CSV to JSON"  # not actually UI but CLI
# Route: /think → writing-plans → /delegate-team

# 3. Bug fix
/Apeiron "Mobile header wrong on Safari iOS 17"
# Route: /think → systematic-debugging → /hunt → /delegate-team → /check

# 4. Design only
/Apeiron "Design the auth flow before implementing"
# Route: /think → STOP (pressure-test only)

# 5. Trivial
/Apeiron "rename getCurrentUser to getActiveUser across src/"
# Skip orchestrator. Run sed directly.
```

## Composition table

```
            Waza     Superpowers  Unslop   autoresearch   /delegate-team  /apeiron-team   Waza    Apeiron
            /think   brainstorming audit    loop           multi-model      MMAS         /check  quality-guard
           ────────────────────────────────────────────────────────────────────────────────────────────────
research     ✓                                  ✓ (read/learn)
trivial                           ✓                                                     ✓
bug           ✓        ✓                                          ✓                       ✓
feature UI    ✓                                          ✓          ✓                       ✓        ✓
feature BE    ✓                                          ✓          ✓                       ✓        ✓
perf metric   ✓                               ✓                                            ✓        ✓
refactor      ✓                                          ✓          ✓                       ✓        ✓
design only   ✓
```

## File routing

When `/Apeiron "<task>"` lands in this session, follow the chain literally.
Track each stage with a todo. Don't batch stages — each stage's evidence
feeds the next.
