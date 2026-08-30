import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const watchdogSource = readFileSync(join(process.cwd(), 'mmas', 'watchdog.sh'), 'utf8');

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('MMAS watchdog completion authority', () => {
  it('does not mark a still-running stuck worker done merely because a summary exists', () => {
    expect(watchdogSource).not.toContain('stuck but has summary — marking done');
    expect(watchdogSource).not.toMatch(/if \[\[ -n "\$summary_file" && -f "\$summary_file" \]\]; then\s+log "Agent \$agent_name is stuck but has summary[^\n]*"\s+set_agent_status "\$agent_name" "done"/m);
  });

  it('requires process exit before summary presence can authorize done', () => {
    expect(watchdogSource).toMatch(/if ! is_pid_alive "\$pid"; then[\s\S]*-f "\$summary_file"[\s\S]*set_agent_status "\$agent_name" "done"/m);
  });

  it('times out a live stale worker even when it has already written a summary', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-live-summary-'));
    const home = join(root, 'home');
    const taskId = 'live-summary-must-not-complete';
    const taskDir = join(home, '.apeiron', 'multi-agent', 'tasks', taskId);
    const fakeBin = join(root, 'bin');
    const workerLog = join(taskDir, 'worker.log');
    const summaryFile = join(taskDir, 'worker-summary.md');
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });

    writeFileSync(workerLog, 'worker started\n');
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(workerLog, stale, stale);
    writeFileSync(summaryFile, 'partial result written before process exit\n');

    const fakeApeiron = join(fakeBin, 'apeiron');
    writeFileSync(fakeApeiron, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeApeiron, 0o755);

    const worker = spawn('bash', ['-c', 'while :; do sleep 1; done'], {
      detached: true,
      stdio: 'ignore',
    });
    worker.unref();
    expect(worker.pid).toBeTypeOf('number');
    const workerPid = worker.pid!;

    try {
      writeFileSync(
        join(taskDir, 'boulder.json'),
        JSON.stringify({
          task: 'live worker summary authority',
          status: 'running',
          guardrails: { timeoutSeconds: 1, killGracePeriod: 0, writeMode: 'workspace' },
          agents: [
            {
              name: 'worker',
              status: 'running',
              pid: workerPid,
              pgid: workerPid,
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
      expect(result.status).toBe(1);

      const boulder = JSON.parse(readFileSync(join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.status).toBe('timeout');
      expect(boulder.agents[0].status).toBe('stuck');
      expect(boulder.agents[0].completed_at).toBeUndefined();
    } finally {
      try {
        process.kill(-workerPid, 'SIGKILL');
      } catch {
        // The watchdog should already have terminated the worker process group.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not act on a reused PID whose process-start identity no longer matches', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-pid-reuse-'));
    const home = join(root, 'home');
    const taskId = 'pid-reuse-must-not-be-worker';
    const taskDir = join(home, '.apeiron', 'multi-agent', 'tasks', taskId);
    const fakeBin = join(root, 'bin');
    const workerLog = join(taskDir, 'worker.log');
    const summaryFile = join(taskDir, 'worker-summary.md');
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(workerLog, 'worker finished earlier\n');
    writeFileSync(summaryFile, 'completed summary\n');

    const fakeApeiron = join(fakeBin, 'apeiron');
    writeFileSync(fakeApeiron, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeApeiron, 0o755);

    const unrelated = spawn('bash', ['-c', 'while :; do sleep 1; done'], {
      detached: true,
      stdio: 'ignore',
    });
    unrelated.unref();
    expect(unrelated.pid).toBeTypeOf('number');
    const reusedPid = unrelated.pid!;

    try {
      writeFileSync(
        join(taskDir, 'boulder.json'),
        JSON.stringify({
          task: 'pid reuse identity boundary',
          status: 'running',
          guardrails: { timeoutSeconds: 1, killGracePeriod: 0, writeMode: 'workspace' },
          agents: [
            {
              name: 'worker',
              status: 'running',
              pid: reusedPid,
              pgid: reusedPid,
              process_start_id: 'definitely-not-the-current-process',
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
      expect(boulder.agents[0].completed_at).toBeTypeOf('string');
      expect(processExists(reusedPid)).toBe(true);
    } finally {
      try {
        process.kill(-reusedPid, 'SIGKILL');
      } catch {
        // Cleanup only; the watchdog must not terminate this unrelated process.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
