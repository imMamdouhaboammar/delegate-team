#!/usr/bin/env python3
"""
spawn-team.py — MMAS team orchestrator.

Spawns a team of specialized agents for a complex task, then starts the watchdog
to monitor them every 30 seconds. Inspired by oh-my-openagent's "ultrawork" pattern
and Sisyphus metaphor (rolling the boulder uphill forever).

Each agent is a subprocess running minimax_interactive_agent.py (or vertex-coder /
god-agent equivalent) with a specific model + system prompt. The watchdog polls
their logs and sends status reports to the boss (Mavis).

Usage:
    python3 spawn-team.py "<task>" --team atlas,forge,scout,oracle [--boss-session <id>]
    python3 spawn-team.py --list-agents
    python3 spawn-team.py --status <task_id>

Architecture:
    1. Create task dir ~/.mavis/multi-agent/tasks/<task_id>/
    2. Write boulder.json with task metadata + agent specs
    3. Spawn each agent as background subprocess
    4. Record PIDs in boulder.json
    5. Start watchdog.sh in background (detached)
    6. Print task_id + how to monitor

Examples:
    python3 spawn-team.py "Build OAuth2 PKCE flow" --team atlas,forge,scout,oracle
    python3 spawn-team.py "Find all .env files in src/" --team scout,scout,scout --parallel 3
    python3 spawn-team.py --status task-20260630-abc123
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    print("❌ PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

MMAS_ROOT = Path(__file__).parent.resolve()
AGENTS_DIR = MMAS_ROOT / "agents"
DELEGATE_TEAM_ROOT = Path("/Users/mamdouhaboammar/delegate-team")
MINIMAX_CODER = DELEGATE_TEAM_ROOT / "minimax-coder"
VERTEX_CODER = DELEGATE_TEAM_ROOT / "vertex-coder"
GOD_AGENT = DELEGATE_TEAM_ROOT / "god-agent"
MMAS_TASKS_ROOT = Path.home() / ".mavis" / "multi-agent" / "tasks"
MMAS_LOGS_ROOT = Path.home() / ".mavis" / "multi-agent" / "logs"


# ---------------------------------------------------------------------------
# Agent registry
# ---------------------------------------------------------------------------

def load_agent(agent_name: str) -> dict:
    """Load agent YAML config."""
    yaml_path = AGENTS_DIR / f"{agent_name}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Agent '{agent_name}' not found at {yaml_path}")
    with open(yaml_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def list_available_agents() -> list:
    """List all available agent names."""
    return sorted([p.stem for p in AGENTS_DIR.glob("*.yaml")])


# ---------------------------------------------------------------------------
# Backend command builders
# ---------------------------------------------------------------------------

def build_agent_command(agent: dict, prompt: str, log_file: Path) -> list:
    """Build the subprocess command for spawning an agent.

    Returns: [cmd, arg1, arg2, ...] suitable for subprocess.Popen
    """
    name = agent["name"]
    backend = agent.get("backend", "minimax-coder")
    model = agent.get("model", "MiniMax-M3")
    mode = agent.get("mode", "interactive")
    thinking = agent.get("thinking", {})

    # Build system prompt addition (agent-specific)
    sys_addition = agent.get("system_prompt_addition", "")
    full_prompt = (
        f"You are **{name.upper()}** — {agent.get('description', '').strip()}\n\n"
        f"## YOUR ROLE\n{agent.get('power', 'specialist')}\n"
        f"## CATEGORY\n{agent.get('category', 'general')}\n"
        f"## MODEL\n{model}\n\n"
        f"## TASK FROM THE BOSS\n{prompt}\n\n"
        f"{sys_addition}\n\n"
        f"## IMPORTANT\n"
        f"Write your final output to: {log_file.with_suffix('.summary')}\n"
        f"Stream progress to: {log_file}\n"
        f"Report progress to: {MMAS_TASKS_ROOT}/<task_id>/progress.json"
    )

    if backend == "minimax-coder":
        script = MINIMAX_CODER / ("minimax_interactive_agent.py" if mode == "interactive" else "minimax_direct_coder.py")
        cmd = [
            "python3", str(script),
            full_prompt, model,
            "--max-turns", "25",
            "--timeout", "600",
        ]
        # Note: minimax_interactive_agent.py doesn't support --no-thinking (uses thinking by default).
        # For minimax_direct_coder.py, --no-thinking is supported.
        if mode == "direct" and thinking.get("enabled") is False:
            cmd.extend(["--no-thinking"])
        return cmd

    elif backend == "vertex-coder":
        # Vertex coder uses google.genai SDK directly (no CLI for interactive)
        # For MMAS we'll wrap it in a one-shot script call
        return [
            "python3", str(VERTEX_CODER / "vertex_interactive_agent.py"),
            full_prompt, model,
        ]

    elif backend == "god-agent":
        # god-agent uses opencode run for interactive
        # Map MiniMax-M3 to opencode-go/minimax-m3 etc.
        model_map = {
            "MiniMax-M3": "opencode-go/minimax-m3",
            "MiniMax-M2.7": "opencode-go/minimax-m2.7",
            "MiniMax-M2.7-highspeed": "opencode-go/minimax-m2.7-highspeed",
        }
        oc_model = model_map.get(model, model)
        # god-agent uses subprocess to call opencode run
        return [
            "opencode", "run",
            "-m", oc_model,
            full_prompt,
        ]

    else:
        raise ValueError(f"Unknown backend: {backend}")


# ---------------------------------------------------------------------------
# Boulder.json schema
# ---------------------------------------------------------------------------

def make_boulder(task_id: str, task: str, agents: list, boss_session: str = None) -> dict:
    """Create initial boulder.json structure."""
    return {
        "task_id": task_id,
        "task": task,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "boss_session": boss_session or os.environ.get("MAVIS_SESSION_ID", "unknown"),
        "status": "running",
        "agents": [
            {
                "name": a["name"],
                "model": a["model"],
                "backend": a["backend"],
                "pid": None,
                "status": "pending",  # pending / running / done / error / stuck / idle
                "started_at": None,
                "last_activity": None,
                "completed_at": None,
                "exit_code": None,
                "summary_file": None,
                "log_file": None,
            }
            for a in agents
        ],
        "watchdog_pid": None,
        "events": [
            {"at": datetime.utcnow().isoformat() + "Z", "type": "spawn", "detail": f"Task started: {task[:80]}"}
        ],
    }


def update_boulder(boulder_path: Path, updates: dict):
    """Update boulder.json in place."""
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    boulder.update(updates)
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)


def append_boulder_event(boulder_path: Path, event_type: str, detail: str):
    """Append an event to boulder.json."""
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    boulder["events"].append({
        "at": datetime.utcnow().isoformat() + "Z",
        "type": event_type,
        "detail": detail,
    })
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_spawn(args):
    """Spawn a team. Supports --atlas mode (autonomous team-picker)."""
    # Atlas mode: spawn only Atlas, wait for team_plan.json, then spawn the rest
    if getattr(args, "atlas", False):
        return cmd_spawn_atlas(args)

    # Validate --team is provided when --atlas not used
    if not args.team:
        print("❌ Either --team or --atlas is required", file=sys.stderr)
        print(f"   --team:  comma-separated agent names (e.g. 'atlas,forge,scout,oracle')", file=sys.stderr)
        print(f"   --atlas: let Atlas pick the team automatically", file=sys.stderr)
        print(f"   Available: {', '.join(list_available_agents())}", file=sys.stderr)
        return 1

    # Parse team list
    team_names = [t.strip() for t in args.team.split(",") if t.strip()]
    if not team_names:
        print("❌ --team is required (comma-separated agent names)", file=sys.stderr)
        print(f"   Or use --atlas to let Atlas pick the team automatically.", file=sys.stderr)
        print(f"   Available: {', '.join(list_available_agents())}", file=sys.stderr)
        return 1

    # Load agents
    agents = []
    for name in team_names:
        try:
            agents.append(load_agent(name))
        except FileNotFoundError as e:
            print(f"❌ {e}", file=sys.stderr)
            return 1

    # Generate task ID
    task_id = f"task-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    # Create task dir
    task_dir = MMAS_TASKS_ROOT / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    log_dir = task_dir / "logs"
    log_dir.mkdir(exist_ok=True)

    # Write boulder.json
    boulder = make_boulder(task_id, args.task, agents, args.boss_session)
    boulder_path = task_dir / "boulder.json"
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    print(f"🆔 Task ID: {task_id}")
    print(f"📁 Boulder: {boulder_path}")
    print(f"📋 Team: {len(agents)} agents — {', '.join([a['name'] for a in agents])}")
    print()

    # Spawn each agent as a subprocess
    spawned_pids = []
    for agent in agents:
        agent_name = agent["name"]
        log_file = log_dir / f"{agent_name}.log"
        summary_file = log_dir / f"{agent_name}.summary"

        cmd = build_agent_command(agent, args.task, log_file)
        print(f"🚀 Spawning {agent_name} ({agent['model']} via {agent['backend']})...")
        print(f"   log: {log_file}")

        try:
            with open(log_file, "w", encoding="utf-8") as f:
                proc = subprocess.Popen(
                    cmd,
                    stdout=f,
                    stderr=subprocess.STDOUT,
                    cwd=str(task_dir),
                    start_new_session=True,  # detach from parent
                )
            spawned_pids.append((agent_name, proc.pid))
            print(f"   pid: {proc.pid}")
        except Exception as e:
            print(f"   ❌ spawn failed: {e}", file=sys.stderr)
            spawned_pids.append((agent_name, None))

        # Update boulder with pid
        with open(boulder_path, "r", encoding="utf-8") as f:
            boulder = json.load(f)
        for entry in boulder["agents"]:
            if entry["name"] == agent_name:
                entry["pid"] = spawned_pids[-1][1]
                entry["status"] = "running" if spawned_pids[-1][1] else "spawn_failed"
                entry["started_at"] = datetime.utcnow().isoformat() + "Z"
                entry["log_file"] = str(log_file)
                entry["summary_file"] = str(summary_file)
                break
        with open(boulder_path, "w", encoding="utf-8") as f:
            json.dump(boulder, f, indent=2, ensure_ascii=False)

        print()

    # Start watchdog
    watchdog_log = task_dir / "watchdog.log"
    watchdog_cmd = [
        "bash", str(MMAS_ROOT / "watchdog.sh"),
        task_id,
        str(args.boss_session or os.environ.get("MAVIS_SESSION_ID", "unknown")),
        "--interval", str(args.interval),
    ]
    print(f"🐕 Starting watchdog (interval={args.interval}s)...")
    try:
        with open(watchdog_log, "w", encoding="utf-8") as f:
            watchdog_proc = subprocess.Popen(
                watchdog_cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                cwd=str(task_dir),
                start_new_session=True,
            )
        watchdog_pid = watchdog_proc.pid
        print(f"   pid: {watchdog_pid}")
    except Exception as e:
        print(f"   ❌ watchdog failed to start: {e}", file=sys.stderr)
        watchdog_pid = None

    # Update boulder with watchdog pid
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    boulder["watchdog_pid"] = watchdog_pid
    boulder["events"].append({
        "at": datetime.utcnow().isoformat() + "Z",
        "type": "watchdog_started",
        "detail": f"Watchdog PID {watchdog_pid}, interval {args.interval}s"
    })
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    print()
    print(f"✅ Team spawned. Monitoring active.")
    print(f"   Monitor: python3 {MMAS_ROOT}/spawn-team.py --status {task_id}")
    print(f"   Boulder: {boulder_path}")
    print(f"   Watchdog log: {watchdog_log}")
    return 0


def cmd_spawn_atlas(args):
    """Atlas mode: spawn Atlas alone, wait for team_plan.json, then spawn the rest.

    Atlas reads the task, analyzes it, writes team_plan.json with the chosen team,
    then exits. The orchestrator polls for team_plan.json and spawns the rest.
    """
    # Load Atlas
    try:
        atlas_agent = load_agent("atlas")
    except FileNotFoundError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1

    # Generate task ID
    task_id = f"task-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    # Create task dir
    task_dir = MMAS_TASKS_ROOT / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    log_dir = task_dir / "logs"
    log_dir.mkdir(exist_ok=True)

    # Build Atlas prompt with team-picker instructions
    atlas_prompt = (
        f"You are Atlas in TEAM-PICKER MODE.\n\n"
        f"## USER TASK\n{args.task}\n\n"
        f"## YOUR JOB\n"
        f"1. Analyze the task using the decision tree in your system prompt.\n"
        f"2. Pick the right team (1-6 agents).\n"
        f"3. For each agent, write a specific sub-task prompt tailored to their power.\n"
        f"4. Write the plan to: {task_dir}/team_plan.json\n\n"
        f"## team_plan.json SCHEMA\n"
        f'{{\n'
        f'  "team": ["agent1", "agent2", ...],\n'
        f'  "rationale": "why these agents",\n'
        f'  "tasks": {{\n'
        f'    "agent1": "specific sub-task for agent1",\n'
        f'    "agent2": "specific sub-task for agent2"\n'
        f'  }}\n'
        f'}}\n\n'
        f"Available agents: {', '.join(list_available_agents())}\n\n"
        f"After writing team_plan.json, EXIT. The orchestrator handles the rest."
    )

    # Build initial boulder (with only Atlas)
    boulder = make_boulder(task_id, args.task, [atlas_agent], args.boss_session)
    boulder["mode"] = "atlas-picker"
    boulder["status"] = "awaiting_team_plan"
    boulder_path = task_dir / "boulder.json"
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    # Spawn Atlas
    atlas_log = log_dir / "atlas.log"
    cmd = build_agent_command(atlas_agent, atlas_prompt, atlas_log)
    print(f"🧠 Atlas mode — spawning Atlas alone to pick the team")
    print(f"🆔 Task ID: {task_id}")
    print(f"📁 Boulder: {boulder_path}")
    print()
    print(f"🚀 Spawning Atlas ({atlas_agent['model']})...")
    print(f"   log: {atlas_log}")

    atlas_pid = None
    try:
        with open(atlas_log, "w", encoding="utf-8") as f:
            proc = subprocess.Popen(
                cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                cwd=str(task_dir),
                start_new_session=True,
            )
            atlas_pid = proc.pid
            print(f"   pid: {atlas_pid}")
    except Exception as e:
        print(f"   ❌ Atlas spawn failed: {e}", file=sys.stderr)
        return 1

    # Update boulder
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    for entry in boulder["agents"]:
        if entry["name"] == "atlas":
            entry["pid"] = atlas_pid
            entry["status"] = "running"
            entry["started_at"] = datetime.utcnow().isoformat() + "Z"
            entry["log_file"] = str(atlas_log)
            entry["summary_file"] = str(atlas_log).replace(".log", ".summary")
            break
    boulder["events"].append({
        "at": datetime.utcnow().isoformat() + "Z",
        "type": "atlas_spawned",
        "detail": f"Atlas PID {atlas_pid} spawned in team-picker mode"
    })
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    print()
    print(f"⏳ Waiting for Atlas to write team_plan.json (max {args.atlas_timeout}s)...")

    # Poll for team_plan.json
    team_plan_path = task_dir / "team_plan.json"
    waited = 0
    poll_interval = 2
    while waited < args.atlas_timeout:
        time.sleep(poll_interval)
        waited += poll_interval

        # Check if Atlas is still alive
        atlas_alive = atlas_pid and _pid_alive(atlas_pid)

        # Check if team_plan.json exists
        if team_plan_path.exists():
            print(f"\n✅ Atlas wrote team_plan.json after {waited}s")
            break

        if not atlas_alive:
            print(f"\n❌ Atlas exited without writing team_plan.json")
            print(f"   Check log: {atlas_log}")
            return 1

        if waited % 10 == 0:
            print(f"   ...still waiting ({waited}s)")
    else:
        print(f"\n❌ Timeout ({args.atlas_timeout}s) waiting for team_plan.json")
        print(f"   Atlas still running (PID {atlas_pid}). Kill it manually if needed.")
        return 1

    # Parse team_plan.json
    try:
        with open(team_plan_path, "r", encoding="utf-8") as f:
            team_plan = json.load(f)
    except Exception as e:
        print(f"❌ Failed to parse team_plan.json: {e}", file=sys.stderr)
        return 1

    team = team_plan.get("team", [])
    tasks = team_plan.get("tasks", {})
    rationale = team_plan.get("rationale", "(no rationale)")

    # Strip Atlas from team (we already spawned him)
    if "atlas" in team:
        team.remove("atlas")

    print(f"\n📋 Atlas's plan:")
    print(f"   Rationale: {rationale}")
    print(f"   Team: Atlas + {', '.join(team)}")
    for agent_name, sub_task in tasks.items():
        print(f"   • {agent_name}: {sub_task[:80]}")
    print()

    # Mark Atlas as done
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    for entry in boulder["agents"]:
        if entry["name"] == "atlas":
            entry["status"] = "done"
            entry["completed_at"] = datetime.utcnow().isoformat() + "Z"
            break
    boulder["status"] = "team_spawning"
    boulder["events"].append({
        "at": datetime.utcnow().isoformat() + "Z",
        "type": "team_plan_received",
        "detail": f"Atlas chose: {team}. Rationale: {rationale}"
    })
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    # Load + spawn each chosen agent
    spawned_agents = []
    for agent_name in team:
        try:
            agent = load_agent(agent_name)
        except FileNotFoundError as e:
            print(f"⚠️  Skipping unknown agent: {agent_name} ({e})", file=sys.stderr)
            continue

        # Use the per-agent task from team_plan.json, or fall back to global task
        sub_task = tasks.get(agent_name, args.task)

        log_file = log_dir / f"{agent_name}.log"
        summary_file = log_dir / f"{agent_name}.summary"
        cmd = build_agent_command(agent, sub_task, log_file)
        print(f"🚀 Spawning {agent_name} ({agent['model']})...")
        print(f"   task: {sub_task[:70]}...")
        print(f"   log: {log_file}")

        try:
            with open(log_file, "w", encoding="utf-8") as f:
                proc = subprocess.Popen(
                    cmd,
                    stdout=f,
                    stderr=subprocess.STDOUT,
                    cwd=str(task_dir),
                    start_new_session=True,
                )
            spawned_agents.append({
                "name": agent_name,
                "model": agent["model"],
                "backend": agent["backend"],
                "pid": proc.pid,
                "status": "running",
                "started_at": datetime.utcnow().isoformat() + "Z",
                "log_file": str(log_file),
                "summary_file": str(summary_file),
                "task": sub_task,
            })
            print(f"   pid: {proc.pid}")
        except Exception as e:
            print(f"   ❌ spawn failed: {e}", file=sys.stderr)
            spawned_agents.append({
                "name": agent_name,
                "model": agent["model"],
                "backend": agent["backend"],
                "pid": None,
                "status": "spawn_failed",
                "log_file": str(log_file),
                "summary_file": str(summary_file),
                "task": sub_task,
            })
        print()

    # Add new agents to boulder
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    boulder["agents"].extend(spawned_agents)
    boulder["status"] = "running"
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    # Start watchdog
    watchdog_log = task_dir / "watchdog.log"
    watchdog_cmd = [
        "bash", str(MMAS_ROOT / "watchdog.sh"),
        task_id,
        str(args.boss_session or os.environ.get("MAVIS_SESSION_ID", "unknown")),
        "--interval", str(args.interval),
    ]
    print(f"🐕 Starting watchdog (interval={args.interval}s)...")
    try:
        with open(watchdog_log, "w", encoding="utf-8") as f:
            watchdog_proc = subprocess.Popen(
                watchdog_cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                cwd=str(task_dir),
                start_new_session=True,
            )
            watchdog_pid = watchdog_proc.pid
            print(f"   pid: {watchdog_pid}")
    except Exception as e:
        print(f"   ❌ watchdog failed: {e}", file=sys.stderr)
        watchdog_pid = None

    # Update boulder
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)
    boulder["watchdog_pid"] = watchdog_pid
    boulder["events"].append({
        "at": datetime.utcnow().isoformat() + "Z",
        "type": "watchdog_started",
        "detail": f"Watchdog PID {watchdog_pid}, monitoring {len(team)} specialists"
    })
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    print()
    print(f"✅ Team spawned. Monitoring active.")
    print(f"   Monitor: python3 {MMAS_ROOT}/spawn-team.py --status {task_id}")
    print(f"   Atlas chose {len(team)} specialists via autonomous team-picker")
    return 0


def _pid_alive(pid: int) -> bool:
    """Check if a PID is alive (POSIX)."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def cmd_status(args):
    """Show task status."""
    boulder_path = MMAS_TASKS_ROOT / args.task_id / "boulder.json"
    if not boulder_path.exists():
        print(f"❌ Task not found: {args.task_id}", file=sys.stderr)
        return 1
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)

    print(f"\n🆔 {boulder['task_id']}")
    print(f"📋 Task: {boulder['task'][:80]}")
    print(f"📊 Status: {boulder['status']}")
    print(f"🕐 Created: {boulder['created_at']}")
    print(f"🐕 Watchdog PID: {boulder.get('watchdog_pid')}")
    print(f"\n👥 Agents:")
    print(f"  {'NAME':<12} {'STATUS':<10} {'PID':<8} {'MODEL':<28} {'RUNTIME':<10}")
    print(f"  {'-'*12} {'-'*10} {'-'*8} {'-'*28} {'-'*10}")
    for a in boulder["agents"]:
        pid_str = str(a.get("pid") or "—")
        runtime = "—"
        if a.get("started_at"):
            try:
                start = datetime.fromisoformat(a["started_at"].rstrip("Z"))
                if a.get("completed_at"):
                    end = datetime.fromisoformat(a["completed_at"].rstrip("Z"))
                    runtime = f"{int((end - start).total_seconds())}s"
                else:
                    runtime = f"{int((datetime.utcnow() - start).total_seconds())}s"
            except Exception:
                pass
        print(f"  {a['name']:<12} {a.get('status','?'):<10} {pid_str:<8} {a.get('model','?'):<28} {runtime:<10}")
    return 0


