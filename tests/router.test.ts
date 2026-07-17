import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupFsChildMocks } from './helpers/fs-child-mocks.js';
import { runDispatch } from '../src/commands/run.js';

const { fs, cp } = setupFsChildMocks();

describe('Router Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (fs.readFileSync as any).mockReturnValue('dummy brief content');
    (fs.existsSync as any).mockReturnValue(true);
  });

  it('routes to metagpt when router score is 8', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 8}' };
      }
      return { status: 0 };
    });

    runDispatch('architecture task', {});

    const metagptCall = spawnSyncMock.mock.calls.find((c: any) => c[1].some((arg: string) => arg.includes('metagpt')));
    expect(metagptCall).toBeDefined();
  });

  it('routes to vertexcoder when router score is 6', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 6}' };
      }
      return { status: 0 };
    });

    runDispatch('hard task', {});

    const relayCall = spawnSyncMock.mock.calls.find((c: any) => c[1].some((arg: string) => arg.includes('relay.mjs')));
    expect(relayCall[1]).toContain('vertexcoder');
  });

  it('routes to opencode when router score is 3', () => {
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

  it('routes to minimax when router score is 0', () => {
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

  it('falls back to vertexcoder when router errors', () => {
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
