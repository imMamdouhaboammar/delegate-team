import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

interface AgentFixture {
  name: string;
  status: string;
}

function runRenderer(payload: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'delegate-team-watchdog-'));
  const boulder = join(directory, 'boulder.json');

  try {
    writeFileSync(boulder, JSON.stringify(payload));

    const script = [
      'set -euo pipefail',
      'source mmas/watchdog-status.sh',
      `render_watchdog_status ${JSON.stringify(boulder)} task-test`,
    ].join('\n');

    return execFileSync('bash', ['-c', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function renderStatus(agents: AgentFixture[]): [string, string, string] {
  const fields = runRenderer({ agents }).split('\t');
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

  test.each([
    ['missing agents', {}],
    ['empty agents', { agents: [] }],
    ['non-string agent status', { agents: [{ name: 'test agent', status: null }] }],
    ['non-string agent name', { agents: [{ name: null, status: 'done' }] }],
  ])('fails closed for %s', (_name, payload) => {
    expect(() => runRenderer(payload)).toThrow();
  });
});
