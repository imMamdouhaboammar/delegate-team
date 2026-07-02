# MMAS — Multi-Agent System

> **MMAS** is delegate-team's multi-agent team runtime. It spawns 1–8
> specialist agents in parallel, monitors them with a watchdog, and gives you
> a kill switch.

This doc covers the runtime + safety guardrails. For conceptual context, see
[ARCHITECTURE.md](./ARCHITECTURE.md#layer-4--mmas).

---

## When to use MMAS

Use MMAS when:

- The task is genuinely parallelizable (e.g. "audit three services at once",
  "explore N candidate architectures in parallel").
- The task needs multiple specializations (e.g. "scout the codebase, design
  the migration, review the plan, write the docs").
- You want one orchestrator agent (Atlas) to pick the team.

Do **not** use MMAS when:

- The task is sequential by nature ("first analyze, then refactor").
- The task fits one agent cleanly — use `dt run "<task>"` instead.
- You are uncomfortable with subprocess spawning — see
  [SECURITY-MODEL.md](./SECURITY-MODEL.md) first.

---

## CLI

```bash
# Spawn Atlas alone, let it pick the team via team_plan.json
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py "<task>" --atlas

# Spawn a fixed team (max 8 agents)
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py "<task>" \
    --team atlas,forge,scout,oracle

# Check status of a running task
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py status <task_id>

# List available agents
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py list

# Kill a running task
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py stop <task_id>
```

---

## The 8 specialist agents

| Agent | Backend | Category | Role |
|---|---|---|---|
| `atlas` | minimax-coder | planner | Picks the team, writes `team_plan.json` |
| `forge` | minimax-coder | builder | Implements code, runs tests |
| `scout` | minimax-coder | researcher | Searches the codebase, reads docs |
| `oracle` | vertex-coder | reviewer | Reviews architecture and edge cases |
| `librarian` | minimax-coder | archivist | Maintains docs, summaries, indexes |
| `reviewer` | minimax-coder | critic | Code review, style, lint |
| `visionary` | god-agent | strategist | Long-term roadmap, trade-offs |
| `sentinel` | minimax-coder | guard | Policy + safety checks |

Each agent is defined by a YAML file in `mmas/agents/<name>.yaml` — open
them to see exact model + system prompt + tools.

---

## Safety guardrails

### Max agents

Default: **4**. Hard cap: **8** (the number of specialist YAMLs shipped).

```bash
# Override per-invocation
python3 spawn-team.py "<task>" --team atlas,forge,scout,oracle,reviewer,sentinel \
    --max-agents 6
```

If you pass more than `--max-agents`, MMAS refuses to spawn and prints the
limit + the team you asked for.

### Per-agent timeout

Default: **900 seconds (15 minutes)** per agent.

```bash
python3 spawn-team.py "<task>" --team atlas,forge --timeout 1800
```

When a timeout fires, MMAS:

1. Sends `SIGTERM` to the agent.
2. Waits 30 seconds for graceful exit.
3. Sends `SIGKILL` if the agent is still alive.
4. Marks the agent as `timeout` in `boulder.json`.
5. Continues monitoring the rest of the team.

### Session workspace

Every task gets a sandboxed workspace:

```
~/.mavis/multi-agent/tasks/<task_id>/
├── boulder.json       # task + agent state
├── team_plan.json     # Atlas's plan (only in --atlas mode)
├── logs/
│   ├── atlas.log
│   ├── forge.log
│   └── ...
└── watchdog.log
```

Agents run with `cwd=<task_dir>` and `start_new_session=True`. They cannot
write outside the task directory unless explicitly allowed via
`--allow-workspace-escape`.

### Plan-only mode

```bash
python3 spawn-team.py "<task>" --team atlas --plan-only
```

In plan-only mode:

- Atlas runs and writes `team_plan.json` as usual.
- All other agents are skipped.
- No subprocess is spawned for the rest of the team.

Use this to review Atlas's plan before committing to a full run.

### No-write mode

```bash
python3 spawn-team.py "<task>" --team atlas,scout --no-write
```

Agents can read files and produce logs, but cannot write outside `logs/`.
Used for audit runs.

### Kill switch

```bash
python3 spawn-team.py stop <task_id>
```

Sends `SIGTERM` to the watchdog and every spawned agent. Waits 5 seconds,
then `SIGKILL`s anything still alive. Updates `boulder.json` with the stop
event.

You can also kill by PID directly:

```bash
kill -TERM <watchdog_pid>
```

The watchdog catches the signal and kills its child agents before exiting.

---

## Configuration

Defaults are stored at `~/.mavis/multi-agent/config.json` and can be
overridden per-invocation:

```json
{
  "maxAgents": 4,
  "timeoutSeconds": 900,
  "writeMode": "workspace",
  "logsEnabled": true,
  "watchdogInterval": 30,
  "atlasTimeout": 120,
  "killGracePeriod": 5
}
```

`writeMode` values:

- `workspace` — agents can write anywhere inside the task dir.
- `logs-only` — agents can write only to `logs/`.
- `none` — agents are read-only (alias for `--no-write`).

---

## Logs and reports

### Per-agent logs

```
logs/<agent>.log         # raw subprocess stdout/stderr
logs/<agent>.summary     # agent's final summary (written by the agent)
```

### Task-level report

After a run completes (or is killed), MMAS writes a `report.json` at the
task root:

```json
{
  "task_id": "...",
  "task": "...",
  "started_at": "...",
  "completed_at": "...",
  "duration_seconds": 1234,
  "status": "completed | killed | timeout | error",
  "agents": [
    {
      "name": "...",
      "status": "...",
      "exit_code": 0,
      "duration_seconds": 123,
      "summary_file": "..."
    }
  ],
  "stop_reason": "...",
  "events": ["...", "..."]
}
```

### Manual summary

For an interactive summary without running anything:

```bash
python3 spawn-team.py status <task_id>     # one-liner per agent
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Task not found: <task_id>` | typo or already cleaned up | `ls ~/.mavis/multi-agent/tasks/` |
| Agent stuck in `running` for hours | timeout not configured | `--timeout 1800` |
| `spawn-team.py: permission denied` | not `chmod +x` | `chmod +x ~/.mavis/agents/mavis/multi-agent/spawn-team.py` |
| `agent-kernel` not found in MMAS | optional dep missing | run `agent-kernel doctor` |
| Watchdog never finishes | `--interval` too low | `--interval 30` (default) |
| Hardcoded `${DELEGATE_TEAM_ROOT}` error | stale install | reinstall Lane 3 |

---

## What's deliberately NOT in MMAS

- **Cross-machine coordination.** MMAS is local-only. For distributed runs,
  run multiple instances on separate machines with separate task IDs.
- **Resource quotas.** MMAS does not enforce CPU/RAM caps. Use OS-level
  cgroups or `nice` if you need them.
- **Persistent agent memory.** Agents read agent-kernel memory at start but
  do not write back to it during the run. Episodes are written at task
  completion by the orchestrator, not by MMAS.

These are explicit non-goals. If you need them, please open an issue.