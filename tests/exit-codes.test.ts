import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupFsChildMocks } from './helpers/fs-child-mocks.js';
import { ExitCode } from '../src/utils/exit-codes.js';
import { runDispatch, runVertex } from '../src/commands/run.js';
import { runRouteExplain } from '../src/commands/route.js';

const { fs } = setupFsChildMocks();

function exitError(code?: number): never {
  throw new Error(`process.exit:${code}`);
}

describe('public exit code contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(exitError as never);
  });

  it('exports stable codes for automation', () => {
    expect(ExitCode).toEqual({
      SUCCESS: 0,
      FAILURE: 1,
      USAGE: 64,
      CONFIG: 78,
      MISSING_DEPENDENCY: 127,
    });
  });

  it('uses USAGE when dt run has no prompt or brief', () => {
    expect(() => runDispatch(undefined, {})).toThrow('process.exit:64');
  });

  it('uses USAGE when dt route has no task', () => {
    expect(runRouteExplain('', {})).toBe(ExitCode.USAGE);
  });

  it('uses MISSING_DEPENDENCY when route runtime is unavailable', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(runRouteExplain('inspect task', {})).toBe(ExitCode.MISSING_DEPENDENCY);
  });

  it('uses MISSING_DEPENDENCY when the Vertex runtime is unavailable', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => runVertex('direct', ['file.ts', 'fix it'])).toThrow('process.exit:127');
  });


  it('does not reintroduce ad-hoc numeric exits in public command surfaces', () => {
    const files = [
      'src/commands/run.ts',
      'src/commands/route.ts',
      'src/commands/setup.ts',
      'src/commands/check.ts',
      'src/config-check.ts',
      'src/cli.ts',
    ];
    const numericExit = /process\.exit\((?:1|2|64|78|127)\)|process\.exitCode\s*=\s*(?:1|2|64|78|127)|return\s+(?:1|2|64|78|127);/;

    for (const file of files) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toMatch(numericExit);
    }
    expect(readFileSync(join(process.cwd(), 'src/config-check.ts'), 'utf8')).toContain('ExitCode.CONFIG');
  });
});
