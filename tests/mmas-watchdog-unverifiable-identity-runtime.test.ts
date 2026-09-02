import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

describe('MMAS watchdog unverifiable identity runtime boundary', () => {
  it('does not signal a live PID when persisted started_at is malformed', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-unverifiable-identity-'));
    const home = join(root, 'home');
    const taskId = 'malformed-started-at-must-not-authorize';
    const taskDir = join(home, '.apeiron', 'multi-agent', 'tasks', taskId);
    const fakeBin = join(root, 'bin');
    const workerLog = join(taskDir, 'worker.log');
    const summaryFile = join(taskDir, 'worker-summary.md');
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });

    writeFileSync(workerLog, 'original worker already exited\n');
    writeFileSync(summaryFile, 'completed result from the original worker\n');

    const fakeApeiron = join(fakeBin, 'apeiron');
    writeFileSync(fakeApeiron, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeApeiron, 0o755);

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
          task: 'unverifiable worker identity boundary',
          status: 'running',
          guardrails: { timeoutSeconds: 1, killGracePeriod: 0, writeMode: 'workspace' },
          agents: [
            {
              name: 'worker',
              status: 'running',
              pid: unrelatedPid,
              pgid: unrelatedPid,
              started_at: 'definitely-not-a-timestamp',
              log_file: workerLog,
              summary_file: summaryFile,
            },
          ],
        }),
      );

      const result = spawnSync('bash', [resolve('mmas/watchdog.sh'), taskId, 'boss-session', '--interval', '1'], {
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
        timeout: 8000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);

      const boulder = JSON.parse(readFileSync(join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.status).toBe('complete');
      expect(boulder.agents[0].status).toBe('done');
      expect(processExists(unrelatedPid)).toBe(true);
      expect(result.stderr).toContain('malformed started_at identity evidence');
      expect(result.stderr).toContain('treating PID as unverifiable');
    } finally {
      try {
        process.kill(-unrelatedPid, 'SIGKILL');
      } catch {
        // Cleanup only; the watchdog must not terminate this unrelated process.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
