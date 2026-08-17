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
    {"team": ["reviewer"], "tasks": {"tester": "verify it"}},
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
    expect(errors[0]).toContain('unknown agent');
    expect(errors[1]).toContain('duplicate');
    expect(errors[2]).toContain('unselected agent');
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
});
