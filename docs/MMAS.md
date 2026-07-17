# MMAS — Multi-Agent System

> **MMAS** is delegate-team's local multi-agent team runtime. It spawns 1–8
> specialist agents in parallel, records their process groups, monitors them
> with a watchdog, and gives you a process-group aware kill switch.

This doc covers the runtime + safety guardrails. For conceptual context, see
[ARCHITECTURE.md](./ARCHITECTURE.md#layer-4--mmas).

---

## When to use MMAS

Use MMAS when:

- The task is genuinely parallelizable, such as auditing several services at once.
- The task needs multiple specializations, such as scout, reviewer, docs, and guard.
- You want Atlas to pick the team through `team_plan.json`.

Do **not** use MMAS when:

- The task is sequential by nature.
- The task fits one agent cleanly. Use `dt run "<task>"` instead.
- You are uncomfortable with subprocess spawning. Read
  [SECURITY-MODEL.md](./SECURITY-MODEL.md) first.

---

## Requirements

- Python `>=3.10`.
- PyYAML installed.
- Bash for `watchdog.sh`.
- Backend CLIs or credentials for whichever agents you select.

---

## CLI

```bash
# Spawn Atlas alone, let it pick the team via team_plan.json
dt mmas spawn "<task>" --atlas
# Or raw: python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py "<task>" --atlas

# Spawn a fixed team
dt mmas spawn "<task>" --team atlas,forge,scout,oracle
# Or raw: python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py "<task>" --team atlas,forge,scout,oracle

# Preview without spawning
dt mmas spawn "<task>" --team atlas,forge --plan-only

# Check status of a running task
dt mmas status <task_id>

# List available agents
dt mmas list

# Kill a running task with process-group cleanup
dt mmas stop <task_id>

# Generate a report from boulder.json
dt mmas report <task_id>
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
| `visionary` | aonios-agent | strategist | Long-term roadmap, trade-offs |
| `sentinel` | minimax-coder | guard | Policy + safety checks |

Each agent is defined by a YAML file in `mmas/agents/<name>.yaml`.

---

## Safety guardrails

### Max agents

Default: **4**. Hard cap: **8**.

```bash
python3 spawn-team.py "<task>" --team atlas,forge,scout,oracle,reviewer,sentinel \
    --max-agents 6
```

If you pass more than `--max-agents`, MMAS refuses to spawn and prints the
limit + the team you asked for.

### Per-agent timeout

Default: **900 seconds (15 minutes)** per agent. Hard cap: **7200 seconds**.

```bash
python3 spawn-team.py "<task>" --team atlas,forge --timeout 1800
```

### Kill grace

Default: **5 seconds**. Hard cap: **30 seconds**.

```bash
python3 spawn-team.py "<task>" --team atlas,forge --kill-grace 10
```

### Process-group cleanup

Every agent and watchdog subprocess is spawned with `start_new_session=True`.
That creates a detached process group. MMAS records both `pid` and `pgid` in
`boulder.json`.

The stop command now:

1. Sends `SIGTERM` to the watchdog process group.
2. Sends `SIGTERM` to every agent process group.
3. Waits for the configured grace period.
4. Sends `SIGKILL` to groups whose original PID is still alive.
5. Marks affected agents as `stopped` and writes a stop event.

This matters because killing only the parent PID can leave child processes alive
when an agent starts a nested CLI or tool process.

### Atlas timeout cleanup

In `--atlas` mode, Atlas is spawned first and must write `team_plan.json` before
`--atlas-timeout`. If it does not, MMAS now terminates the Atlas process group
and marks the task as `timeout` with `stop_reason=atlas_timeout`.

### Session workspace

Every task gets a workspace:

```
~/.apeiron/multi-agent/tasks/<task_id>/
├── boulder.json       # task + agent state
├── team_plan.json     # Atlas's plan, only in --atlas mode
├── logs/
│   ├── atlas.log
│   ├── forge.log
│   └── ...
└── watchdog.log
```

Agents run with `cwd=<task_dir>`. Treat that directory as the operational
boundary for a run.

### Plan-only mode

```bash
python3 spawn-team.py "<task>" --team atlas --plan-only
```

In plan-only mode, MMAS prints the planned team and exits before spawning any
agent. Use this to review scope and guardrails before a full run.

### No-write mode

```bash
python3 spawn-team.py "<task>" --team atlas,scout --no-write
```

`--no-write` maps to `--write-mode none`. This is primarily a guardrail signal
for agents and logs. It does not replace OS-level sandboxing.

---

## `boulder.json` state

A task state file includes process metadata:

```json
{
  "task_id": "task-...",
  "status": "running",
  "watchdog_pid": 12345,
  "watchdog_pgid": 12345,
  "guardrails": {
    "maxAgents": 4,
    "timeoutSeconds": 900,
    "writeMode": "workspace",
    "killGracePeriod": 5
  },
  "agents": [
    {
      "name": "atlas",
      "pid": 12346,
      "pgid": 12346,
      "status": "running",
      "log_file": ".../logs/atlas.log",
      "summary_file": ".../logs/atlas.summary"
    }
  ],
  "events": []
}
```

---

## Logs and reports

### Per-agent logs

```
logs/<agent>.log         # raw subprocess stdout/stderr
logs/<agent>.summary     # agent's final summary, written by the agent
```

### Task-level report

```bash
python3 spawn-team.py report <task_id>
```

The report command reads `boulder.json`, writes `report.json`, and prints a
terminal summary with agent status, PID, and PGID.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Task not found: <task_id>` | typo or cleaned up task | `ls ~/.apeiron/multi-agent/tasks/` |
| Agent stuck in `running` for hours | timeout too long or backend stuck | `spawn-team.py stop <task_id>` |
| `spawn-team.py: permission denied` | not executable | `chmod +x ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py` |
| `agent-kernel` not found in MMAS | optional dep missing | run `agent-kernel doctor` |
| Watchdog never finishes | backend subprocess still alive | stop the task, then inspect PGIDs in `boulder.json` |
| Hardcoded `${DELEGATE_TEAM_ROOT}` error | stale install | reinstall Lane 3 |

---

## What's deliberately NOT in MMAS

- **Cross-machine coordination.** MMAS is local-only.
- **Resource quotas.** MMAS does not enforce CPU/RAM caps. Use OS-level cgroups
  or `nice` if you need them.
- **Persistent agent memory.** Agents read agent-kernel memory at start but do
  not write back to it during the run.

These are explicit non-goals. If you need them, please open an issue.
