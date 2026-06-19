import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDispatch } from '../src/commands/run.js';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  symlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('Router Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (fs.readFileSync as any).mockReturnValue('dummy brief content');
    (fs.existsSync as any).mockReturnValue(true);
  });

  it('should route to vertexcoder if score > 5', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 8}' };
      }
      return { status: 0 };
    });

    runDispatch('hard task', {});

    const relayCall = spawnSyncMock.mock.calls.find((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));
    expect(relayCall[1]).toContain('vertexcoder');
  });

  it('should route to opencode if 0 < score <= 5', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 3}' };
      }
      return { status: 0 };
    });

    runDispatch('medium task', {});

    const relayCall = spawnSyncMock.mock.calls.find((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));
    expect(relayCall[1]).toContain('opencode');
  });

  it('should route to minimax if score <= 0', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 0}' };
      }
      return { status: 0 };
    });

    runDispatch('easy task', {});

    const relayCall = spawnSyncMock.mock.calls.find((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));
    expect(relayCall[1]).toContain('minimax');
  });

  it('should route to vertexcoder by default if router fails', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 1, stderr: 'error' }; // router failed
      }
      return { status: 0 };
    });

    runDispatch('task', {});

    const relayCall = spawnSyncMock.mock.calls.find((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));
    expect(relayCall[1]).toContain('vertexcoder');
  });
});
