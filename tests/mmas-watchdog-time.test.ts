import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const watchdogPath = join(root, 'mmas', 'watchdog.sh');
const tempDirs: string[] = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'delegate-team-watchdog-time-'));
  tempDirs.push(dir);
  return dir;
}

function watchdogAgeFunction() {
  const source = readFileSync(watchdogPath, 'utf8');
  const start = source.indexOf('log_last_modified_seconds_ago() {');
  const endMarker = '\n# ---------------------------------------------------------------------------\n# Send report to boss';
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error('Could not isolate log_last_modified_seconds_ago from mmas/watchdog.sh');
  }

  return source.slice(start, end).trim();
}

function writeExecutable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, 'utf8');
  chmodSync(path, 0o755);
}

function runAge(statBody: string, logExists = true) {
  const dir = tempDir();
  const bin = join(dir, 'bin');
  const log = join(dir, 'agent.log');
  execFileSync('mkdir', ['-p', bin]);

  if (logExists) {
    writeFileSync(log, 'worker output\n', 'utf8');
    utimesSync(log, 900, 900);
  }

  writeExecutable(join(bin, 'date'), `
if [[ "${'$'}{1:-}" == "+%s" ]]; then
  echo 1000
  exit 0
fi
exit 1`);
  writeExecutable(join(bin, 'stat'), statBody);

  const script = `${watchdogAgeFunction()}\nlog_last_modified_seconds_ago "${'$'}1"`;
  const output = execFileSync('bash', ['-c', script, '_', log], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
  });

  return Number(output.trim());
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('MMAS watchdog log age detection', () => {
  it('reads modification time with GNU stat', () => {
    const age = runAge(`
if [[ "${'$'}{1:-}" == "-c" && "${'$'}{2:-}" == "%Y" ]]; then
  echo 900
  exit 0
fi
exit 1`);

    expect(age).toBe(100);
  });

  it('falls back to BSD stat when GNU stat is unavailable', () => {
    const age = runAge(`
if [[ "${'$'}{1:-}" == "-f" && "${'$'}{2:-}" == "%m" ]]; then
  echo 900
  exit 0
fi
exit 1`);

    expect(age).toBe(100);
  });

  it('fails closed when stat cannot read the file timestamp', () => {
    const age = runAge('exit 1');
    expect(age).toBe(999999);
  });

  it('keeps the missing-log stale sentinel', () => {
    const age = runAge('exit 1', false);
    expect(age).toBe(999999);
  });

  it('clamps a future modification timestamp to zero age', () => {
    const age = runAge(`
if [[ "${'$'}{1:-}" == "-c" && "${'$'}{2:-}" == "%Y" ]]; then
  echo 1100
  exit 0
fi
exit 1`);

    expect(age).toBe(0);
  });
});
