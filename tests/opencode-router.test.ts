import { describe, expect, test } from 'vitest';
import { routeTask, scoreTask } from '../delegate-team/scripts/opencode-router.mjs';

function padBrief(prefix: string, targetLength = 350): string {
  if (prefix.length >= targetLength) return prefix;
  return `${prefix}${'x'.repeat(targetLength - prefix.length)}`;
}

function longBrief(signals: string): string {
  return `${signals}\n${'context '.repeat(220)}`;
}

describe('OpenCode task scoring thresholds', () => {
  test.each([
    {
      name: 'score minus one routes to quick',
      brief: 'x'.repeat(250),
      score: -1,
      tier: 'quick',
    },
    {
      name: 'score zero routes to medium',
      brief: 'x'.repeat(350),
      score: 0,
      tier: 'medium',
    },
    {
      name: 'score five remains medium',
      brief: longBrief(''),
      score: 5,
      tier: 'medium',
    },
    {
      name: 'score six routes to complex',
      brief: padBrief('architecture security\n'),
      score: 6,
      tier: 'complex',
    },
    {
      name: 'score ten remains complex',
      brief: longBrief('analyze security'),
      score: 10,
      tier: 'complex',
    },
    {
      name: 'score eleven routes to max',
      brief: longBrief('architecture security'),
      score: 11,
      tier: 'max',
    },
  ])('$name', ({ brief, score, tier }) => {
    const decision = routeTask(brief);

    expect(decision.score).toBe(score);
    expect(decision.taskTier).toBe(tier);
  });

  test('a short typo task routes to quick', () => {
    const decision = routeTask('TASK fix-typo: fix typo in config');

    expect(decision.score).toBeLessThan(0);
    expect(decision.taskTier).toBe('quick');
  });

  test('a medium implementation brief stays in the medium tier', () => {
    const brief = padBrief([
      'TASK add-health: Add health endpoint',
      'FILES:',
      '  src/health.ts',
      '  src/server.ts',
      'CHANGE:',
      '  Add a deterministic local health response.',
    ].join('\n'));

    const decision = routeTask(brief);

    expect(decision.score).toBeGreaterThanOrEqual(0);
    expect(decision.score).toBeLessThanOrEqual(5);
    expect(decision.taskTier).toBe('medium');
  });

  test('a multi-file refactor reaches the complex tier', () => {
    const brief = padBrief([
      'TASK change-router: Refactor routing helpers',
      'FILES:',
      '  src/router.ts',
      '  src/router-policy.ts',
      'CHANGE:',
      '  Keep behavior stable while reorganizing routing helpers.',
    ].join('\n'));

    const decision = routeTask(brief);

    expect(decision.score).toBeGreaterThanOrEqual(6);
    expect(decision.score).toBeLessThanOrEqual(10);
    expect(decision.taskTier).toBe('complex');
  });

  test('a long architecture brief with several gates reaches max', () => {
    const brief = longBrief([
      'TASK architect-router: Architect routing boundaries',
      'GATES: npm test; npm run typecheck; npm run lint; npm run build',
    ].join('\n'));

    const decision = routeTask(brief);

    expect(decision.score).toBeGreaterThan(10);
    expect(decision.taskTier).toBe('max');
  });

  test('docs-only files reduce the structural score', () => {
    const brief = padBrief([
      'FILES:',
      '  project/docs/guide.md',
      '  project/docs/router.md',
      'CONTEXT:',
    ].join('\n'));

    const { score } = scoreTask(brief);

    expect(score).toBeLessThan(0);
  });

  test('source and test files increase the structural score', () => {
    const brief = padBrief([
      'FILES:',
      '  src/router.ts',
      '  src/tests/router.test.ts',
      'CONTEXT:',
    ].join('\n'));

    const { score } = scoreTask(brief);

    expect(score).toBeGreaterThan(0);
  });

  test('routeTask omits zero-delta hits', () => {
    const decision = routeTask('x'.repeat(350));

    expect(decision.score).toBe(0);
    expect(decision.hits).toEqual([]);
    expect(decision.hits.every((hit: { delta: number }) => hit.delta !== 0)).toBe(true);
  });
});
