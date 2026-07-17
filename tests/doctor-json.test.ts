import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectHealth, runCheck } from '../src/commands/check.js';

describe('doctor json output', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collectHealth returns structured backend rows', () => {
    const rows = collectHealth();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(typeof row.backend).toBe('string');
      expect(typeof row.ready).toBe('boolean');
      expect(['ready', 'unconfigured', 'not_ready']).toContain(row.state);
      expect(typeof row.binary.ok).toBe('boolean');
      expect(typeof row.binary.label).toBe('string');
      expect(typeof row.auth.ok).toBe('boolean');
      expect(typeof row.auth.label).toBe('string');
    }
  }, 15000);

  it('runCheck json mode emits parseable JSON without ANSI escape codes', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    runCheck(false, true);

    expect(log).toHaveBeenCalledTimes(1);
    const output = String(log.mock.calls[0][0]);
    expect(output).not.toMatch(/\x1B\[/);

    const payload = JSON.parse(output);
    expect(typeof payload.ok).toBe('boolean');
    expect(payload.strict).toBe(false);
    expect(typeof payload.generated_at).toBe('string');
    expect(Array.isArray(payload.backends)).toBe(true);
    expect(payload.backends.length).toBeGreaterThan(0);
  });
});
