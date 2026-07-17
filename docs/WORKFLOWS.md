# Workflows

> Real examples of `/apeiron "<task>"` and `dt run "<task>"`, grouped by
> the routing verdict they trigger.

Each example shows the input, the verdict, the trace file location, and the
expected execution path.

---

## 1. Trivial edit → handle locally

```bash
/apeiron "rename userId to user_id in src/auth.ts"
```

Verdict: `TRIVIAL — handle locally, skip the chain.`

No trace, no orchestrator stages. The slash command just renames the
identifier. Suitable for edits a competent agent could do in one shot.

---

## 2. Bug fix → BUG path

```bash
/apeiron "the Safari iOS header is rendering wrong, regression in PR #142"
```

Verdict: `BUG path — systematic-debugging before any patch.`

Stages:

1. `/think (Waza)` — re-state the bug + hypotheses
2. `systematic-debugging (superpowers)` — reproduce, isolate, fix
3. `writing-plans (superpowers)` — write a regression test
4. `/delegate-team (multi-model)` — execute the patch
5. `/check (Waza)` + `quality-guard (Mavis)` — verify
6. `agent-kernel episode add` — capture for next session

Trace: `.logs/routing/<timestamp>.json`.

---

## 3. UI task → UI DELIVERY path

```bash
/apeiron "build a pricing page with shadcn components"
```

Verdict: `UI DELIVERY path — unslop audit is BLOCKING before /delegate-team.`

Stages:

1. `/think (Waza)`
2. `unslop audit (UI gate)` — **BLOCKING**, must score ≥ 70
3. `writing-plans (superpowers)`
4. `/delegate-team (multi-model)`
5. `/check (Waza)` + `quality-guard (Mavis)`
6. `agent-kernel episode add`

If the unslop audit returns < 70, the chain stops and the user gets a report
explaining why the page would have looked generic.

---

## 4. Performance / metric task → PERFORMANCE/METRIC path

```bash
/apeiron "make the API p95 < 200ms"
```

Verdict: `PERFORMANCE/METRIC path — autoresearch loop is the engine.`

Stages:

1. `/think (Waza)` — instrument first
2. `writing-plans (superpowers)` — metric-driven plan
3. `autoresearch: plan + loop` — iterate on the metric
4. `/check (Waza)` + `quality-guard (Mavis)`
5. `agent-kernel episode add`

The autoresearch loop runs until the metric target is hit or the user aborts.

---

## 5. Multi-agent team → MULTI-AGENT TEAM path

```bash
/apeiron "spawn a squad of specialists to audit the migration"
```

Verdict: `MULTI-AGENT TEAM path — /mavis-team MMAS Atlas+ agents.`

Stages:

1. `/think (Waza)`
2. MMAS Atlas mode — Atlas picks the team, writes `team_plan.json`, then the
   chosen specialists spawn
3. Watchdog monitors each agent's `boulder.json`
4. Per-agent summaries collected at `~/.mavis/multi-agent/tasks/<task_id>/`
5. `/check (Waza)` + `quality-guard (Mavis)`
6. `agent-kernel episode add`

See [MMAS.md](./MMAS.md) for the runtime details and guardrails.

---

## 6. Build / publish / release → BUILD/PUBLISH path

```bash
/apeiron "publish v0.2.0 to npm and create the GitHub release"
```

Verdict: `BUILD/PUBLISH path — /delegate-team with minimax-coder default.`

Stages:

1. `/think (Waza)` — bump version, run CI, write release notes
2. `writing-plans (superpowers)` — release checklist
3. `/delegate-team (multi-model)` — execute the release
4. `/check (Waza)` + `quality-guard (Mavis)`
5. `agent-kernel episode add`

Note: the BUILD/PUBLISH path overrides the UI gate, so the orchestrator will
not block on unslop just because the project happens to have a UI.

---

## 7. Memory / recall → MEMORY path

```bash
/apeiron "remember this rule: always pin Python deps"
/apeiron "what did we do about Supabase last time?"
/apeiron "search past episodes for offline support"
```

Verdict: `MEMORY path — agent-kernel remember / episode add / search.`

Stages:

1. agent-kernel memory search (always runs first in MEMORY path)
2. agent-kernel episode search (looks across past sessions)
3. (optional) `/think` + writing-plans if the user also wants to act on the
   recall
4. agent-kernel episode add at the end

If `~/.agent-kernel/` is not installed, the orchestrator prints a soft
warning and skips the memory stages — the verdict remains valid, just without
memory recall.

---

## 8. Research → RESEARCH path

```bash
/apeiron "research what other teams do for retry backoff in queue workers"
```

Verdict: `RESEARCH path — /read + /learn, no code.`

Stages:

1. `/read + /learn (Waza)` — gather + synthesize
2. (optional) agent-kernel episode add if user wants to capture the research

No code changes, no backend dispatch. Output is a written summary.

---

## 9. Default full chain

When none of the strong signals match:

Verdict: `Default full chain.`

Stages: `/think → agent-kernel memory search → writing-plans → /delegate-team
→ /check → quality-guard → agent-kernel episode add`.

Use this when the task doesn't obviously match a special verdict.

---

## Inspecting routing decisions

Every invocation writes a structured trace:

```
.logs/routing/<YYYY-MM-DDTHH-MM-SS>.json
```

Each trace contains:

```json
{
  "task": "...",
  "detected_signals": { "...": <score>, ... },
  "selected_workflow": "...",
  "selected_stages": ["..."],
  "reasons": ["..."],
  "skipped_stages": ["..."],
  "timestamp": "..."
}
```

Use `dt route --explain "<task>"` to print the trace for a task without
running the full chain. See [ROUTING.md](./ROUTING.md).

---

## Common shapes that trip the router

| Phrase | Verdict | Why |
|---|---|---|
| "fix the bug where Safari iOS shows the wrong header" | BUG | `fix`, `bug`, `wrong` |
| "design a new onboarding flow" | UI DELIVERY (or FEATURE) | `design` + `flow` |
| "ship v1.0 to npm" | BUILD/PUBLISH | `ship`, `npm` |
| "spawn a swarm of specialists to refactor the auth layer" | MULTI-AGENT TEAM | `swarm`, `specialists` |
| "remember: never use local SQLite fallback" | MEMORY | `remember:` |
| "what did we do about X last time" | MEMORY | `what did we`, `last time` |
| "research React Server Components in 2026" | RESEARCH | `research` |
| "rename `foo` to `bar`" | TRIVIAL | `rename` |
| "make the API faster" | PERF or FEATURE | `faster` → autoresearch, else delegate |

If you suspect the router picked the wrong verdict, run:

```bash
apeiron "<task>"     # see the verdict without execution
dt route --explain "<task>"    # print the JSON trace
```

Then either rephrase the task or, if the verdict is clearly wrong, open an
issue with the trace JSON attached.