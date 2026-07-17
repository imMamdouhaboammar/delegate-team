# Routing

> How `/apeiron` decides which stages a task should go through.

This doc covers the orchestrator's signal-scoring algorithm, the verdict
priority, and how to inspect the decision.

---

## Overview

`orchestrator/scripts/orchestrate.py` is a Python-based scorer (wrapped by `orchestrate.sh`). For every
task string, it:

1. Lowercases the task.
2. Scores 11 stage signals against keyword regexes.
3. Resolves verdict priority (some signals override others).
4. Sorts stages by descending score.
5. Writes a structured trace to `.logs/routing/<timestamp>.json`.
6. Prints a human-readable summary.

The script is **advisory only**. It does not execute code. Execution is
driven by the SKILL.md at `orchestrator/SKILL.md`, which tells the agent
which tools to call in which order.

---

## The 11 signals

| Signal | What it detects | Stage it feeds |
|---|---|---|
| `score_research` | `research`, `investigate`, `survey`, `study`, `explore`, `read about`, `learn about`, `understand how/why/what` | `/read + /learn (Waza)` |
| `score_memory` | `remember`, `save this rule`, `long-term memory`, `what did we`, `last time`, `recall`, `search memory`, `episode`, `agent-kernel`, `ak` | `agent-kernel memory + episode` |
| `score_think` | `plan`, `design`, `architect`, `how should`, `what's the best`, `approach`, `strategy`, `build`, `create`, `implement`, `add a`, `develop`, `scaffold`, `generate` | `/think (Waza)` |
| `score_writing` | derived from `score_think >= 2` | `writing-plans (superpowers)` |
| `score_systematic` | `fix`, `debug`, `bug`, `broken`, `regression`, `failing`, `fails`, `crash`, `leak`, `undefined`, `error`, `exception`, `hang`, `wrong`, `not working` | `systematic-debugging (superpowers)` |
| `score_unslop` | UI-only: `ui`, `frontend`, `front-end`, `landing page`, `pricing page`, `dashboard page`, `component`, `layout`, `css`, `tailwind`, `shadcn`, `modal`, `form`, `design system`, `color palette`, `typography` — **but only if no `api`, `backend`, `server`, `cli`, `terminal`, `agentic`** | `unslop audit (UI gate)` |
| `score_autoresearch` | Has measurable metric: `%`, `< N`, `> N`, `p95`, `p99`, `coverage`, `latency`, `bundle size`, `throughput`, `memory`, `rps`, `qps`, `perf`, `performance`, `slow`, `faster`, `optimize`, `reduce`, `minimize` | `autoresearch: plan + loop` |
| `score_delegate` | Heavy multi-file work: `refactor`, `migrat`, `overhaul`, `rewrite`, `across`, `multi-file`, `architecture`, `integrate`, `service`, `module`; also derived default if `score_think >= 2` | `/delegate-team (multi-model)` |
| `score_mmas` | Strong multi-agent signals: `squad`, `swarm`, `crew`, `multi-agent`, `parallel agents`, `concurrent agents`, `spawn a team`, `team of agents`, `agent crew`, `division of labor`, `specialize`, `parallel + agents/specialists/roles` | `/apeiron-team (MMAS)` |
| `score_check` | derived from `score_think >= 2` or `score_systematic >= 2` or `score_delegate >= 2` | `/check (Waza)` |
| `score_qguard` | derived from `score_unslop >= 3` or `score_delegate >= 2` | `quality-guard (Apeiron)` |

### BUILD/PUBLISH override

If any of these tokens appear, the orchestrator treats the task as a
build/publish/release/deploy and **overrides** accidental UI/multimatch scores:

`publish`, `release`, ` ship `, `push `, `deploy`, `launch`, `package it`,
`cut a release`, `build a repo`, `build a package`, `build a library`,
`build an sdk`, `github`, `open-source`, `open source`, `opensource`,
`contribute`.

This means "publish a UI library" routes to BUILD/PUBLISH, not UI DELIVERY.

---

## Verdict priority

When multiple signals fire, the orchestrator picks a single verdict string:

1. **RESEARCH** — `score_research >= 4`. Overrides everything. No code.
2. **MEMORY** — `score_memory >= 4`. agent-kernel memory + episode search.
3. **BUILD/PUBLISH** — matched BUILD keywords AND `score_unslop == 0`.
4. **PERFORMANCE/METRIC** — `score_autoresearch >= 3`. autoresearch loop.
5. **UI DELIVERY** — `score_unslop >= 3`. unslop audit is BLOCKING.
6. **MULTI-AGENT TEAM** — `score_mmas >= 3`. /apeiron-team MMAS Atlas+.
7. **BUG** — `score_systematic >= 3`. systematic-debugging before patch.
8. **FEATURE** — `score_delegate >= 2`. /delegate-team with default backend.
9. **Default full chain** — none of the above. Run all stages.

