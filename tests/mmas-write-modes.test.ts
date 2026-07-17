import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

describe('MMAS Write Modes Enforcement', () => {
  const tmpDir = path.join(os.tmpdir(), `mmas-test-${Date.now()}`);
  const agentsDir = path.join(tmpDir, 'agents');
  const tasksRoot = path.join(tmpDir, 'tasks');
  const workspaceRoot = process.cwd();
  const spawnTeamScript = path.join(workspaceRoot, 'mmas', 'spawn-team.py');

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(tasksRoot, { recursive: true });

    // Write agent definitions
    fs.writeFileSync(
      path.join(agentsDir, 'mock-agent.yaml'),
      `
name: mock-agent
backend: mock-backend
model: MockModel
power: Mock power
description: Mock description
`
    );

    fs.writeFileSync(
      path.join(agentsDir, 'unsafe-agent.yaml'),
      `
name: unsafe-agent
backend: minimax-coder
model: MiniMax-M3
power: MiniMax coder power
description: Minimax description
`
    );

    // Mock atlas agent to pick mock-agent
    fs.writeFileSync(
      path.join(agentsDir, 'atlas.yaml'),
      `
name: atlas
backend: mock-backend
model: AtlasModel
power: Atlas power
description: Atlas description
`
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  const runSpawnTeam = (args: string[], env: any = {}) => {
    try {
      const stdout = execSync(
        `python3 "${spawnTeamScript}" ${args.join(' ')}`,
        {
          env: {
            ...process.env,
            MMAS_AGENTS_DIR: agentsDir,
            MMAS_TASKS_ROOT: tasksRoot,
            DELEGATE_TEAM_ROOT: workspaceRoot,
            ...env,
          },
          encoding: 'utf8',
          stdio: 'pipe',
        }
      );
      return { status: 0, stdout, stderr: '' };
    } catch (error: any) {
      return {
        status: error.status || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  };

  const getTaskId = (stdout: string): string | null => {
    const match = stdout.match(/Task ID:\s+(task-\S+)/i);
    return match ? match[1] : null;
  };

  it('1. --no-write resolves to none and rejects unsafe-agent', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'unsafe-agent', '--no-write']);
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toContain("does not support write mode 'none'");
  });

  it('2. --write-mode none resolves to none and rejects unsafe-agent', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'unsafe-agent', '--write-mode', 'none']);
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toContain("does not support write mode 'none'");
  });

  it('3. none rejects minimax-coder before process spawn', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'unsafe-agent', '--write-mode', 'none']);
    expect(res.status).not.toBe(0);
    
    const taskId = getTaskId(res.stdout + res.stderr);
    expect(taskId).not.toBeNull();
    if (taskId) {
      const boulder = JSON.parse(
        fs.readFileSync(path.join(tasksRoot, taskId, 'boulder.json'), 'utf8')
      );
      expect(boulder.status).toBe('failed');
      expect(boulder.agents[0].pid).toBeNull();
      expect(boulder.watchdog_pid).toBeNull();
    }
  });

  it('4. logs-only rejects unsafe-agent', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'unsafe-agent', '--write-mode', 'logs-only']);
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toContain("does not support write mode 'logs-only'");
  });

  it('5. logs-only allows mock-backend and uses isolated directory', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'mock-agent', '--write-mode', 'logs-only', '--interval', '1']);
    expect(res.status).toBe(0);

    const taskId = getTaskId(res.stdout);
    expect(taskId).not.toBeNull();
    if (taskId) {
      const taskDir = path.join(tasksRoot, taskId);
      expect(fs.existsSync(taskDir)).toBe(true);
      expect(fs.existsSync(path.join(taskDir, 'boulder.json'))).toBe(true);

      const boulder = JSON.parse(fs.readFileSync(path.join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.write_policy.resolved_mode).toBe('logs-only');
      expect(boulder.write_policy.approved_writable_roots[0]).toBe(taskDir);
    }
  });

  it('6. path traversal in verify_path_in_task_dir is rejected', () => {
    const script = `
import sys, os
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("spawn_team", os.path.join(os.getcwd(), "mmas", "spawn-team.py"))
spawn_team = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spawn_team)
verify_path_in_task_dir = spawn_team.verify_path_in_task_dir

task_dir = Path('${tmpDir}/tasks/some-task')
try:
    verify_path_in_task_dir(Path('${tmpDir}/tasks/some-task/../../outside.txt'), task_dir)
    print("ALLOWED")
except ValueError as e:
    print("BLOCKED:", str(e))
`;
    const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
    expect(out).toContain('BLOCKED');
  });

  it('7. symlink escape is rejected in verify_path_in_task_dir', () => {
    const taskDir = path.join(tmpDir, 'tasks', 'symlink-task');
    fs.mkdirSync(taskDir, { recursive: true });
    
    // Create a symlink pointing outside
    const linkPath = path.join(taskDir, 'escapelink.log');
    const targetPath = path.join(tmpDir, 'outside.txt');
    fs.writeFileSync(targetPath, 'outside content');
    
    try {
      fs.symlinkSync(targetPath, linkPath);
    } catch (e) {
      // Platform might not support symlinks, skip check if so
      return;
    }

    const script = `
import sys, os
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("spawn_team", os.path.join(os.getcwd(), "mmas", "spawn-team.py"))
spawn_team = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spawn_team)
verify_path_in_task_dir = spawn_team.verify_path_in_task_dir

task_dir = Path('${taskDir}')
try:
    verify_path_in_task_dir(Path('${linkPath}'), task_dir)
    print("ALLOWED")
except ValueError as e:
    print("BLOCKED:", str(e))
`;
    const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
    expect(out).toContain('BLOCKED');
  });

  it('8. workspace mode preserves existing execution flow', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'mock-agent', '--write-mode', 'workspace', '--interval', '1']);
    expect(res.status).toBe(0);

    const taskId = getTaskId(res.stdout);
    expect(taskId).not.toBeNull();
    if (taskId) {
      const boulder = JSON.parse(
        fs.readFileSync(path.join(tasksRoot, taskId, 'boulder.json'), 'utf8')
      );
      expect(boulder.write_policy.resolved_mode).toBe('workspace');
    }
  });

  it('9. task metadata records actual enforcement result', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--team', 'mock-agent', '--write-mode', 'logs-only', '--interval', '1']);
    expect(res.status).toBe(0);

    const taskId = getTaskId(res.stdout);
    expect(taskId).not.toBeNull();
    if (taskId) {
      const boulder = JSON.parse(
        fs.readFileSync(path.join(tasksRoot, taskId, 'boulder.json'), 'utf8')
      );

      expect(boulder.write_policy).toBeDefined();
      expect(boulder.write_policy.requested_mode).toBe('logs-only');
      expect(boulder.write_policy.resolved_mode).toBe('logs-only');
      expect(boulder.write_policy.enforcement_mechanism).toBe('isolated_task_directory_enforcement');
      expect(boulder.write_policy.backend_compatibility_decision).toBe('approved');
    }
  });

  it('10. Atlas inherits the requested mode', () => {
    const res = runSpawnTeam(['spawn', 'test-task', '--atlas', '--write-mode', 'logs-only', '--plan-only']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Write mode: logs-only');
  });
});
