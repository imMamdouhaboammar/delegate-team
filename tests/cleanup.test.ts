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
    readFileSync: vi.fn(actual.readFileSync),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    symlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('Temp file cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should create and clean up temporary brief file', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockReturnValue({ status: 0 }); // success

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('generated brief content');

    runDispatch('test task', {});

    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('should not delete provided brief file', () => {
    const spawnSyncMock = cp.spawnSync as any;
    spawnSyncMock.mockReturnValue({ status: 0 }); // success
    (fs.readFileSync as any).mockReturnValue('content');
    (fs.existsSync as any).mockReturnValue(true);

    runDispatch(undefined, { brief: 'my-brief.txt', backend: 'gemini' });

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});
