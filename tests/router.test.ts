import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupFsChildMocks } from './helpers/fs-child-mocks.js';
import { captureConsole } from './helpers/console-capture.js';
import { runDispatch } from '../src/commands/run.js';

const { fs, cp } = setupFsChildMocks();

describe('Router Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    (fs.readFileSync as any).mockReturnValue('dummy brief content');
    (fs.existsSync as any).mockReturnValue(true);
  });

  it('routes to mmas when router score is 8', () => {
    const output = captureConsole();
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 8}' };
      }
      return { status: 0 };
    });

    runDispatch('architecture task', {});

    expect(output.logs.some((line) => line.includes('Routing to:') && line.includes('mmas'))).toBe(true);
    expect(output.logs.some((line) => line.includes('Dispatching task to Multi-Agent System: [MMAS]'))).toBe(true);
    expect(output.errors).toHaveLength(0);
  });

  it('routes to vertexcoder when router score is 6', () => {
    const output = captureConsole();
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 6}' };
      }
      return { status: 0 };
    });

    runDispatch('hard task', {});

    expect(output.logs.some((line) => line.includes('Routing to:') && line.includes('vertexcoder'))).toBe(true);
    expect(output.logs.some((line) => line.includes('Task completed successfully by [VERTEXCODER]'))).toBe(true);
    expect(output.errors).toHaveLength(0);
  });

  it('routes to opencode when router score is 3', () => {
    const output = captureConsole();
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 3}' };
      }
      return { status: 0 };
    });

    runDispatch('medium task', {});

    expect(output.logs.some((line) => line.includes('Routing to:') && line.includes('opencode'))).toBe(true);
    expect(output.logs.some((line) => line.includes('Task completed successfully by [OPENCODE]'))).toBe(true);
    expect(output.errors).toHaveLength(0);
  });

  it('routes to minimax when router score is 0', () => {
    const output = captureConsole();
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 0, stdout: '{"score": 0}' };
      }
      return { status: 0 };
    });

    runDispatch('easy task', {});

    expect(output.logs.some((line) => line.includes('Routing to:') && line.includes('minimax'))).toBe(true);
    expect(output.logs.some((line) => line.includes('Task completed successfully by [MINIMAX]'))).toBe(true);
    expect(output.errors).toHaveLength(0);
  });

  it('falls back to vertexcoder when router errors', () => {
    const output = captureConsole();
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (args.some((a: string) => a.includes('opencode-router.mjs'))) {
        return { status: 1, stderr: 'error' };
      }
      return { status: 0 };
    });

    runDispatch('task', {});

    expect(output.logs.some((line) => line.includes('Router returned non-zero status') && line.includes('vertexcoder'))).toBe(true);
    expect(output.logs.some((line) => line.includes('Task completed successfully by [VERTEXCODER]'))).toBe(true);
    expect(output.errors).toHaveLength(0);
  });
});
