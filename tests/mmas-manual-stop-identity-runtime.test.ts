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

describe('MMAS manual stop identity boundary', () => {
  it('does not signal a live PID when persisted started_at cannot identify that worker', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-stop-identity-'));
    const tasksRoot = join(root, 'tasks');
    const taskId = 'manual-stop-must-not-trust-stale-pid';
    const taskDir = join(tasksRoot, taskId);
    mkdirSync(taskDir, { recursive: true });

    const unrelated = spawn('bash', ['-c', 'while :; do sleep 1; done'], {
      detached: true,
      stdio: 'ignore',
    });
    unrelated.unref();
    expect(unrelated.pid).toBeTypeOf('number');
    const unrelatedPid = unrelated.pid!;

    try {
      writeFileSync(
        join(taskDir, 'boulder.json'),
        JSON.stringify({
          task_id: taskId,
          task: 'manual stop identity boundary',
          status: 'running',
          watchdog_pid: null,
          watchdog_pgid: null,
          agents: [
            {
              name: 'worker',
              status: 'running',
              pid: unrelatedPid,
              pgid: unrelatedPid,
              started_at: 'definitely-not-a-timestamp',
            },
          ],
          events: [],
        }),
      );

      const result = spawnSync(
        'python3',
        [resolve('mmas/spawn-team.py'), 'stop', taskId, '--grace', '0'],
        {
          env: { ...process.env, MMAS_TASKS_ROOT: tasksRoot },
          encoding: 'utf8',
          timeout: 8000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(processExists(unrelatedPid)).toBe(true);

      const boulder = JSON.parse(readFileSync(join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.status).toBe('stop_incomplete');
      expect(boulder.stop_reason).toBe('user_stop_incomplete');
      expect(boulder.agents[0].status).toBe('stop_refused');
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('identity evidence is malformed');
      expect(result.stdout).toContain('refusing to signal');
    } finally {
      try {
        process.kill(-unrelatedPid, 'SIGKILL');
      } catch {
        // Cleanup only; manual stop must not terminate this unrelated process.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
