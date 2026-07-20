import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

describe('npm package file whitelist', () => {
  it('ships all runtime files required by dt run and bin aliases', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

    expect(pkg.files).toEqual(expect.arrayContaining([
      'dist',
      'bin',
      'delegate-team/scripts/relay.mjs',
      'delegate-team/scripts/opencode-router.mjs',
      'mmas/spawn-team.py',
      'mmas/watchdog.sh',
      'mmas/hash-edit.py',
      'templates',
    ]));

    expect(pkg.bin).toMatchObject({
      dt: 'dist/cli.js',
      'delegate-team': 'dist/cli.js',
      'apeiron-uni': 'bin/apeiron-uni',
      autopilot: 'bin/autopilot.sh',
      'agents-health': 'bin/agents-health.sh',
    });
  });
});