def cmd_list(args):
    """List available agents."""
    agents = list_available_agents()
    print(f"\n👥 Available MMAS agents ({len(agents)}):")
    for name in agents:
        try:
            agent = load_agent(name)
            model = agent.get("model", "?")
            category = agent.get("category", "?")
            print(f"  • {name:<14} {model:<28} [{category}]")
        except Exception as e:
            print(f"  • {name:<14} ERROR: {e}")
    return 0


def cmd_stop(args):
    """Stop a running task (kill all agents + watchdog)."""
    boulder_path = MMAS_TASKS_ROOT / args.task_id / "boulder.json"
    if not boulder_path.exists():
        print(f"❌ Task not found: {args.task_id}", file=sys.stderr)
        return 1
    with open(boulder_path, "r", encoding="utf-8") as f:
        boulder = json.load(f)

    killed = 0
    # Kill watchdog
    wd_pid = boulder.get("watchdog_pid")
    if wd_pid:
        try:
            os.kill(wd_pid, signal.SIGTERM)
            killed += 1
        except ProcessLookupError:
            pass

    # Kill agents
    for a in boulder["agents"]:
        pid = a.get("pid")
        if pid:
            try:
                os.kill(pid, signal.SIGTERM)
                killed += 1
            except ProcessLookupError:
                pass

    # Update boulder
    boulder["status"] = "stopped"
    boulder["events"].append({
        "at": datetime.utcnow().isoformat() + "Z",
        "type": "stopped",
        "detail": f"User stopped task. Killed {killed} processes."
    })
    with open(boulder_path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)

    print(f"🛑 Stopped {killed} processes for task {args.task_id}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="MMAS Team Spawner — orchestrator for multi-agent teams",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="cmd")
    # Make 'spawn' the default if no subcommand is given
    sub.required = False

    # If first arg is not a known subcommand, prepend 'spawn'
    if len(sys.argv) > 1 and sys.argv[1] not in ("spawn", "status", "list", "stop", "-h", "--help"):
        sys.argv.insert(1, "spawn")

    # spawn
    p_spawn = sub.add_parser("spawn", help="Spawn a team for a task")
    p_spawn.add_argument("task", help="The task prompt for the team")
    p_spawn.add_argument("--team",
                         help="Comma-separated agent names (e.g. 'atlas,forge,scout,oracle'). "
                              "Mutually exclusive with --atlas.")
    p_spawn.add_argument("--atlas", action="store_true",
                         help="Atlas mode: spawn Atlas alone; Atlas picks the team via team_plan.json. "
                              "Mutually exclusive with --team.")
    p_spawn.add_argument("--atlas-timeout", type=int, default=120,
                         help="Max seconds to wait for Atlas to write team_plan.json (default: 120)")
    p_spawn.add_argument("--boss-session",
                         help="Boss session ID (defaults to MAVIS_SESSION_ID env var)")
    p_spawn.add_argument("--interval", type=int, default=30,
                         help="Watchdog polling interval in seconds (default: 30)")
    p_spawn.set_defaults(func=cmd_spawn)

    # status
    p_status = sub.add_parser("status", help="Show task status")
    p_status.add_argument("task_id")
    p_status.set_defaults(func=cmd_status)

    # list
    p_list = sub.add_parser("list", help="List available agents")
    p_list.set_defaults(func=cmd_list)

    # stop
    p_stop = sub.add_parser("stop", help="Stop a running task")
    p_stop.add_argument("task_id")
    p_stop.set_defaults(func=cmd_stop)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
