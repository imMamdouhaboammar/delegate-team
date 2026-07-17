import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as cp from 'node:child_process';

/**
 * Shared Vitest mocks for `node:fs` and `node:child_process`.
 * `vi.mock` calls live at module top so Vitest can hoist them when this
 * helper is imported from a test file.
 */
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

export type FsModule = typeof fs;
export type CpModule = typeof cp;

/**
 * Returns the mocked `node:fs` and `node:child_process` modules.
 * Call after importing this helper so mocks are installed.
 */
export function setupFsChildMocks(): { fs: FsModule; cp: CpModule } {
  return { fs, cp };
}
