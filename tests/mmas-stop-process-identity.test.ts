import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeBoulder(taskRoot: string, taskId: string, agent: Record<string, unknown>) {
  const taskDir = join(taskRoot, taskId);
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(
    join(taskDir, 'boulder.json'),
    JSON.stringify({
      task_id: taskId,
      task: 'stop process identity contract',
      status: 'running',
      watchdog_pid: null,
      agents: [agent],
      events: [],
    }),
  );
  return taskDir;
}

describe('MMAS stop process identity', () => {
  it('does not terminate an unrelated process that reused a recorded worker PID', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-stop-pid-reuse-'));
    const taskRoot = join(root, 'tasks');
    const taskId = 'reused-worker-pid';
    const unrelated = spawn('bash', ['-c', 'while :; do sleep 1; done'], {
      detached: true,
      stdio: 'ignore',
    });
    unrelated.unref();
    expect(unrelated.pid).toBeTypeOf('number');
    const reusedPid = unrelated.pid!;

    try {
      const taskDir = writeBoulder(taskRoot, taskId, {
        name: 'worker',
        status: 'running',
        pid: reusedPid,
        pgid: reusedPid,
        started_at: '2000-01-01T00:00:00Z',
      });

      const result = spawnSync('python3', [resolve('mmas/spawn-team.py'), 'stop', taskId, '--grace', '0'], {
        env: { ...process.env, MMAS_TASKS_ROOT: taskRoot },
        encoding: 'utf8',
        timeout: 8000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(processExists(reusedPid)).toBe(true);

      const boulder = JSON.parse(readFileSync(join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.status).toBe('stopped');
      expect(boulder.agents[0].status).toBe('running');
      expect(boulder.events.at(-1)?.detail).toContain('identity mismatch');
    } finally {
      try {
        process.kill(-reusedPid, 'SIGKILL');
      } catch {
        // Cleanup only; stop must leave this unrelated process untouched.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still terminates a process whose start time matches the recorded worker identity', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-stop-matching-pid-'));
    const taskRoot = join(root, 'tasks');
    const taskId = 'matching-worker-pid';
    const worker = spawn('bash', ['-c', 'while :; do sleep 1; done'], {
      detached: true,
      stdio: 'ignore',
    });
    worker.unref();
    expect(worker.pid).toBeTypeOf('number');
    const workerPid = worker.pid!;

    try {
      const taskDir = writeBoulder(taskRoot, taskId, {
        name: 'worker',
        status: 'running',
        pid: workerPid,
        pgid: workerPid,
        started_at: new Date().toISOString(),
      });

      const result = spawnSync('python3', [resolve('mmas/spawn-team.py'), 'stop', taskId, '--grace', '0'], {
        env: { ...process.env, MMAS_TASKS_ROOT: taskRoot },
        encoding: 'utf8',
        timeout: 8000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);

      const boulder = JSON.parse(readFileSync(join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.status).toBe('stopped');
      expect(boulder.agents[0].status).toBe('stopped');
    } finally {
      try {
        process.kill(-workerPid, 'SIGKILL');
      } catch {
        // Expected when stop correctly terminates the matching worker.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
