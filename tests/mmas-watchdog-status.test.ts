import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

interface AgentFixture {
  name: string;
  status: string;
}

function renderStatus(agents: AgentFixture[]): [string, string, string] {
  const directory = mkdtempSync(join(tmpdir(), 'delegate-team-watchdog-'));
  const boulder = join(directory, 'boulder.json');
  writeFileSync(boulder, JSON.stringify({ agents }));

  const script = [
    'set -euo pipefail',
    'source mmas/watchdog-status.sh',
    `render_watchdog_status ${JSON.stringify(boulder)} task-test`,
  ].join('\n');

  const output = execFileSync('bash', ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trimEnd();

  const fields = output.split('\t');
  expect(fields).toHaveLength(3);
  return fields as [string, string, string];
}

describe('MMAS watchdog status rendering', () => {
  test.each([
    {
      name: 'all agents done',
      agents: [
        { name: 'review agent', status: 'done' },
        { name: 'test agent', status: 'done' },
      ],
      allDone: 'true',
      anyStuck: 'false',
    },
    {
      name: 'one running agent',
      agents: [
        { name: 'review agent', status: 'done' },
        { name: 'test agent', status: 'running' },
      ],
      allDone: 'false',
      anyStuck: 'false',
    },
    {
      name: 'one stuck agent',
      agents: [
        { name: 'review agent', status: 'done' },
        { name: 'test agent', status: 'stuck' },
      ],
      allDone: 'false',
      anyStuck: 'true',
    },
  ])('$name', ({ agents, allDone, anyStuck }) => {
    const [statusLine, renderedAllDone, renderedAnyStuck] = renderStatus(agents);

    expect(statusLine).toContain('review agent');
    expect(statusLine).toContain('test agent');
    expect(renderedAllDone).toBe(allDone);
    expect(renderedAnyStuck).toBe(anyStuck);
  });
});
