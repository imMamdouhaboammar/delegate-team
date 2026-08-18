import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const spawnTeamScript = path.join(repoRoot, 'mmas', 'spawn-team.py');
const tempRoots: string[] = [];

function runPython(source: string, env: NodeJS.ProcessEnv = {}): string {
  return execFileSync('python3', ['-c', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim();
}

function pythonImportPrelude(): string {
  return `
import importlib.util
import json
spec = importlib.util.spec_from_file_location("spawn_team", r"${spawnTeamScript}")
spawn_team = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spawn_team)
`;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('MMAS agent configuration containment', () => {
  it('loads a normal agent from the configured agents directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-team-agent-path-'));
    tempRoots.push(root);
    const agentsDir = path.join(root, 'agents');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(path.join(agentsDir, 'reviewer.yaml'), 'name: reviewer\nbackend: mock-backend\n');

    const output = runPython(`${pythonImportPrelude()}\nprint(json.dumps(spawn_team.load_agent("reviewer")))`, {
      MMAS_AGENTS_DIR: agentsDir,
    });
    expect(JSON.parse(output)).toMatchObject({ name: 'reviewer', backend: 'mock-backend' });
  });

  it('rejects traversal that would load YAML outside the configured agents directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-team-agent-path-'));
    tempRoots.push(root);
    const agentsDir = path.join(root, 'agents');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(path.join(root, 'outside.yaml'), 'name: outside\nbackend: mock-backend\n');

    const output = runPython(`${pythonImportPrelude()}\ntry:\n    spawn_team.load_agent("../outside")\n    print("LOADED_OUTSIDE")\nexcept ValueError as exc:\n    print("REJECTED:" + str(exc))`, {
      MMAS_AGENTS_DIR: agentsDir,
    });
    expect(output).toContain('REJECTED:');
    expect(output).not.toContain('LOADED_OUTSIDE');
  });

  it('rejects absolute-path shaped agent names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delegate-team-agent-path-'));
    tempRoots.push(root);
    const agentsDir = path.join(root, 'agents');
    fs.mkdirSync(agentsDir);

    const output = runPython(`${pythonImportPrelude()}\ntry:\n    spawn_team.load_agent("/tmp/rogue")\n    print("ACCEPTED")\nexcept ValueError as exc:\n    print("REJECTED:" + str(exc))`, {
      MMAS_AGENTS_DIR: agentsDir,
    });
    expect(output).toContain('REJECTED:');
    expect(output).not.toContain('ACCEPTED');
  });
});
