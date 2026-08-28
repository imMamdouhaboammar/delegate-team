import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function waitForFile(path: string, timeoutMs = 3000): void {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      readFileSync(path, 'utf8');
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

function processExecuting(pid: number): boolean {
  if (process.platform === 'linux') {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ', 1)[0];
      return state !== 'Z';
    } catch {
      return false;
    }
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('MMAS watchdog timeout runtime cleanup', () => {
  it('kills a TERM-resistant descendant process group and records task timeout', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'delegate-team-watchdog-'));
    const home = join(root, 'home');
    const taskId = 'runtime-timeout';
    const taskDir = join(home, '.apeiron', 'multi-agent', 'tasks', taskId);
    const fakeBin = join(root, 'bin');
    const childPidFile = join(root, 'child.pid');
    const workerLog = join(taskDir, 'worker.log');
    const summaryFile = join(taskDir, 'worker-summary.md');
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(workerLog, 'worker started\n');

    const fakeApeiron = join(fakeBin, 'apeiron');
    writeFileSync(fakeApeiron, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeApeiron, 0o755);

    const worker = spawn(
      'bash',
      ['-c', `trap 'exit 0' TERM; (trap '' TERM; while :; do sleep 1; done) & echo $! > ${JSON.stringify(childPidFile)}; wait`],
      { detached: true, stdio: 'ignore' },
    );
    worker.unref();

    expect(worker.pid).toBeTypeOf('number');
    const workerPid = worker.pid!;

    try {
      waitForFile(childPidFile);
      const childPid = Number(readFileSync(childPidFile, 'utf8').trim());
      expect(Number.isInteger(childPid) && childPid > 0).toBe(true);

      writeFileSync(
        join(taskDir, 'boulder.json'),
        JSON.stringify({
          task: 'runtime timeout cleanup',
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

      const watchdog = resolve('mmas/watchdog.sh');
      const result = spawnSync('bash', [watchdog, taskId, 'boss-session', '--interval', '1'], {
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
        timeout: 8000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);

      const boulder = JSON.parse(readFileSync(join(taskDir, 'boulder.json'), 'utf8'));
      expect(boulder.status).toBe('timeout');

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      expect(processExecuting(workerPid)).toBe(false);
      expect(processExecuting(childPid)).toBe(false);
    } finally {
      try {
        process.kill(-workerPid, 'SIGKILL');
      } catch {
        // Already terminated by the watchdog, which is the expected path.
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
