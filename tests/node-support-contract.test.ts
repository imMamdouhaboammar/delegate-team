import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Node support contract', () => {
  it('does not run active workflows on unsupported Node versions', () => {
    const workflowDir = join(ROOT, '.github', 'workflows');
    for (const name of readdirSync(workflowDir).filter((file) => file.endsWith('.yml'))) {
      const source = readFileSync(join(workflowDir, name), 'utf8');
      const active = source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('#')).join('\n');
      expect(active, name).not.toMatch(/node-version:\s*['"]?(?:20|22)(?:\.x)?/);
    }
  });

  it('keeps package metadata, workflows, and docs aligned on Node 24', () => {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, 'scripts', 'check-node-support.mjs')],
      { cwd: ROOT, encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Node support contract is aligned');
  });
});
