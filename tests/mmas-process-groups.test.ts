import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

describe('MMAS process-group cleanup', () => {
  it('uses detached process groups and group termination primitives', () => {
    const source = readFileSync(join(ROOT, 'mmas', 'spawn-team.py'), 'utf8');

    expect(source).toContain('start_new_session=True');
    expect(source).toContain('os.getpgid');
    expect(source).toContain('os.killpg');
    expect(source).toContain('SIGTERM');
    expect(source).toContain('SIGKILL');
    expect(source).toContain('watchdog_pgid');
    expect(source).toContain('"pgid"');
  });
});
