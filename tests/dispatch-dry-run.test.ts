import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDispatch } from '../src/commands/run.js';

describe('dispatch dry run', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints routing plan without exiting', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runDispatch('rename getCurrentUser to getActiveUser', { dryRun: true });

    const output = log.mock.calls.map(call => String(call[0])).join('\n');
    expect(output).toContain('Dry run dispatch plan');
    expect(output).toContain('selected:');
    expect(output).toContain('route reason:');
    expect(output).toContain('chain:');
    expect(output).toContain('would execute:');
    expect(error).not.toHaveBeenCalled();
  });
});
