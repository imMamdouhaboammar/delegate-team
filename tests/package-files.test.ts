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

describe('npm publish artifact validation', () => {
  it('allows only documented JSON files and requires the remote bootstrap template', () => {
    const workflow = readFileSync(
      join(ROOT, '.github', 'workflows', 'npm-publish.yml'),
      'utf8',
    );

    expect(workflow).toContain('package/templates/chatgpt-remote-bootstrap.md');
    expect(workflow).toContain('/tmp/npm-json-allowlist.txt');
    expect(workflow).toContain('comm -23');
    expect(workflow).toContain('package/agent-kernel/develpment/backlog.json');
    expect(workflow).toContain('package/agent-kernel/examples/json-memory-rule.json');
    expect(workflow).toContain('package/agent-kernel/examples/sample-episode.json');
    expect(workflow).toContain('package/agent-kernel/examples/sample-rule.json');
    expect(workflow).toContain('package/mmas/examples/boulder.example.json');
    expect(workflow).not.toContain('Expected only package.json as a JSON file');
  });
});
