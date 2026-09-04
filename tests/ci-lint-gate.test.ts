import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

describe('pull-request lint gate', () => {
  it('runs the release lint command in the canonical Node CI job', () => {
    const nodeJob = ci.match(/ {2}build-and-test:\n([\s\S]*?)(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/)?.[1] ?? '';

    expect(nodeJob).toContain('- name: Lint');
    expect(nodeJob).toContain('run: npm run lint');
  });
});
