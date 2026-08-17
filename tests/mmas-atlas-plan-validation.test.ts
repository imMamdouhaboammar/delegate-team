import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const spawnTeamScript = path.join(repoRoot, 'mmas', 'spawn-team.py');
const tempRoots: string[] = [];

function runPython(source: string): string {
  return execFileSync('python3', ['-c', source], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function pythonImportPrelude(): string {
  return `
import importlib.util
import json
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location("spawn_team", r"${spawnTeamScript}")
spawn_team = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spawn_team)
`;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('MMAS Atlas team plan validation', () => {
  it('rejects malformed plan shapes before worker selection', () => {
    const output = runPython(`${pythonImportPrelude()}
cases = [
    [],
    {"team": "reviewer", "tasks": {}},
    {"team": ["reviewer"], "tasks": []},
]
errors = []
for case in cases:
    try:
        spawn_team.validate_team_plan(case, {"reviewer", "tester"})
        errors.append("accepted")
    except ValueError as exc:
        errors.append(str(exc))
print(json.dumps(errors))
`);

    const errors = JSON.parse(output) as string[];
    expect(errors).toHaveLength(3);
    expect(errors.every((value) => value !== 'accepted')).toBe(true);
    expect(errors[0]).toContain('object');
    expect(errors[1]).toContain('team');
    expect(errors[2]).toContain('tasks');
  });

  it('rejects unknown, duplicate, and out-of-scope task assignments', () => {
    const output = runPython(`${pythonImportPrelude()}
cases = [
    {"team": ["reviewer", "ghost"], "tasks": {}},
    {"team": ["reviewer", "reviewer"], "tasks": {}},
    {"team": ["atlas", "atlas", "reviewer"], "tasks": {}},
    {"team": ["reviewer"], "tasks": {"tester": "verify it"}},
]
errors = []
for case in cases:
    try:
        spawn_team.validate_team_plan(case, {"atlas", "reviewer", "tester"})
        errors.append("accepted")
    except ValueError as exc:
        errors.append(str(exc))
print(json.dumps(errors))
`);

    const errors = JSON.parse(output) as string[];
    expect(errors[0]).toContain('unknown agent');
    expect(errors[1]).toContain('duplicate');
    expect(errors[2]).toContain('duplicate');
    expect(errors[3]).toContain('unselected agent');
  });

  it('normalizes a valid bounded Atlas plan without trusting Atlas itself as a child', () => {
    const output = runPython(`${pythonImportPrelude()}
team, tasks, rationale = spawn_team.validate_team_plan(
    {
        "team": ["atlas", "reviewer", "tester"],
        "tasks": {"reviewer": "review diff", "tester": "run tests"},
        "rationale": "independent review",
    },
    {"atlas", "reviewer", "tester"},
)
print(json.dumps({"team": team, "tasks": tasks, "rationale": rationale}))
`);

    expect(JSON.parse(output)).toEqual({
      team: ['reviewer', 'tester'],
      tasks: { reviewer: 'review diff', tester: 'run tests' },
      rationale: 'independent review',
    });
  });

  it('records invalid Atlas output as terminal failure with inspectable evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-team-atlas-plan-'));
    tempRoots.push(root);
    const boulderPath = path.join(root, 'boulder.json');
    fs.writeFileSync(
      boulderPath,
      JSON.stringify(
        {
          task_id: 'task-test',
          task: 'test invalid atlas output',
          status: 'awaiting_team_plan',
          agents: [
            {
              name: 'atlas',
              status: 'running',
              pid: null,
              completed_at: null,
            },
          ],
          events: [],
        },
        null,
        2,
      ),
    );

    runPython(`${pythonImportPrelude()}
spawn_team.record_atlas_plan_failure(
    Path(r"${boulderPath}"),
    None,
    0,
    "invalid_team_plan",
    "team must be an array",
)
`);

    const boulder = JSON.parse(fs.readFileSync(boulderPath, 'utf8'));
    expect(boulder.status).toBe('failed');
    expect(boulder.stop_reason).toBe('invalid_team_plan');
    expect(boulder.failure).toEqual({
      type: 'invalid_team_plan',
      detail: 'team must be an array',
    });
    expect(boulder.agents[0].status).toBe('error');
    expect(boulder.agents[0].completed_at).toMatch(/Z$/);
    expect(boulder.events.at(-1)?.type).toBe('team_plan_rejected');
  });

  it('fails closed in cmd_spawn_atlas before spawning children when Atlas writes a malformed plan', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-team-atlas-command-'));
    tempRoots.push(root);

    const output = runPython(`${pythonImportPrelude()}
from types import SimpleNamespace

root = Path(r"${root}")
spawn_team.MMAS_TASKS_ROOT = root
atlas_agent = {
    "name": "atlas",
    "backend": "mock-backend",
    "model": "AtlasModel",
    "power": "planner",
    "description": "deterministic planner",
}
reviewer_agent = {
    "name": "reviewer",
    "backend": "mock-backend",
    "model": "ReviewModel",
    "power": "reviewer",
    "description": "deterministic reviewer",
}

spawn_team.load_agent = lambda name: atlas_agent if name == "atlas" else reviewer_agent
spawn_team.list_available_agents = lambda: ["atlas", "reviewer"]
spawn_team.time.sleep = lambda _seconds: None

def fake_spawn_one_agent(agent, prompt, task_dir, log_dir, boulder_path, write_mode="workspace"):
    if agent["name"] == "atlas":
        (task_dir / "team_plan.json").write_text('{"team":"reviewer","tasks":{}}', encoding="utf-8")
    else:
        raise AssertionError("child worker must not be spawned for malformed Atlas output")

spawn_team.spawn_one_agent = fake_spawn_one_agent
spawn_team.start_watchdog = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("watchdog must not start"))

args = SimpleNamespace(
    task="test malformed atlas plan",
    no_write=False,
    write_mode="workspace",
    max_agents=4,
    timeout=900,
    kill_grace=0,
    plan_only=False,
    boss_session=None,
    logs_enabled=True,
    atlas_timeout=2,
    interval=30,
)

code = spawn_team.cmd_spawn_atlas(args)
task_dirs = sorted(root.glob("task-*"))
if len(task_dirs) != 1:
    raise AssertionError(f"expected one task directory, got {len(task_dirs)}")
boulder = json.loads((task_dirs[0] / "boulder.json").read_text(encoding="utf-8"))
print(json.dumps({
    "code": code,
    "status": boulder.get("status"),
    "stop_reason": boulder.get("stop_reason"),
    "watchdog_pid": boulder.get("watchdog_pid"),
    "agent_names": [agent.get("name") for agent in boulder.get("agents", [])],
}))
`);

    const resultLine = output.split('\n').at(-1);
    expect(resultLine).toBeDefined();
    expect(JSON.parse(resultLine!)).toEqual({
      code: 1,
      status: 'failed',
      stop_reason: 'invalid_team_plan',
      watchdog_pid: null,
      agent_names: ['atlas'],
    });
  });

  it('records post-plan write-policy rejection as terminal Atlas failure without spawning children', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-team-atlas-policy-'));
    tempRoots.push(root);

    const output = runPython(`${pythonImportPrelude()}
from types import SimpleNamespace

root = Path(r"${root}")
spawn_team.MMAS_TASKS_ROOT = root
atlas_agent = {
    "name": "atlas",
    "backend": "mock-backend",
    "model": "AtlasModel",
    "power": "planner",
    "description": "deterministic planner",
}
reviewer_agent = {
    "name": "reviewer",
    "backend": "minimax-coder",
    "model": "ReviewModel",
    "power": "reviewer",
    "description": "deterministic reviewer",
}

spawn_team.load_agent = lambda name: atlas_agent if name == "atlas" else reviewer_agent
spawn_team.list_available_agents = lambda: ["atlas", "reviewer"]
spawn_team.time.sleep = lambda _seconds: None

def fake_spawn_one_agent(agent, prompt, task_dir, log_dir, boulder_path, write_mode="workspace"):
    if agent["name"] == "atlas":
        (task_dir / "team_plan.json").write_text('{"team":["reviewer"],"tasks":{"reviewer":"review"}}', encoding="utf-8")
    else:
        raise AssertionError("child worker must not be spawned after policy rejection")

spawn_team.spawn_one_agent = fake_spawn_one_agent
spawn_team.start_watchdog = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("watchdog must not start"))

args = SimpleNamespace(
    task="test post-plan policy rejection",
    no_write=True,
    write_mode="workspace",
    max_agents=4,
    timeout=900,
    kill_grace=0,
    plan_only=False,
    boss_session=None,
    logs_enabled=True,
    atlas_timeout=2,
    interval=30,
)

code = spawn_team.cmd_spawn_atlas(args)
task_dirs = sorted(root.glob("task-*"))
if len(task_dirs) != 1:
    raise AssertionError(f"expected one task directory, got {len(task_dirs)}")
boulder = json.loads((task_dirs[0] / "boulder.json").read_text(encoding="utf-8"))
atlas = next(agent for agent in boulder.get("agents", []) if agent.get("name") == "atlas")
print(json.dumps({
    "code": code,
    "status": boulder.get("status"),
    "stop_reason": boulder.get("stop_reason"),
    "failure_type": boulder.get("failure", {}).get("type"),
    "atlas_status": atlas.get("status"),
    "atlas_completed": bool(atlas.get("completed_at")),
    "policy_decision": boulder.get("write_policy", {}).get("backend_compatibility_decision"),
    "policy_reason": boulder.get("write_policy", {}).get("policy_rejection_reason", ""),
    "last_event": boulder.get("events", [{}])[-1].get("type"),
    "watchdog_pid": boulder.get("watchdog_pid"),
    "agent_names": [agent.get("name") for agent in boulder.get("agents", [])],
}))
`);

    const resultLine = output.split('\n').at(-1);
    expect(resultLine).toBeDefined();
    const result = JSON.parse(resultLine!);
    expect(result).toMatchObject({
      code: 3,
      status: 'failed',
      stop_reason: 'policy_rejection',
      failure_type: 'policy_rejection',
      atlas_status: 'error',
      atlas_completed: true,
      policy_decision: 'rejected',
      last_event: 'team_plan_rejected',
      watchdog_pid: null,
      agent_names: ['atlas'],
    });
    expect(result.policy_reason).toContain('does not support write mode');
  });
});
