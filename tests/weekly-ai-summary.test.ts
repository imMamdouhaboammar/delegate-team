import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateWeeklySummary } from '../.github/scripts/weekly-ai-summary.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'delegate-team-weekly-ai-'));
  tempDirs.push(dir);
  const output = join(dir, 'output.txt');
  const stepSummary = join(dir, 'summary.md');
  writeFileSync(output, '');
  writeFileSync(stepSummary, '');
  return {
    output,
    stepSummary,
    env: {
      AI_GATEWAY_KEY: 'test-key',
      STATS_JSON: JSON.stringify({ week_start: '2026-08-30', week_end: '2026-09-06', commit_count: 4 }),
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: stepSummary,
      ...overrides,
    },
  };
}

function okResponse(content: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
  };
}

describe('weekly AI summary publication authority', () => {
  it('publishes a trimmed substantive summary using a collision-safe delimiter', async () => {
    const h = harness();
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('  # Health\nWEEKLY_COLLIDE\nGood week.  '));
    const ids = ['COLLIDE', 'SAFE'];

    const result = await generateWeeklySummary({
      fetchImpl,
      env: h.env,
      randomId: () => ids.shift() ?? 'FALLBACK',
    });

    expect(result).toEqual({ publishable: true, summary: '# Health\nWEEKLY_COLLIDE\nGood week.' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: 'gemini-3.5-flash',
      max_tokens: 1500,
      temperature: 0.4,
    });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('commit_count: 4');
    expect(body.messages[0].content).toContain('week_start: 2026-08-30');

    const output = readFileSync(h.output, 'utf8');
    expect(output).toContain('publishable=true\n');
    expect(output).toContain('weekly_summary<<WEEKLY_SAFE\n# Health\nWEEKLY_COLLIDE\nGood week.\nWEEKLY_SAFE\n');
    expect(readFileSync(h.stepSummary, 'utf8')).toBe('');
  });

  it.each([
    ['non-2xx', vi.fn().mockResolvedValue({ ok: false, status: 503, json: vi.fn() })],
    ['malformed JSON', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error('bad json')) })],
    ['missing content', vi.fn().mockResolvedValue(okResponse(undefined))],
    ['empty content', vi.fn().mockResolvedValue(okResponse(''))],
    ['whitespace-only content', vi.fn().mockResolvedValue(okResponse('  \n\t '))],
  ])('fails closed for %s', async (_label, fetchImpl) => {
    const h = harness();

    const result = await generateWeeklySummary({ fetchImpl, env: h.env });

    expect(result.publishable).toBe(false);
    const output = readFileSync(h.output, 'utf8');
    expect(output).toBe('publishable=false\n');
    expect(output).not.toContain('weekly_summary');
    expect(readFileSync(h.stepSummary, 'utf8')).toContain('no tracker Issue was created');
  });

  it('fails closed without a gateway key and does not make a request', async () => {
    const h = harness({ AI_GATEWAY_KEY: '' });
    const fetchImpl = vi.fn();

    const result = await generateWeeklySummary({ fetchImpl, env: h.env });

    expect(result.publishable).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readFileSync(h.output, 'utf8')).toBe('publishable=false\n');
  });
});
