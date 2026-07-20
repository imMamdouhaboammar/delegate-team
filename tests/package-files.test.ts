import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
      'DT.md',
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

describe('local release policy', () => {
  it('publishes from a trusted maintainer machine, not GitHub Actions', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

    expect(pkg.scripts['pack:verify']).toBe('node bin/verify-package.mjs');
    expect(pkg.scripts['release:verify']).toContain('npm run version:check');
    expect(pkg.scripts['release:verify']).toContain('npm run pack:verify');
    expect(pkg.scripts['release:verify']).toContain('npm run publish:dry');
    expect(pkg.scripts['release:publish']).toContain('npm publish --access public');
    expect(existsSync(join(ROOT, 'docs', 'RELEASING.md'))).toBe(true);
    expect(existsSync(join(ROOT, 'bin', 'verify-package.mjs'))).toBe(true);
    expect(existsSync(join(ROOT, '.github', 'workflows', 'npm-publish.yml'))).toBe(false);
    expect(existsSync(join(ROOT, '.github', 'workflows', 'release.yml'))).toBe(false);

    const integrityWorkflow = readFileSync(
      join(ROOT, '.github', 'workflows', 'npm-pack-integrity.yml'),
      'utf8',
    );
    expect(integrityWorkflow).toContain('npm run pack:verify');
    expect(integrityWorkflow).not.toContain('npm publish');
  });
});
