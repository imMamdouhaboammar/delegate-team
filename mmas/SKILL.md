---
name: apeiron-team
description: |
  Apeiron Multi-Agent System (MMAS) — spawn a team of specialized AI agents under your
  direct command. Each agent has a specific power + model (Atlas orchestrator, Forge deep
  worker, Scout searcher, Oracle debugger, Librarian docs-finder, Reviewer validator,
  Visionary media-analyzer, Sentinel security-auditor). A watchdog polls every 30s
  and reports status back to you. Inspired by oh-my-openagent's specialized agent team
  + hermes-agent's self-improving learning loop. Use when you want parallel agents
  working on a complex task while you stay the boss. Triggers on: "spawn team",
  "multi-agent", "MMAS", "parallel agents", "team of agents", "boss mode", "watchdog",
  "/apeiron-team". Do NOT use for single-file edits (do them locally).
---

# Apeiron Multi-Agent System (MMAS)

> **Boss Mode**: You (Apeiron) spawn a team of specialized agents, each with a specific
> power + model. A watchdog polls every 30 seconds and reports status to you. Inspired
> by oh-my-openagent's specialized-agent team, hermes-agent's learning loop, and
> omo's hash-anchored edits.

## What this skill IS

1. **A team orchestrator** (`spawn-team.py`) — spawns a configurable team for any task.
2. **8 specialized agents** (`agents/*.yaml`) — each with a defined power, model, and category.
3. **A boss loop** (`watchdog.sh`) — polls every 30s, detects idle/stuck/done, sends reports.
4. **A hash-anchored edit tool** (`hash-edit.py`) — LINE#HASH content-hash validation (omo-inspired).
5. **Boulder.json** — per-task persistent state (analog of omo's boulder.json session continuity).

## What this skill is NOT

- Not a replacement for single-file edits — use minimax-coder directly.
- Not a replacement for `apeiron team plan` — that's for static planner/coder/verifier flows.
- Not a replacement for the existing delegate-team backends (vertex-coder, aonios-agent, minimax-coder).
- Not a 24/7 daemon — you spawn a team when needed, watchdog exits when done.

---

## The 8 agents

| Agent | Power | Category | Model | Use when |
|---|---|---|---|---|
| **Atlas** | Orchestrator | ultrabrain | MiniMax-M3 | Multi-step coordination, team delegation |
| **Forge** | Deep worker | deep | MiniMax-M3 + thinking | Goal-based autonomous execution |
| **Scout** | Fast searcher | quick | MiniMax-M2.7-highspeed | Cheap parallel grep/mapping |
| **Oracle** | Architect/debugger | ultrabrain | MiniMax-M3 + thinking | "Why broken?" / "How structure?" |
| **Librarian** | Doc/code finder | research | Gemini 3.1 Pro | Official docs, GitHub examples |
| **Reviewer** | Ruthless validator | validation | gpt-5.5-xhigh | Bulletproof plan validation |
| **Visionary** | Media analyzer | multimodal | MiniMax-M3 | PDF/image/diagram extraction |
| **Sentinel** | Security auditor | security | glm-5.2-max | Vulnerability hunting + PoC |

---

## Quick start

### List available agents

```bash
dt mmas list
# Or raw: python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py list
```

### Spawn a team for a task

```bash
dt mmas spawn \
  "Build an OAuth2 PKCE flow with tests and security review" \
  --team atlas,forge,scout,oracle,reviewer,sentinel
# Or raw: python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py \
#   "Build an OAuth2 PKCE flow with tests and security review" \
#   --team atlas,forge,scout,oracle,reviewer,sentinel
```

Output:
```
🆔 Task ID: task-20260630-123456-abc123
📁 Boulder: ~/.apeiron/multi-agent/tasks/task-20260630-123456-abc123/boulder.json
📋 Team: 6 agents — atlas, forge, scout, oracle, reviewer, sentinel

🚀 Spawning atlas (MiniMax-M3 via minimax-coder)...
   log: ~/.apeiron/multi-agent/tasks/.../logs/atlas.log
   pid: 12345
... (5 more agents) ...

🐕 Starting watchdog (interval=30s)...
   pid: 12350

✅ Team spawned. Monitoring active.
```

### Monitor a task

```bash
dt mmas status task-20260630-123456-abc123
# Or raw: python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py status task-20260630-123456-abc123
```

Output:
```
🆔 task-20260630-123456-abc123
📋 Task: Build an OAuth2 PKCE flow with tests and security review
📊 Status: running
👥 Agents:
  NAME         STATUS     PID      MODEL                          RUNTIME
  -----------  ----------  --------  ----------------------------  ----------
  atlas        running     12345    MiniMax-M3                     47s
  forge        running     12346    MiniMax-M3                     45s
  scout        done        12347    MiniMax-M2.7-highspeed         120s
  oracle       running     12348    MiniMax-M3                     42s
  reviewer     pending     —        gpt-5.5-xhigh                  —
  sentinel     pending     —        glm-5.2-max                    —
```

### Watchdog reports

Every 30s, you (Apeiron) receive an automatic message in your session:

```
🐕 [MMAS watchdog task-... @ 12:34:56] ✅ atlas 🔧 forge ✅ scout 🔧 oracle ⏳ reviewer ⏳ sentinel
```

When all done:
```
✅ [MMAS task ... COMPLETE]

Original task: Build an OAuth2 PKCE flow...

Agent summaries:
--- atlas ---
Plan: delegate to forge (implementation) + scout (auth patterns) + oracle (architecture review)...

--- forge ---
Implemented OAuth PKCE flow in src/auth/. 4 files modified, 8 tests added...

--- scout ---
Found 3 existing auth patterns: src/auth/jwt.ts (line 12), src/auth/session.ts (line 45)...

--- oracle ---
Recommended OAuth Code with PKCE. Tradeoffs: PKCE adds 1 redirect step but prevents auth code interception...

--- reviewer ---
Verdict: APPROVE-WITH-MINOR-FIXES. Minor: error message on /callback could be more specific...

--- sentinel ---
Verdict: ISSUES-FOUND. [Medium] Missing CSRF protection on /callback. PoC: curl -X POST ...
```

### Stop a task

```bash
dt mmas stop task-20260630-123456-abc123
# Or raw: python3 ~/.apeiron/agents/apeiron/multi-agent/spawn-team.py stop task-20260630-123456-abc123
```

---

## Hash-anchored edits

`hash-edit.py` gives every line a content hash. Format: `LINE#HASH | content`.

```bash
# Read with hashes
python3 ~/.apeiron/agents/apeiron/multi-agent/hash-edit.py read src/app.ts

# Edit single line
python3 ~/.apeiron/agents/apeiron/multi-agent/hash-edit.py edit src/app.ts 11#VK 'def hello() -> str:'

# Insert before line
python3 ~/.apeiron/agents/apeiron/multi-agent/hash-edit.py insert src/app.ts 22#XJ '    return "world"'

# Delete line
python3 ~/.apeiron/agents/apeiron/multi-agent/hash-edit.py delete src/app.ts 5#AB
```

**Why**: prevents stale-line edits. If the file changed since the last read, the hash
won't match and the edit is rejected BEFORE corruption. Inspired by Can Bölük's
[The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/) — bumped
Grok Code Fast 1 from 6.7% → 68.3% success rate.

---

## Boulder.json schema

Per-task persistent state at `~/.apeiron/multi-agent/tasks/<task_id>/boulder.json`:

```json
{
  "task_id": "task-20260630-abc123",
  "task": "Build OAuth2 PKCE flow...",
  "created_at": "2026-06-30T12:34:56Z",
  "boss_session": "mvs_5d01...",
  "status": "running | complete | timeout | stopped",
  "agents": [
    {
      "name": "atlas",
      "model": "MiniMax-M3",
      "backend": "minimax-coder",
      "pid": 12345,
      "status": "running | done | error | stuck | idle | spawn_failed",
      "started_at": "...",
      "completed_at": "...",
      "last_activity": "...",
      "exit_code": null,
      "summary_file": "...",
      "log_file": "..."
    }
  ],
  "watchdog_pid": 12350,
  "events": [
    {"at": "...", "type": "spawn", "detail": "..."},
    {"at": "...", "type": "watchdog_started", "detail": "..."}
  ]
}
```

---

## Architecture

```
Apeiron (Boss)
    │
    │ spawn-team.py "task" --team atlas,forge,scout
    │
    ▼
spawn-team.py
    │
    ├─ Creates ~/.apeiron/multi-agent/tasks/<task_id>/
    │   ├── boulder.json
    │   └── logs/{agent}.log
    │
    ├─ Spawns each agent as subprocess:
    │   ├─ atlas  → minimax_interactive_agent.py (M3, interactive)
    │   ├─ forge  → minimax_interactive_agent.py (M3 + thinking, interactive)
    │   └─ scout  → minimax_interactive_agent.py (M2.7-HS, interactive)
    │
    └─ Starts watchdog.sh in background (detached)
         │
         ▼
    watchdog.sh (loops every 30s)
         │
         ├─ For each agent:
         │   ├─ kill -0 <pid>           → alive?
         │   ├─ stat log_file           → activity time
         │   └─ update boulder.json
         │
         ├─ Send report to boss via apeiron communication send
         │
         └─ If all done → final summary → exit
```

---

## Files in this directory

| File | Purpose |
|---|---|
| `spawn-team.py` | Orchestrator (spawn agents + start watchdog) |
| `watchdog.sh` | Boss loop (poll every 30s, send reports) |
| `hash-edit.py` | LINE#HASH content-hash-validated edit tool |
| `agents/*.yaml` | 8 agent definitions |
| `examples/boulder.example.json` | Example boulder.json |
| `SKILL.md` | This file |
| `README.md` | Same content as SKILL.md (for documentation) |

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

---

## Cross-references

- **Apeiron expert-engineer**: `~/.apeiron/agents/apeiron/skills/expert-engineer/SKILL.md` (boss-mode routing section)
- **MiniMax Coder**: `${DELEGATE_TEAM_ROOT}/minimax-coder/` (transport for Atlas/Forge/Scout/Oracle/Visionary)
- **Vertex Coder**: `${DELEGATE_TEAM_ROOT}/vertex-coder/` (transport for Librarian)
- **Aonios Agent**: `${DELEGATE_TEAM_ROOT}/aonios-agent/` (transport for Reviewer/Sentinel)
- **Inspiration**: NousResearch/hermes-agent (learning loop), code-yeongyu/oh-my-openagent (specialized agents + team mode)

---

**Last updated**: 2026-07-17 — write modes enforcement.
**Maintained by**: Mamdouh + Apeiron (collaboratively).
