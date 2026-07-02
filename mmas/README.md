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

The installer copies the framework to `~/.mavis/agents/mavis/multi-agent/`.

## Usage

```bash
# Auto-pick (Atlas autonomous mode)
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py --atlas

# Explicit team
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py \
    --agents atlas,forge,scout,reviewer \
    --task "Refactor the database layer for multi-tenancy"

# In Claude Code: /mavis-team <task>
```

## How it works

1. **Atlas** receives the task, plans, and emits `team_plan.json` listing which agents
   to spawn.
2. **spawn-team.py** reads `team_plan.json`, spawns each agent as a detached subprocess
   via `subprocess.Popen`, and writes its PID + logs under `logs/<agent>.log`.
3. **watchdog.sh** polls each PID every 30s. Determines state from:
   - PID alive (`kill -0`)
   - Last log line (`DONE` / `FAILED` / `WAITING`)
   Reports to the boss via `mavis communication send`.
4. **hash-edit.py** is the agents' only edit primitive. It accepts `LINE#HASH` anchored
   edits that fail safely if the file changed since the anchor was computed (borrowed
   from oh-my-openagent's success-rate fix).

## Files

- `SKILL.md` — Skill manifest for the framework
- `README.md` — This file
- `spawn-team.py` — Orchestrator (~28.9 KB)
- `watchdog.sh` — Boss-state polling loop
- `hash-edit.py` — LINE#HASH edit validator (~10.8 KB)
- `agents/*.yaml` — Eight agent definitions
- `examples/boulder.example.json` — Sample `team_plan.json` for testing

## Compatibility

- Requires Python 3.10+ (uses `subprocess.Popen` + `mavis communication send`)
- Requires `mavis` daemon running for watchdog reporting
- Does NOT depend on the orchestrator; can run standalone

## See also

- `integrations/README.md` — companion frameworks
- `/mavis-ship` orchestrator at `../orchestrator/` — drives MMAS via the routing chain
