import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupFsChildMocks } from './helpers/fs-child-mocks.js';
import { runDispatch } from '../src/commands/run.js';

const { fs, cp } = setupFsChildMocks();

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
