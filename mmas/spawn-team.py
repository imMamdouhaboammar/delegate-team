#!/usr/bin/env python3
"""
spawn-team.py - MMAS team orchestrator.

Spawns a bounded local team of specialist agents, records their process groups,
starts a watchdog, and provides a process-group aware kill switch.
"""

from __future__ import annotations

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
MMAS_TASKS_ROOT = Path(os.environ.get("MMAS_TASKS_ROOT", str(Path.home() / ".apeiron" / "multi-agent" / "tasks")))

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


BACKEND_COMPATIBILITY = {
    "mock-backend": ["workspace", "logs-only", "none"],
    "minimax-coder": ["workspace"],
    "vertex-coder": ["workspace"],
    "aonios-agent": ["workspace"],
    "agy": ["workspace"],
    "codex": ["workspace"],
    "grok": ["workspace"],
    "kimi": ["workspace"],
    "opencode": ["workspace"],
    "relay-fallback": ["workspace"],
}

BASE_ENV_KEYS = {
    "PATH", "HOME", "USER", "SHELL", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "TERM",
    "DELEGATE_TEAM_ROOT", "APEIRON_SESSION_ID", "DT_ALLOW_UNSAFE_COMMANDS", "DT_ALLOW_DEP_INSTALL",
}

BACKEND_ENV_PREFIXES = {
    "minimax-coder": ("MINIMAX_",),
    "vertex-coder": ("GOOGLE_", "GEMINI_"),
}