The verdict is a routing label, not a guarantee of execution. The SKILL.md
uses it to decide what stages to actually invoke.

---

## Inspecting a decision

### Quick check (no trace)

```bash
apeiron "Build a pricing page with shadcn components"
```

Output:

```
# /apeiron route for: "Build a pricing page with shadcn components"

Stages (descending score):
  • unslop audit (UI gate)        (score=4)
  • /think (Waza)                 (score=2)
  • writing-plans (superpowers)   (score=2)
  • /delegate-team (multi-model)  (score=2)
  • /check (Waza)                 (score=2)
  • quality-guard (Apeiron)         (score=2)

# Verdict:
UI DELIVERY path — unslop audit is BLOCKING before /delegate-team.
```

### Trace (JSON)

```bash
dt route --explain "Build a pricing page with shadcn components"
```

Output (pretty-printed):

```json
{
  "task": "Build a pricing page with shadcn components",
  "detected_signals": {
    "publish_release_build": 0,
    "ui_frontend": 4,
    "bug_fix": 0,
    "metrics_research": 0,
    "memory_recall": 0,
    "multi_agent": 0
  },
  "selected_workflow": "UI DELIVERY",
  "selected_stages": [
    "/think (Waza)",
    "unslop audit (UI gate)",
    "writing-plans (superpowers)",
    "/delegate-team (multi-model)",
    "/check (Waza)",
    "quality-guard (Apeiron)"
  ],
  "reasons": [
    "ui_frontend=4 (matched: pricing page, shadcn)",
    "writing-plans derived from /think",
    "quality-guard derived from unslop and delegate"
  ],
  "skipped_stages": [
    "systematic-debugging (not a bug)",
    "autoresearch: plan + loop (no metric)",
    "agent-kernel memory + episode (no memory keywords)",
    "/apeiron-team MMAS (no multi-agent signals)"
  ],
  "timestamp": "2026-06-30T12:34:56Z"
}
```

The trace is also written to:

```
.logs/routing/2026-06-30T12-34-56.json
```

### Persisted trace (post-hoc)

Every orchestrator invocation appends to `.logs/routing/`. To list:

```bash
ls -lt .logs/routing/ | head -5
cat .logs/routing/$(ls -t .logs/routing/ | head -1) | jq .
```

---

## Common routing patterns

| Task shape | Verdict | Why |
|---|---|---|
| "build a pricing page with shadcn" | UI DELIVERY | ui_frontend=4 |
| "fix Safari iOS rendering bug" | BUG | bug_fix=3 |
| "ship v1.0 to npm" | BUILD/PUBLISH | publish keyword |
| "spawn a squad of specialists" | MULTI-AGENT TEAM | squad + specialists |
| "make API p95 < 200ms" | PERF/METRIC | metric detected |
| "remember: never use local SQLite fallback" | MEMORY | remember keyword |
| "research React Server Components" | RESEARCH | research keyword |
| "rename foo to bar" | TRIVIAL | rename + trivial exit |

See [WORKFLOWS.md](./WORKFLOWS.md) for full examples per verdict.

---

## Tuning the router

The scorer is in `orchestrator/scripts/orchestrate.py`. To add a new signal:

1. Define a `score_<name>` variable.
2. Add a keyword block that increments it.
3. Append to the `stages` list with `append`.
4. Add a verdict case in the verdict block.

Always add at least one routing test in `.github/workflows/ci.yml`
(`orchestrator-tests` job) before opening a PR.

---

## When the router is wrong

1. Run `dt route --explain "<task>"` and capture the JSON.
2. Confirm which signal misfired (or didn't fire when it should).
3. Either:
   - Rephrase the task to nudge the right signal.
   - Open an issue with the trace JSON attached.

The orchestrator's regexes are deliberately conservative — they prefer to
not fire a signal than to fire it incorrectly. If you find a frequent false
negative, please open an issue.

---

## What this doc does not cover

- The agent-kernel memory layer that the memory stage calls into — see
  [AGENT-KERNEL-INTEGRATION.md](./AGENT-KERNEL-INTEGRATION.md).
- The MMAS runtime that the multi-agent stage calls into — see
  [MMAS.md](./MMAS.md).
- The execution order enforced by the SKILL.md — see
  `orchestrator/SKILL.md`.