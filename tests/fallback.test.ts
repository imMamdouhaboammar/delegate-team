import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDispatch } from '../src/commands/run.js';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    mkdirSync: vi.fn(actual.mkdirSync),
    rmSync: vi.fn(actual.rmSync),
    symlinkSync: vi.fn(actual.symlinkSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    readFileSync: vi.fn(actual.readFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  };
});

describe('Fallback Ring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock successful brief read after module initialization has used real fs.
    (fs.readFileSync as any).mockReturnValue('dummy brief content');
    (fs.existsSync as any).mockReturnValue(true);
  });

  it('should route to fallback backend if first backend fails', () => {
    const spawnSyncMock = cp.spawnSync as any;

    // FALLBACK_RING['opencode'] = [opencode, vertexcoder, codex, minimax, gemini]
    // 1st attempt: opencode    -> fails
    // 2nd attempt: vertexcoder -> fails (preferred fallback everywhere, tried before codex)
    // 3rd attempt: codex       -> succeeds
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      // Mock router
      if (args.some(a => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 2}' }; // routes to opencode
      }

      // Mock relay
      if (args.includes('--backend') && args.includes('codex')) {
        return { status: 0 }; // success
      }
      return { status: 1 }; // opencode and vertexcoder both fail
    });

    runDispatch(undefined, { backend: 'opencode', brief: 'test.txt' });

    // Assert that spawnSync was called multiple times, eventually succeeding with codex
    const calls = spawnSyncMock.mock.calls;
    const relayCalls = calls.filter((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));

    expect(relayCalls.length).toBe(3);
    expect(relayCalls[0][1]).toContain('opencode');
    expect(relayCalls[1][1]).toContain('vertexcoder');
    expect(relayCalls[2][1]).toContain('codex');
  });

  it('should exit 1 if all backends fail', () => {
    const spawnSyncMock = cp.spawnSync as any;

    // Always fail
    spawnSyncMock.mockReturnValue({ status: 1 });

    runDispatch(undefined, { backend: 'minimax', brief: 'test.txt' });

    const calls = spawnSyncMock.mock.calls;
    const relayCalls = calls.filter((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));

    // minimax -> codex -> opencode -> vertexcoder -> gemini
    expect(relayCalls.length).toBe(5);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
