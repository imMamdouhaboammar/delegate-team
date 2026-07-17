#!/usr/bin/env python3
"""
spawn-team.py - MMAS team orchestrator.

Spawns a bounded local team of specialist agents, records their process groups,
starts a watchdog, and provides a process-group aware kill switch.
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
    print("PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


MMAS_ROOT = Path(__file__).parent.resolve()
AGENTS_DIR = MMAS_ROOT / "agents"

_DELEGATE_TEAM_ROOT_ENV = os.environ.get("DELEGATE_TEAM_ROOT")
if _DELEGATE_TEAM_ROOT_ENV:
    DELEGATE_TEAM_ROOT = Path(_DELEGATE_TEAM_ROOT_ENV).resolve()
elif (MMAS_ROOT.parent / "package.json").exists():
    DELEGATE_TEAM_ROOT = MMAS_ROOT.parent.resolve()
else:
    DELEGATE_TEAM_ROOT = Path("${DELEGATE_TEAM_ROOT}")

MINIMAX_CODER = DELEGATE_TEAM_ROOT / "minimax-coder"
VERTEX_CODER = DELEGATE_TEAM_ROOT / "vertex-coder"
MMAS_TASKS_ROOT = Path.home() / ".mavis" / "multi-agent" / "tasks"

MMAS_HARD_CAPS = {
    "maxAgents": 8,
    "timeoutSeconds": 7200,
    "killGracePeriod": 30,
}

MMAS_DEFAULTS = {
    "maxAgents": 4,
    "timeoutSeconds": 900,
    "writeMode": "workspace",
    "logsEnabled": True,
    "watchdogInterval": 30,
    "atlasTimeout": 120,
    "killGracePeriod": 5,
}


def utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def load_agent(agent_name: str) -> dict:
    yaml_path = AGENTS_DIR / f"{agent_name}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Agent '{agent_name}' not found at {yaml_path}")
    with open(yaml_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def list_available_agents() -> list[str]:
    return sorted([p.stem for p in AGENTS_DIR.glob("*.yaml")])


def resolve_write_mode(args) -> str:
    if getattr(args, "no_write", False):
        return "none"
    return args.write_mode


def enforce_guardrails(args, agents_count: int) -> tuple[bool, str]:
    cap = MMAS_HARD_CAPS["maxAgents"]
    if agents_count > cap:
        return False, f"--team has {agents_count} agents but the hard cap is {cap}. Reduce the team size or split the task."

    if agents_count > args.max_agents:
        return False, (
            f"--team has {agents_count} agents but --max-agents is {args.max_agents}. "
            f"Raise --max-agents up to the hard cap of {cap} or reduce the team."
        )

    if args.timeout > MMAS_HARD_CAPS["timeoutSeconds"]:
        return False, f"--timeout {args.timeout}s exceeds the hard cap of {MMAS_HARD_CAPS['timeoutSeconds']}s."

    if args.kill_grace > MMAS_HARD_CAPS["killGracePeriod"]:
        return False, f"--kill-grace {args.kill_grace}s exceeds the hard cap of {MMAS_HARD_CAPS['killGracePeriod']}s."

    return True, ""


def build_agent_command(agent: dict, prompt: str, log_file: Path) -> list[str]:
    name = agent["name"]
    backend = agent.get("backend", "minimax-coder")
    model = agent.get("model", "MiniMax-M3")
    mode = agent.get("mode", "interactive")
    thinking = agent.get("thinking", {})
    sys_addition = agent.get("system_prompt_addition", "")

    full_prompt = (
        f"You are **{name.upper()}** - {agent.get('description', '').strip()}\n\n"
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
        cmd = ["python3", str(script), full_prompt, model, "--max-turns", "25", "--timeout", "600"]
        if mode == "direct" and thinking.get("enabled") is False:
            cmd.extend(["--no-thinking"])
        return cmd

    if backend == "vertex-coder":
        return ["python3", str(VERTEX_CODER / "vertex_interactive_agent.py"), full_prompt, model]

    if backend == "god-agent":
        model_map = {
            "MiniMax-M3": "opencode-go/minimax-m3",
            "MiniMax-M2.7": "opencode-go/minimax-m2.7",
            "MiniMax-M2.7-highspeed": "opencode-go/minimax-m2.7-highspeed",
        }
        return ["opencode", "run", "-m", model_map.get(model, model), full_prompt]

    delegate_agents = ["agy", "codex", "grok", "kimi", "opencode"]
    brief_file = log_file.with_suffix(".brief")
    try:
        with open(brief_file, "w", encoding="utf-8") as f:
            f.write(full_prompt)
    except Exception as e:
        print(f"Failed to write brief file: {e}", file=sys.stderr)

    if backend in delegate_agents:
        relay_script = DELEGATE_TEAM_ROOT / "delegate-skills" / f"{backend}-delegate" / "scripts" / "relay.mjs"
        if not relay_script.exists():
            cli_script = DELEGATE_TEAM_ROOT / "dist" / "cli.js"
            cmd = ["node", str(cli_script), "delegate", backend, "--brief", str(brief_file)]
        else:
            cmd = ["node", str(relay_script), "--brief", str(brief_file)]
        if model:
            cmd.extend(["--model", model])
        return cmd

    # Otherwise fallback to the main relay.mjs (gemini, openrouter, minimax, etc.)
    relay_script = DELEGATE_TEAM_ROOT / "delegate-team/scripts/relay.mjs"
    cmd = ["node", str(relay_script), "--backend", backend, "--brief", str(brief_file)]
    
    agent_dir = log_file.parent / name
    agent_dir.mkdir(parents=True, exist_ok=True)
    cmd.extend(["--out-dir", str(agent_dir)])
    
    if model:
        cmd.extend(["--model", model])
    return cmd


def make_boulder(task_id: str, task: str, agents: list[dict], boss_session: str | None, guardrails: dict | None = None) -> dict:
    return {
        "task_id": task_id,
        "task": task,
        "created_at": utc_now(),
        "boss_session": boss_session or os.environ.get("MAVIS_SESSION_ID", "unknown"),
        "status": "running",
        "guardrails": guardrails or {},
        "agents": [
            {
                "name": a["name"],
                "model": a.get("model"),
                "backend": a.get("backend"),
                "pid": None,
                "pgid": None,
                "status": "pending",
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
        "watchdog_pgid": None,
        "events": [{"at": utc_now(), "type": "spawn", "detail": f"Task started: {task[:80]}"}],
    }


def read_boulder(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_boulder(path: Path, boulder: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(boulder, f, indent=2, ensure_ascii=False)


def append_event(boulder: dict, event_type: str, detail: str) -> None:
    boulder.setdefault("events", []).append({"at": utc_now(), "type": event_type, "detail": detail})


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def process_group_for(pid: int) -> int | None:
    try:
        return os.getpgid(pid)
    except ProcessLookupError:
        return None
    except PermissionError:
        return None


def terminate_process_group(pid: int | None, grace: int, label: str) -> tuple[bool, str]:
    if not pid:
        return False, f"{label}: no pid"

    pgid = process_group_for(pid)
    target = pgid if pgid is not None else pid
    killed = False

    try:
        if pgid is not None:
            os.killpg(target, signal.SIGTERM)
            killed = True
        else:
            os.kill(target, signal.SIGTERM)
            killed = True
    except ProcessLookupError:
        return False, f"{label}: already exited"
    except PermissionError as exc:
        return False, f"{label}: permission denied during SIGTERM: {exc}"

    deadline = time.time() + max(0, grace)
    while time.time() < deadline:
        if not process_alive(pid):
            return killed, f"{label}: terminated"
        time.sleep(0.2)

    try:
        if pgid is not None:
            os.killpg(target, signal.SIGKILL)
        else:
            os.kill(target, signal.SIGKILL)
        return True, f"{label}: killed after grace period"
    except ProcessLookupError:
        return killed, f"{label}: exited before SIGKILL"
    except PermissionError as exc:
        return killed, f"{label}: permission denied during SIGKILL: {exc}"


def guardrails_from_args(args) -> dict:
    return {
        "maxAgents": args.max_agents,
        "timeoutSeconds": args.timeout,
        "writeMode": resolve_write_mode(args),
        "logsEnabled": args.logs_enabled,
        "killGracePeriod": args.kill_grace,
        "hardCaps": dict(MMAS_HARD_CAPS),
    }


def new_task_paths() -> tuple[str, Path, Path, Path]:
    task_id = f"task-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    task_dir = MMAS_TASKS_ROOT / task_id
    log_dir = task_dir / "logs"
    task_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(exist_ok=True)
    return task_id, task_dir, log_dir, task_dir / "boulder.json"


def update_agent_entry(boulder_path: Path, agent_name: str, proc: subprocess.Popen | None, log_file: Path, summary_file: Path, status: str) -> None:
    boulder = read_boulder(boulder_path)
    for entry in boulder["agents"]:
        if entry["name"] == agent_name:
            entry["pid"] = proc.pid if proc else None
            entry["pgid"] = process_group_for(proc.pid) if proc else None
            entry["status"] = status
            entry["started_at"] = utc_now() if proc else None
            entry["log_file"] = str(log_file)
            entry["summary_file"] = str(summary_file)
            break
    write_boulder(boulder_path, boulder)


def spawn_one_agent(agent: dict, prompt: str, task_dir: Path, log_dir: Path, boulder_path: Path) -> None:
    agent_name = agent["name"]
    log_file = log_dir / f"{agent_name}.log"
    summary_file = log_dir / f"{agent_name}.summary"
    cmd = build_agent_command(agent, prompt, log_file)

    print(f"Spawning {agent_name} ({agent.get('model')} via {agent.get('backend')})")
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
        update_agent_entry(boulder_path, agent_name, proc, log_file, summary_file, "running")
        print(f"   pid: {proc.pid} pgid: {process_group_for(proc.pid) or 'unknown'}")
    except Exception as exc:
        print(f"   spawn failed: {exc}", file=sys.stderr)
        update_agent_entry(boulder_path, agent_name, None, log_file, summary_file, "spawn_failed")


def start_watchdog(task_id: str, task_dir: Path, boulder_path: Path, args) -> None:
    watchdog_log = task_dir / "watchdog.log"
    watchdog_cmd = [
        "bash",
        str(MMAS_ROOT / "watchdog.sh"),
        task_id,
        str(args.boss_session or os.environ.get("MAVIS_SESSION_ID", "unknown")),
        "--interval",
        str(args.interval),
    ]

    print(f"Starting watchdog (interval={args.interval}s)")
    watchdog_pid = None
    watchdog_pgid = None
    try:
        with open(watchdog_log, "w", encoding="utf-8") as f:
            proc = subprocess.Popen(
                watchdog_cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                cwd=str(task_dir),
                start_new_session=True,
            )
        watchdog_pid = proc.pid
        watchdog_pgid = process_group_for(proc.pid)
        print(f"   pid: {watchdog_pid} pgid: {watchdog_pgid or 'unknown'}")
    except Exception as exc:
        print(f"   watchdog failed to start: {exc}", file=sys.stderr)

    boulder = read_boulder(boulder_path)
    boulder["watchdog_pid"] = watchdog_pid
    boulder["watchdog_pgid"] = watchdog_pgid
    append_event(boulder, "watchdog_started", f"Watchdog PID {watchdog_pid}, PGID {watchdog_pgid}, interval {args.interval}s")
    write_boulder(boulder_path, boulder)


def parse_team(args) -> tuple[list[str] | None, int]:
    if not args.team:
        print("Either --team or --atlas is required", file=sys.stderr)
        print(f"Available: {', '.join(list_available_agents())}", file=sys.stderr)
        return None, 1
    team_names = [t.strip() for t in args.team.split(",") if t.strip()]
    if not team_names:
        print("--team is required (comma-separated agent names)", file=sys.stderr)
        return None, 1
    return team_names, 0


def cmd_spawn(args):
    if getattr(args, "atlas", False):
        return cmd_spawn_atlas(args)

    team_names, code = parse_team(args)
    if code:
        return code

    agents = []
    for name in team_names:
        try:
            agents.append(load_agent(name))
        except FileNotFoundError as exc:
            print(str(exc), file=sys.stderr)
            return 1

    ok, err = enforce_guardrails(args, len(agents))
    if not ok:
        print(f"Guardrail violation: {err}", file=sys.stderr)
        return 2

    if getattr(args, "plan_only", False):
        print("plan-only mode - not spawning agents.")
        print(f"   Team (planned): {', '.join([a['name'] for a in agents])}")
        print(f"   Tasks: {len(agents)}")
        print(f"   Timeout per agent: {args.timeout}s")
        print(f"   Write mode: {resolve_write_mode(args)}")
        print()
        print("Re-run without --plan-only to actually spawn.")
        return 0

    task_id, task_dir, log_dir, boulder_path = new_task_paths()
    boulder = make_boulder(task_id, args.task, agents, args.boss_session, guardrails_from_args(args))
    write_boulder(boulder_path, boulder)

    print(f"Task ID: {task_id}")
    print(f"Boulder: {boulder_path}")
    print(f"Team: {len(agents)} agents - {', '.join([a['name'] for a in agents])}")
    print()

    for agent in agents:
        spawn_one_agent(agent, args.task, task_dir, log_dir, boulder_path)
        print()

    start_watchdog(task_id, task_dir, boulder_path, args)

    print()
    print("Team spawned. Monitoring active.")
    print(f"   Monitor: python3 {MMAS_ROOT}/spawn-team.py status {task_id}")
    print(f"   Stop:    python3 {MMAS_ROOT}/spawn-team.py stop {task_id}")
    print(f"   Boulder: {boulder_path}")
    return 0


def cmd_spawn_atlas(args):
    try:
        atlas_agent = load_agent("atlas")
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    ok, err = enforce_guardrails(args, 1)
    if not ok:
        print(f"Guardrail violation: {err}", file=sys.stderr)
        return 2

    if getattr(args, "plan_only", False):
        print("plan-only mode - Atlas would pick the team, but no subprocess is spawned.")
        print("Re-run without --plan-only to actually spawn.")
        return 0

    task_id, task_dir, log_dir, boulder_path = new_task_paths()
    boulder = make_boulder(task_id, args.task, [atlas_agent], args.boss_session, guardrails_from_args(args))
    boulder["mode"] = "atlas-picker"
    boulder["status"] = "awaiting_team_plan"
    write_boulder(boulder_path, boulder)

    atlas_prompt = (
        f"You are Atlas in TEAM-PICKER MODE.\n\n"
        f"USER TASK:\n{args.task}\n\n"
        f"Write a JSON plan to {task_dir}/team_plan.json with keys: team, rationale, tasks.\n"
        f"Available agents: {', '.join(list_available_agents())}"
    )

    spawn_one_agent(atlas_agent, atlas_prompt, task_dir, log_dir, boulder_path)
    atlas_pid = read_boulder(boulder_path)["agents"][0].get("pid")
    atlas_log = log_dir / "atlas.log"
    team_plan_path = task_dir / "team_plan.json"

    print(f"Waiting for Atlas to write team_plan.json (max {args.atlas_timeout}s)")
    waited = 0
    poll_interval = 2
    while waited < args.atlas_timeout:
        time.sleep(poll_interval)
        waited += poll_interval
        if team_plan_path.exists():
            print(f"Atlas wrote team_plan.json after {waited}s")
            break
        if atlas_pid and not process_alive(atlas_pid):
            print("Atlas exited without writing team_plan.json", file=sys.stderr)
            print(f"Check log: {atlas_log}", file=sys.stderr)
            return 1
        if waited % 10 == 0:
            print(f"   still waiting ({waited}s)")
    else:
        killed, detail = terminate_process_group(atlas_pid, args.kill_grace, "atlas")
        boulder = read_boulder(boulder_path)
        boulder["status"] = "timeout"
        boulder["stop_reason"] = "atlas_timeout"
        for entry in boulder["agents"]:
            if entry["name"] == "atlas":
                entry["status"] = "timeout"
                entry["completed_at"] = utc_now()
        append_event(boulder, "atlas_timeout_cleanup", detail)
        write_boulder(boulder_path, boulder)
        print(f"Timeout waiting for team_plan.json. {detail}", file=sys.stderr)
        return 1

    try:
        with open(team_plan_path, "r", encoding="utf-8") as f:
            team_plan = json.load(f)
    except Exception as exc:
        print(f"Failed to parse team_plan.json: {exc}", file=sys.stderr)
        return 1

    team = [name for name in team_plan.get("team", []) if name != "atlas"]
    tasks = team_plan.get("tasks", {})
    rationale = team_plan.get("rationale", "(no rationale)")

    selected_agents = []
    for name in team:
        try:
            selected_agents.append(load_agent(name))
        except FileNotFoundError as exc:
            print(f"Skipping unknown agent: {name} ({exc})", file=sys.stderr)

    ok, err = enforce_guardrails(args, 1 + len(selected_agents))
    if not ok:
        print(f"Guardrail violation after Atlas plan: {err}", file=sys.stderr)
        return 2

    boulder = read_boulder(boulder_path)
    for entry in boulder["agents"]:
        if entry["name"] == "atlas":
            entry["status"] = "done"
            entry["completed_at"] = utc_now()
    for agent in selected_agents:
        boulder["agents"].append({
            "name": agent["name"],
            "model": agent.get("model"),
            "backend": agent.get("backend"),
            "pid": None,
            "pgid": None,
            "status": "pending",
            "started_at": None,
            "last_activity": None,
            "completed_at": None,
            "exit_code": None,
            "summary_file": None,
            "log_file": None,
            "task": tasks.get(agent["name"], args.task),
        })
    boulder["status"] = "running"
    append_event(boulder, "team_plan_received", f"Atlas chose {team}. Rationale: {rationale}")
    write_boulder(boulder_path, boulder)

    print(f"Atlas plan: {rationale}")
    print(f"Team: Atlas + {', '.join(team)}")
    print()

    for agent in selected_agents:
        spawn_one_agent(agent, tasks.get(agent["name"], args.task), task_dir, log_dir, boulder_path)
        print()

    start_watchdog(task_id, task_dir, boulder_path, args)
    print("Team spawned. Monitoring active.")
    print(f"   Monitor: python3 {MMAS_ROOT}/spawn-team.py status {task_id}")
    return 0


def cmd_status(args):
    boulder_path = MMAS_TASKS_ROOT / args.task_id / "boulder.json"
    if not boulder_path.exists():
        print(f"Task not found: {args.task_id}", file=sys.stderr)
        return 1

    boulder = read_boulder(boulder_path)
    print(f"\n{boulder['task_id']}")
    print(f"Task: {boulder['task'][:80]}")
    print(f"Status: {boulder.get('status')}")
    print(f"Created: {boulder.get('created_at')}")
    print(f"Watchdog PID: {boulder.get('watchdog_pid')} PGID: {boulder.get('watchdog_pgid')}")
    print(f"\n{'NAME':<12} {'STATUS':<12} {'PID':<8} {'PGID':<8} {'MODEL':<28}")
    print(f"{'-'*12} {'-'*12} {'-'*8} {'-'*8} {'-'*28}")
    for agent in boulder.get("agents", []):
        print(
            f"{agent['name']:<12} {agent.get('status','?'):<12} "
            f"{str(agent.get('pid') or '—'):<8} {str(agent.get('pgid') or '—'):<8} "
            f"{agent.get('model','?'):<28}"
        )
    return 0


def cmd_list(args):
    agents = list_available_agents()
    print(f"\nAvailable MMAS agents ({len(agents)}):")
    for name in agents:
        try:
            agent = load_agent(name)
            print(f"  - {name:<14} {agent.get('model','?'):<28} [{agent.get('category','?')}]")
        except Exception as exc:
            print(f"  - {name:<14} ERROR: {exc}")
    return 0


def cmd_stop(args):
    boulder_path = MMAS_TASKS_ROOT / args.task_id / "boulder.json"
    if not boulder_path.exists():
        print(f"Task not found: {args.task_id}", file=sys.stderr)
        return 1

    boulder = read_boulder(boulder_path)
    details = []
    killed = 0

    did_kill, detail = terminate_process_group(boulder.get("watchdog_pid"), args.grace, "watchdog")
    if did_kill:
        killed += 1
    details.append(detail)

    for agent in boulder.get("agents", []):
        did_kill, detail = terminate_process_group(agent.get("pid"), args.grace, agent.get("name", "agent"))
        if did_kill:
            killed += 1
            agent["status"] = "stopped"
            agent["completed_at"] = utc_now()
        details.append(detail)

    boulder["status"] = "stopped"
    boulder["stop_reason"] = "user_stop"
    append_event(boulder, "stopped", f"User stopped task. Process groups signaled: {killed}. Details: {'; '.join(details)}")
    write_boulder(boulder_path, boulder)

    print(f"Stopped {killed} process groups for task {args.task_id}")
    for detail in details:
        print(f"  - {detail}")
    return 0


def cmd_report(args):
    boulder_path = MMAS_TASKS_ROOT / args.task_id / "boulder.json"
    if not boulder_path.exists():
        print(f"Task not found: {args.task_id}", file=sys.stderr)
        return 1

    boulder = read_boulder(boulder_path)
    agents = boulder.get("agents", [])
    report = {
        "task_id": boulder["task_id"],
        "task": boulder["task"],
        "started_at": boulder.get("created_at"),
        "completed_at": boulder.get("completed_at"),
        "status": boulder.get("status"),
        "stop_reason": boulder.get("stop_reason"),
        "guardrails": boulder.get("guardrails", {}),
        "agents": [
            {
                "name": agent["name"],
                "status": agent.get("status"),
                "exit_code": agent.get("exit_code"),
                "summary_file": agent.get("summary_file"),
                "log_file": agent.get("log_file"),
                "pid": agent.get("pid"),
                "pgid": agent.get("pgid"),
            }
            for agent in agents
        ],
        "events": boulder.get("events", []),
    }

    report_path = boulder_path.parent / "report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print()
    print(f"MMAS Report - {boulder['task_id']}")
    print(f"   Task: {boulder['task'][:80]}")
    print(f"   Status: {boulder.get('status', 'unknown')}")
    print(f"   Stop reason: {boulder.get('stop_reason', 'n/a')}")
    print()
    print(f"   {'AGENT':<14} {'STATUS':<12} {'PID':<8} {'PGID':<8}")
    print(f"   {'-'*14} {'-'*12} {'-'*8} {'-'*8}")
    for agent in agents:
        print(
            f"   {agent['name']:<14} {agent.get('status','?'):<12} "
            f"{str(agent.get('pid') or '—'):<8} {str(agent.get('pgid') or '—'):<8}"
        )
    print()
    print(f"Full report: {report_path}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="MMAS Team Spawner - orchestrator for multi-agent teams",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="cmd")
    sub.required = False

    if len(sys.argv) > 1 and sys.argv[1] not in ("spawn", "status", "list", "stop", "report", "-h", "--help"):
        sys.argv.insert(1, "spawn")

    p_spawn = sub.add_parser("spawn", help="Spawn a team for a task")
    p_spawn.add_argument("task", help="The task prompt for the team")
    p_spawn.add_argument("--team", help="Comma-separated agent names. Mutually exclusive with --atlas.")
    p_spawn.add_argument("--atlas", action="store_true", help="Spawn Atlas alone; Atlas picks the team via team_plan.json.")
    p_spawn.add_argument("--atlas-timeout", type=int, default=MMAS_DEFAULTS["atlasTimeout"], help="Max seconds to wait for Atlas to write team_plan.json")
    p_spawn.add_argument("--boss-session", help="Boss session ID, defaults to MAVIS_SESSION_ID")
    p_spawn.add_argument("--interval", type=int, default=MMAS_DEFAULTS["watchdogInterval"], help="Watchdog polling interval in seconds")
    p_spawn.add_argument("--max-agents", type=int, default=MMAS_DEFAULTS["maxAgents"], help=f"Maximum agents to spawn, hard cap {MMAS_HARD_CAPS['maxAgents']}")
    p_spawn.add_argument("--timeout", type=int, default=MMAS_DEFAULTS["timeoutSeconds"], help="Per-agent timeout in seconds")
    p_spawn.add_argument("--plan-only", action="store_true", help="Print planned team and exit before spawning")
    p_spawn.add_argument("--no-write", action="store_true", help="Alias for --write-mode none")
    p_spawn.add_argument("--write-mode", choices=["workspace", "logs-only", "none"], default=MMAS_DEFAULTS["writeMode"], help="Write mode")
    p_spawn.add_argument("--kill-grace", type=int, default=MMAS_DEFAULTS["killGracePeriod"], help="Seconds between SIGTERM and SIGKILL")
    p_spawn.add_argument("--logs-enabled", action="store_true", default=MMAS_DEFAULTS["logsEnabled"], help="Enable per-agent log files")
    p_spawn.set_defaults(func=cmd_spawn)

    p_status = sub.add_parser("status", help="Show task status")
    p_status.add_argument("task_id")
    p_status.set_defaults(func=cmd_status)

    p_list = sub.add_parser("list", help="List available agents")
    p_list.set_defaults(func=cmd_list)

    p_stop = sub.add_parser("stop", help="Stop a running task with process-group cleanup")
    p_stop.add_argument("task_id")
    p_stop.add_argument("--grace", type=int, default=MMAS_DEFAULTS["killGracePeriod"], help="Seconds between SIGTERM and SIGKILL")
    p_stop.set_defaults(func=cmd_stop)

    p_report = sub.add_parser("report", help="Print the post-hoc summary report for a task")
    p_report.add_argument("task_id")
    p_report.set_defaults(func=cmd_report)

    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        return 2
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
