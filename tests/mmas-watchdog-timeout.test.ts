import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const watchdog = readFileSync('mmas/watchdog.sh', 'utf8');

describe('MMAS watchdog timeout contract', () => {
  it('uses the task timeout guardrail instead of a hard-coded two-hour timeout', () => {
    expect(watchdog).toContain('.guardrails.timeoutSeconds');
    expect(watchdog).not.toContain('7200 / INTERVAL');
  });

  it('terminates remaining worker process groups before recording timeout', () => {
    expect(watchdog).toContain('terminate_remaining_agents');
    expect(watchdog).toContain('kill -TERM -- "-$pgid"');
    expect(watchdog).toContain('.guardrails.killGracePeriod');
  });
});
