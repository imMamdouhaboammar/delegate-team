import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Node support contract', () => {
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
