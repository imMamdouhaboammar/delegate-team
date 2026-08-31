import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

describe('MMAS watchdog process-group identity', () => {
  it('does not signal a recorded PGID that no longer belongs to the verified worker PID', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-watchdog-pgid-'));
    const home = join(root, 'home');
    const taskId = 'stale-pgid-must-not-be-signaled';
    const taskDir = join(home, '.apeiron', 'multi-agent', 'tasks', taskId);
    const fakeBin = join(root, 'bin');
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });

    const fakeApeiron = join(fakeBin, 'apeiron');
    writeFileSync(fakeApeiron, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeApeiron, 0o755);

    const worker = spawn('bash', ['-c', 'while :; do sleep 1; done'], { detached: true, stdio: 'ignore' });
    const unrelated = spawn('bash', ['-c', 'while :; do sleep 1; done'], { detached: true, stdio: 'ignore' });
    worker.unref();
    unrelated.unref();
    expect(worker.pid).toBeTypeOf('number');
    expect(unrelated.pid).toBeTypeOf('number');
    const workerPid = worker.pid!;
    const unrelatedPid = unrelated.pid!;
    const workerLog = join(taskDir, 'worker.log');
    writeFileSync(workerLog, 'running\n');

    try {
      writeFileSync(
        join(taskDir, 'boulder.json'),
        JSON.stringify({
          task: 'stale pgid authority boundary',
          status: 'running',
          guardrails: { timeoutSeconds: 1, killGracePeriod: 0, writeMode: 'workspace' },
          agents: [{
            name: 'worker',
            status: 'running',
            pid: workerPid,
            pgid: unrelatedPid,
            log_file: workerLog,
            summary_file: join(taskDir, 'worker.summary'),
          }],
        }),
      );

      const result = spawnSync('bash', [resolve('mmas/watchdog.sh'), taskId, 'boss-session', '--interval', '1'], {
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
        timeout: 8000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(processExists(unrelatedPid)).toBe(true);
      expect(result.stderr).toContain('recorded PGID');
    } finally {
      for (const pid of [workerPid, unrelatedPid]) {
        try { process.kill(-pid, 'SIGKILL'); } catch { /* cleanup only */ }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