def load_agent(agent_name: str) -> dict:
    if not agent_name or Path(agent_name).name != agent_name:
        raise ValueError(f"Invalid agent config name: {agent_name!r}")

    agents_dir = Path(os.environ.get("MMAS_AGENTS_DIR", str(AGENTS_DIR))).resolve()
    yaml_path = agents_dir / f"{agent_name}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"Agent '{agent_name}' not found at {yaml_path}")

    resolved_yaml_path = yaml_path.resolve()
    if resolved_yaml_path.parent != agents_dir:
        raise ValueError(f"Agent config '{agent_name}' escapes configured agent directory")

    with open(resolved_yaml_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def list_available_agents() -> list[str]:
    agents_dir = Path(os.environ.get("MMAS_AGENTS_DIR", str(AGENTS_DIR)))
    return sorted([p.stem for p in agents_dir.glob("*.yaml")])


def resolve_write_mode(args) -> str:
    if getattr(args, "no_write", False):
        return "none"
    return args.write_mode


def check_write_policy_compatibility(agents: list[dict], write_mode: str) -> tuple[bool, str]:
    for agent in agents:
        name = agent.get("name", "unknown")
        backend = agent.get("backend", "minimax-coder")
        supported = BACKEND_COMPATIBILITY.get(backend, ["workspace"])
        if write_mode not in supported:
            return False, f"Backend '{backend}' for agent '{name}' does not support write mode '{write_mode}'."
    return True, ""


def verify_path_in_task_dir(path: Path, task_dir: Path) -> None:
    try:
        resolved_task_dir = task_dir.resolve()
        resolved_path = path.resolve(strict=False)
    except Exception as exc:
        raise ValueError(f"Security Error resolving path: {exc}")
        
    try:
        resolved_path.relative_to(resolved_task_dir)
    except ValueError:
        raise ValueError(f"Security Error: Path '{path}' escapes task directory '{task_dir}'")
        
    current = path
    while True:
        try:
            if current.is_symlink():
                target = Path(os.readlink(str(current)))
                if not target.is_absolute():
                    target = (current.parent / target).resolve()
                else:
                    target = target.resolve()
                try:
                    target.relative_to(resolved_task_dir)
                except ValueError:
                    raise ValueError(f"Security Error: Symlink '{current}' points outside task directory")
        except FileNotFoundError:
            pass
            
        if current == task_dir or current == current.parent:
            break
        current = current.parent


def get_clean_env(write_mode: str, task_dir: Path, backend: str | None = None) -> dict:
    backend_prefixes = BACKEND_ENV_PREFIXES.get(backend, ())
    clean_env = {}
    for k, v in os.environ.items():
        if k in BASE_ENV_KEYS or k.startswith("DT_") or any(k.startswith(prefix) for prefix in backend_prefixes):
            clean_env[k] = v
            
    if write_mode in ("logs-only", "none"):
        clean_env["DT_WORKSPACE_ROOT"] = str(task_dir)
        clean_env["DT_ALLOW_UNSAFE_COMMANDS"] = "false"
        clean_env["DT_ALLOW_DEP_INSTALL"] = "false"
        
    return clean_env


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


def build_agent_command(agent: dict, prompt: str, log_file: Path, write_mode: str = "workspace") -> list[str]:
    name = agent["name"]
    backend = agent.get("backend", "minimax-coder")
    model = agent.get("model", "MiniMax-M3")
    mode = agent.get("mode", "interactive")
    thinking = agent.get("thinking", {})
    sys_addition = agent.get("system_prompt_addition", "")

    policy_prompt = ""
    if write_mode == "none":
        policy_prompt = "\n\n[SECURITY POLICY] WRITE MODE: none. You must not write to any file or directory. You are running in read-only mode."
    elif write_mode == "logs-only":
        policy_prompt = "\n\n[SECURITY POLICY] WRITE MODE: logs-only. You may only write logs, summaries, or metadata inside your designated task directory. Do not write to the workspace or any other location."

    full_prompt = (
        f"You are **{name.upper()}** - {agent.get('description', '').strip()}\n\n"
        f"## YOUR ROLE\n{agent.get('power', 'specialist')}\n"
        f"## CATEGORY\n{agent.get('category', 'general')}\n"
        f"## MODEL\n{model}\n\n"
        f"## TASK FROM THE BOSS\n{prompt}\n\n"
        f"{sys_addition}\n"
        f"{policy_prompt}\n\n"
        f"## IMPORTANT\n"
        f"Write your final output to: {log_file.with_suffix('.summary')}\n"
        f"Stream progress to: {log_file}\n"
        f"Report progress to: {MMAS_TASKS_ROOT}/<task_id>/progress.json"
    )

    if backend == "mock-backend":
        summary_code = ""
        if write_mode != "none":
            summary_code = f"with open('{log_file.with_suffix('.summary')}', 'w') as f: f.write('Mock execution summary for {name}')"
        mock_script = (
            f"import sys, os, time\n"
            f"print('Mock backend started. Write mode: {write_mode}')\n"
            f"sys.stdout.flush()\n"
            f"{summary_code}\n"
            f"sys.exit(0)\n"
        )
        return ["python3", "-c", mock_script]

    if backend == "minimax-coder":
        script = MINIMAX_CODER / ("minimax_interactive_agent.py" if mode == "interactive" else "minimax_direct_coder.py")
        cmd = ["python3", str(script), full_prompt, model, "--max-turns", "25", "--timeout", "600"]
        if mode == "direct" and thinking.get("enabled") is False:
            cmd.extend(["--no-thinking"])
        return cmd

    if backend == "vertex-coder":
        return ["python3", str(VERTEX_CODER / "vertex_interactive_agent.py"), full_prompt, model]

    if backend == "aonios-agent":
        model_map = {
            "MiniMax-M3": "opencode-go/minimax-m3",
            "MiniMax-M2.7": "opencode-go/minimax-m2.7",
            "MiniMax-M2.7-highspeed": "opencode-go/minimax-m2.7-highspeed",
        }
        return ["opencode", "run", "-m", model_map.get(model, model), full_prompt]

    delegate_agents = ["agy", "codex", "grok", "kimi", "opencode"]
    brief_file = log_file.with_suffix(".brief")
    if write_mode in ("logs-only", "none"):
        verify_path_in_task_dir(brief_file, log_file.parent.parent)
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
    if write_mode in ("logs-only", "none"):
        verify_path_in_task_dir(agent_dir, log_file.parent.parent)
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
        "boss_session": boss_session or os.environ.get("APEIRON_SESSION_ID", "unknown"),
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


def validate_team_plan(team_plan: object, available_agents: set[str]) -> tuple[list[str], dict[str, str], str]:
    if not isinstance(team_plan, dict):
        raise ValueError("team_plan must be a JSON object")

    raw_team = team_plan.get("team", [])
    if not isinstance(raw_team, list):
        raise ValueError("team must be an array of agent names")

    raw_tasks = team_plan.get("tasks", {})
    if not isinstance(raw_tasks, dict):
        raise ValueError("tasks must be an object keyed by selected agent name")

    rationale = team_plan.get("rationale", "(no rationale)")
    if not isinstance(rationale, str):
        raise ValueError("rationale must be a string")

    team: list[str] = []
    seen: set[str] = set()
    for raw_name in raw_team:
        if not isinstance(raw_name, str) or not raw_name.strip():
            raise ValueError("team entries must be non-empty agent names")
        name = raw_name.strip()
        if name in seen:
            raise ValueError(f"duplicate agent in team: {name}")
        seen.add(name)
        if name == "atlas":
            continue
        if name not in available_agents:
            raise ValueError(f"unknown agent in team: {name}")
        team.append(name)

    tasks: dict[str, str] = {}
    selected = set(team)
    for raw_name, raw_task in raw_tasks.items():
        if not isinstance(raw_name, str) or not raw_name.strip():
            raise ValueError("task keys must be non-empty agent names")
        name = raw_name.strip()
        if name not in selected:
            raise ValueError(f"task assigned to unselected agent: {name}")
        if not isinstance(raw_task, str):
            raise ValueError(f"task for agent '{name}' must be a string")
        tasks[name] = raw_task

    return team, tasks, rationale


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def resolve_pgid(pid: int) -> int | None:
    try:
        return os.getpgid(pid)
    except OSError:
        return None


def terminate_process_group(pgid: int | None, pid: int | None, grace_seconds: int) -> None:
    if pgid is None and pid is None:
        return
    try:
        if pgid is not None:
            os.killpg(pgid, signal.SIGTERM)
        elif pid is not None:
            os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except OSError:
        return

    deadline = time.time() + grace_seconds
    while pid is not None and process_alive(pid) and time.time() < deadline:
        time.sleep(0.1)

    if pid is not None and process_alive(pid):
        try:
            if pgid is not None:
                os.killpg(pgid, signal.SIGKILL)
            else:
                os.kill(pid, signal.SIGKILL)
        except (ProcessLookupError, OSError):
            pass


def run_atlas(task: str, task_dir: Path, write_mode: str, atlas_timeout: int) -> dict:
    atlas = load_agent("atlas")
    available = list_available_agents()
    available_desc = []
    for name in available:
        if name == "atlas":
            continue
        try:
            a = load_agent(name)
            available_desc.append(f"- {name}: {a.get('description', '')} [{a.get('category', '')}]")
        except Exception:
            pass

    prompt = f"""You are Atlas, the MMAS orchestrator. Analyze this task and select the smallest effective team.

TASK:
{task}

AVAILABLE AGENTS:
{chr(10).join(available_desc)}

Return ONLY valid JSON with this exact shape:
{{
  "team": ["agent1", "agent2"],
  "tasks": {{"agent1": "specific subtask", "agent2": "specific subtask"}},
  "rationale": "one sentence"
}}

Rules:
- Select 1-4 agents. Prefer fewer.
- Never select yourself (atlas).
- Only use agent names from the list above.
- Tasks must be specific and non-overlapping.
"""

    log_file = task_dir / "atlas.log"
    cmd = build_agent_command(atlas, prompt, log_file, write_mode)
    with open(log_file, "w", encoding="utf-8") as log:
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, text=True, env=get_clean_env(write_mode, task_dir, atlas.get("backend")), start_new_session=True)
        try:
            proc.wait(timeout=atlas_timeout)
        except subprocess.TimeoutExpired:
            terminate_process_group(resolve_pgid(proc.pid), proc.pid, MMAS_DEFAULTS["killGracePeriod"])
            raise RuntimeError(f"Atlas timed out after {atlas_timeout}s")

    if proc.returncode != 0:
        raise RuntimeError(f"Atlas failed with exit code {proc.returncode}")

    summary_path = log_file.with_suffix(".summary")
    content = summary_path.read_text(encoding="utf-8") if summary_path.exists() else log_file.read_text(encoding="utf-8")

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("Atlas did not return valid JSON")
    try:
        return json.loads(content[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Atlas returned malformed JSON: {exc}") from exc


def spawn_team(args) -> int:
    write_mode = resolve_write_mode(args)
    task_id = "task-" + uuid.uuid4().hex[:12]
    task_dir = MMAS_TASKS_ROOT / task_id
    task_dir.mkdir(parents=True, exist_ok=False)
    boulder_path = task_dir / "boulder.json"

    team_names = [x.strip() for x in args.team.split(",") if x.strip()] if args.team else []
    subtasks: dict[str, str] = {}
    atlas_rationale = None

    if args.atlas:
        print("🗺️  Atlas is selecting the team...")
        try:
            team_plan = run_atlas(args.task, task_dir, write_mode, args.atlas_timeout)
            team_names, subtasks, atlas_rationale = validate_team_plan(team_plan, set(list_available_agents()))
        except Exception as exc:
            print(f"Atlas planning failed: {exc}", file=sys.stderr)
            boulder = make_boulder(task_id, args.task, [], args.boss_session)
            boulder["status"] = "failed"
            boulder["failure_reason"] = str(exc)
            append_event(boulder, "atlas_failed", str(exc))
            write_boulder(boulder_path, boulder)
            return 2

    if not team_names:
        print("No team specified. Use --team or --atlas.", file=sys.stderr)
        return 2

    if len(set(team_names)) != len(team_names):
        print("Duplicate agent names are not allowed in --team.", file=sys.stderr)
        return 2

    ok, msg = enforce_guardrails(args, len(team_names))
    if not ok:
        print(f"Guardrail rejection: {msg}", file=sys.stderr)
        return 2

    agents = []
    for name in team_names:
        try:
            agents.append(load_agent(name))
        except FileNotFoundError as exc:
            print(str(exc), file=sys.stderr)
            return 2

    compatible, reason = check_write_policy_compatibility(agents, write_mode)
    if not compatible:
        print(f"Policy Rejection: {reason}", file=sys.stderr)
        boulder = make_boulder(task_id, args.task, agents, args.boss_session)
        boulder["status"] = "failed"
        boulder["write_policy"] = {
            "requested_mode": args.write_mode,
            "resolved_mode": write_mode,
            "approved_writable_roots": [str(task_dir)] if write_mode in ("logs-only", "none") else [str(DELEGATE_TEAM_ROOT)],
            "enforcement_mechanism": "isolated_task_directory_enforcement" if write_mode in ("logs-only", "none") else "workspace",
            "backend_compatibility_decision": "rejected",
            "reason": reason,
        }
        write_boulder(boulder_path, boulder)
        print(f"Task ID: {task_id}")
        return 2

    boulder = make_boulder(task_id, args.task, agents, args.boss_session)
    boulder["write_policy"] = {
        "requested_mode": args.write_mode,
        "resolved_mode": write_mode,
        "approved_writable_roots": [str(task_dir)] if write_mode in ("logs-only", "none") else [str(DELEGATE_TEAM_ROOT)],
        "enforcement_mechanism": "isolated_task_directory_enforcement" if write_mode in ("logs-only", "none") else "workspace",
        "backend_compatibility_decision": "approved",
    }
    if atlas_rationale:
        boulder["atlas_rationale"] = atlas_rationale
    write_boulder(boulder_path, boulder)

    print(f"🪨 MMAS Boulder created: {task_id}")
    print(f"   Task: {args.task}")
    print(f"   Team: {', '.join(team_names)}")
    print(f"   Write mode: {write_mode}")
    print(f"   Timeout: {args.timeout}s | Max agents: {args.max_agents}")
    if args.plan_only:
        boulder["status"] = "planned"
        append_event(boulder, "plan_only", "Plan generated without spawning workers")
        write_boulder(boulder_path, boulder)
        print(f"   Plan-only: {boulder_path}")
        return 0

    spawned_indices: list[int] = []
    spawn_failed = False
    for i, agent in enumerate(agents):
        name = agent["name"]
        agent_task = subtasks.get(name, args.task)
        log_file = task_dir / f"agent-{name}.log"
        cmd = build_agent_command(agent, agent_task, log_file, write_mode)
        print(f"   Spawning {name} ({agent.get('model')})...")
        try:
            log_handle = open(log_file, "w", encoding="utf-8")
            try:
                proc = subprocess.Popen(cmd, stdout=log_handle, stderr=subprocess.STDOUT, text=True, env=get_clean_env(write_mode, task_dir, agent.get("backend")), start_new_session=True)
            finally:
                log_handle.close()
        except Exception as exc:
            spawn_failed = True
            boulder["agents"][i]["status"] = "spawn_failed"
            boulder["agents"][i]["completed_at"] = utc_now()
            boulder["agents"][i]["exit_code"] = -1
            append_event(boulder, "agent_spawn_failed", f"{name}: {exc}")
            print(f"   ❌ Failed to spawn {name}: {exc}", file=sys.stderr)
            break

        pgid = resolve_pgid(proc.pid)
        boulder["agents"][i].update(
            {
                "pid": proc.pid,
                "pgid": pgid,
                "status": "running",
                "started_at": utc_now(),
                "last_activity": utc_now(),
                "log_file": str(log_file),
                "summary_file": str(log_file.with_suffix(".summary")),
            }
        )
        spawned_indices.append(i)
        append_event(boulder, "agent_spawned", f"{name} pid={proc.pid} pgid={pgid}")
        write_boulder(boulder_path, boulder)

    if spawn_failed:
        for i in spawned_indices:
            agent_state = boulder["agents"][i]
            terminate_process_group(agent_state.get("pgid"), agent_state.get("pid"), args.kill_grace)
            agent_state["status"] = "killed"
            agent_state["completed_at"] = utc_now()
            append_event(boulder, "agent_killed", f"{agent_state['name']} terminated after spawn failure")
        for i, agent_state in enumerate(boulder["agents"]):
            if i not in spawned_indices and agent_state["status"] == "pending":
                agent_state["status"] = "cancelled"
                agent_state["completed_at"] = utc_now()
        boulder["status"] = "failed"
        boulder["failure_reason"] = "agent spawn failed"
        write_boulder(boulder_path, boulder)
        print(f"Task ID: {task_id}")
        return 2

    watchdog_log = task_dir / "watchdog.log"
    watchdog_handle = open(watchdog_log, "w", encoding="utf-8")
    try:
        watchdog_proc = subprocess.Popen(
            [str(MMAS_ROOT / "watchdog.sh"), str(boulder_path), str(args.interval), str(args.timeout), str(args.kill_grace)],
            stdout=watchdog_handle,
            stderr=subprocess.STDOUT,
            text=True,
            env=get_clean_env(write_mode, task_dir),
            start_new_session=True,
        )
    finally:
        watchdog_handle.close()
    boulder["watchdog_pid"] = watchdog_proc.pid
    boulder["watchdog_pgid"] = resolve_pgid(watchdog_proc.pid)
    append_event(boulder, "watchdog_spawned", f"pid={watchdog_proc.pid} pgid={boulder['watchdog_pgid']}")
    write_boulder(boulder_path, boulder)

    print(f"   Watchdog: pid={watchdog_proc.pid}")
    print(f"   Boulder: {boulder_path}")
    print(f"   Logs: {task_dir}/agent-*.log")
    print(f"\nTask ID: {task_id}")
    return 0


def status_task(task_id: str) -> int:
    task_dir = MMAS_TASKS_ROOT / task_id
    boulder_path = task_dir / "boulder.json"
    if not boulder_path.exists():
        print(f"Task not found: {task_id}", file=sys.stderr)
        return 2
    boulder = read_boulder(boulder_path)
    print(json.dumps(boulder, indent=2, ensure_ascii=False))
    return 0


def kill_task(task_id: str, grace_seconds: int) -> int:
    task_dir = MMAS_TASKS_ROOT / task_id
    boulder_path = task_dir / "boulder.json"
    if not boulder_path.exists():
        print(f"Task not found: {task_id}", file=sys.stderr)
        return 2
    boulder = read_boulder(boulder_path)
    for agent in boulder.get("agents", []):
        terminate_process_group(agent.get("pgid"), agent.get("pid"), grace_seconds)
        if agent.get("status") in {"running", "pending"}:
            agent["status"] = "killed"
            agent["completed_at"] = utc_now()
    terminate_process_group(boulder.get("watchdog_pgid"), boulder.get("watchdog_pid"), grace_seconds)
    boulder["status"] = "killed"
    append_event(boulder, "task_killed", "Task terminated by kill command")
    write_boulder(boulder_path, boulder)
    print(f"Killed task {task_id}")
    return 0


def list_tasks() -> int:
    if not MMAS_TASKS_ROOT.exists():
        print("No MMAS tasks found.")
        return 0
    rows = []
    for p in sorted(MMAS_TASKS_ROOT.glob("task-*/boulder.json"), reverse=True):
        try:
            b = read_boulder(p)
            rows.append((b.get("task_id"), b.get("status"), b.get("task", "")[:60]))
        except Exception:
            continue
    if not rows:
        print("No MMAS tasks found.")
        return 0
    for task_id, status, task in rows:
        print(f"{task_id}\t{status}\t{task}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MMAS local multi-agent orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)

    spawn = sub.add_parser("spawn", help="Spawn a bounded agent team")
    spawn.add_argument("task", help="Task for the team")
    spawn.add_argument("--team", help="Comma-separated agent names")
    spawn.add_argument("--atlas", action="store_true", help="Let Atlas select the team")
    spawn.add_argument("--plan-only", action="store_true", help="Plan but do not spawn workers")
    spawn.add_argument("--max-agents", type=int, default=MMAS_DEFAULTS["maxAgents"])
    spawn.add_argument("--timeout", type=int, default=MMAS_DEFAULTS["timeoutSeconds"])
    spawn.add_argument("--interval", type=int, default=MMAS_DEFAULTS["watchdogInterval"])
    spawn.add_argument("--atlas-timeout", type=int, default=MMAS_DEFAULTS["atlasTimeout"])
    spawn.add_argument("--kill-grace", type=int, default=MMAS_DEFAULTS["killGracePeriod"])
    spawn.add_argument("--write-mode", choices=["workspace", "logs-only", "none"], default=MMAS_DEFAULTS["writeMode"])
    spawn.add_argument("--no-write", action="store_true", help="Alias for --write-mode none")
    spawn.add_argument("--boss-session")

    status = sub.add_parser("status", help="Show task status")
    status.add_argument("task_id")

    kill = sub.add_parser("kill", help="Kill task workers and watchdog")
    kill.add_argument("task_id")
    kill.add_argument("--kill-grace", type=int, default=MMAS_DEFAULTS["killGracePeriod"])

    sub.add_parser("list", help="List tasks")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "spawn":
        return spawn_team(args)
    if args.command == "status":
        return status_task(args.task_id)
    if args.command == "kill":
        return kill_task(args.task_id, args.kill_grace)
    if args.command == "list":
        return list_tasks()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
