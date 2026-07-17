# mmas/ — Multi-Agent Team System

> Boss mode: spawn a team of specialized agents for complex tasks.

## What this is

A framework for spawning 8 specialized agents in parallel, each with a defined role,
model, and skill bundle. A `spawn-team.py` orchestrator picks the team composition
based on the task signature; `watchdog.sh` polls each agent every 30s and reports to
the boss; `hash-edit.py` ensures edits are applied to the right lines (LINE#HASH
content-hash validation).

## The 8 agents

| Agent | Role | Model | When to spawn |
|---|---|---|---|
| **Atlas** | Orchestrator / team picker | MiniMax-M3 | Always — plans + delegates to others |
| **Forge** | Deep worker | MiniMax-M3 + thinking | Multi-file execution |
| **Scout** | Fast searcher | MiniMax-M2.7-highspeed | Cheap parallel grep / mapping |
| **Oracle** | Reasoner / debug | codex-gpt-5.5-high | Hard bugs, deep root-cause |
| **Librarian** | Doc + memory keeper | MiniMax-M2.7 | RAG, file inventory, prior art |
| **Reviewer** | Code review | MiniMax-M2.7 + thinking | Pre-merge review with evidence |
| **Visionary** | UI / design | opencode-kimi-k2.7-code-max | Distinctive UI, screenshot iteration |
| **Sentinel** | Quality gate | codex-gpt-5.5-high | OWASP, secrets, a11y audits |

Defined at `agents/*.yaml`.

## Install

Handled by parent `./install.sh`:

```bash
./install.sh --mmas
# or
./install.sh --all
```

The installer copies the framework to `~/.apeiron/agents/apeiron/multi-agent/`.

## Usage

```bash
# Auto-pick (Atlas autonomous mode)
python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py spawn "<task>" --atlas

# Explicit team
python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py spawn \
    "Refactor the database layer for multi-tenancy" \
    --team atlas,forge,scout,reviewer

# Via dt CLI
dt mmas spawn "<task>" --team atlas,forge,scout

# In Claude Code: /apeiron-team <task>
```

## How it works

1. **Atlas** receives the task, plans, and emits `team_plan.json` listing which agents
   to spawn.
2. **spawn-team.py** reads `team_plan.json`, spawns each agent as a detached subprocess
   via `subprocess.Popen`, and writes its PID + logs under `logs/<agent>.log`.
3. **watchdog.sh** polls each PID every `$INTERVAL` seconds (default 30). Determines state from:
   - PID alive (`kill -0`)
   - Log file modification time (mtime, not log content)
   Reports to the boss via `apeiron communication send`.
4. **hash-edit.py** is the agents' only edit primitive. It accepts `LINE#HASH` anchored
   edits that fail safely if the file changed since the anchor was computed (borrowed
   from oh-my-openagent's success-rate fix).

## Files

- `SKILL.md` — Skill manifest for the framework
- `README.md` — This file
- `spawn-team.py` — Orchestrator (~36.5 KB)
- `watchdog.sh` — Boss-state polling loop
- `hash-edit.py` — LINE#HASH edit validator (~10.8 KB)
- `agents/*.yaml` — Eight agent definitions
- `examples/boulder.example.json` — Sample `team_plan.json` for testing

## Compatibility

- Requires Python 3.10+ (uses `subprocess.Popen` + `apeiron communication send`)
- Requires `apeiron` daemon running for watchdog reporting
- Does NOT depend on the orchestrator; can run standalone

## Write Modes Enforcement

MMAS supports strict enforcement of safe write modes using the `--write-mode` option (or `--no-write` as an alias for `--write-mode none`).

### Supported Write Modes:
1. **`workspace`** (Default): Agents can read and write within the approved repository/workspace according to standard behavior.
2. **`logs-only`**: Spawns agents in an isolated task directory (under `~/.apeiron/multi-agent/tasks/<task_id>`, overridable via `MMAS_TASKS_ROOT` env var). All logs, summaries, brief files, and temporary outputs are restricted to this directory. Path traversal and symlink escapes pointing outside this directory are strictly verified and rejected.
3. **`none`**: Fully read-only execution. Subprocesses for write-capable backends are rejected before spawning (fail closed). In `none` mode, `watchdog.sh` transitions agent status to `done` on clean exit without requiring a summary file.

### Backend Compatibility Matrix:
- **`mock-backend`**: Fully compatible with `workspace`, `logs-only`, and `none`.
- All other backends (`minimax-coder`, `vertex-coder`, `aonios-agent`, `agy`, `codex`, `grok`, `kimi`, `opencode`, `relay-fallback`): Compatible **only** with `workspace`.

### Enforcement & Fail-Closed Behavior:
- **Backend Compatibility Check**: Spawning a team containing an incompatible backend for the requested write mode fails closed immediately (non-zero exit code 3). No subprocesses are spawned, and the rejection event is recorded in the task metadata.
- **Path Containment Check**: Every generated path (e.g., brief files, logs, summary files, output directories) is checked dynamically to ensure it does not escape the task directory (detecting path traversal `..` or symlink escapes). Any violation triggers an immediate fail-closed termination.
- **Environment & Prompt Defense**: Subprocesses are spawned with a minimized environment (essential keys only), overriding `DT_WORKSPACE_ROOT` to the task directory in `logs-only` and `none` modes, and disabling unsafe commands or package installations. Write policy instructions are added to agent system prompts as defense-in-depth.

## See also

- `integrations/README.md` — companion frameworks
- `/apeiron` orchestrator at `../orchestrator/` — drives MMAS via the routing chain
