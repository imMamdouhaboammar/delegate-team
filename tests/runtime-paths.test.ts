import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRuntimePaths,
  resolveRuntimeRoot,
} from '../src/config/runtime-paths.js';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'delegate-team-runtime-'));
  tempRoots.push(root);
  return root;
}

function createPackageRoot(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'delegate-team', version: '0.0.0-test' }),
  );
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('runtime path resolution', () => {
  it('finds the repository root from a source checkout', () => {
    const root = makeTempRoot();
    createPackageRoot(root);
    const startDir = join(root, 'src', 'config');
    mkdirSync(startDir, { recursive: true });

    expect(resolveRuntimeRoot({ startDir })).toBe(root);
  });

  it('finds the package root from a global npm layout', () => {
    const prefix = makeTempRoot();
    const root = join(prefix, 'lib', 'node_modules', 'delegate-team');
    createPackageRoot(root);
    const startDir = join(root, 'dist', 'config');
    mkdirSync(startDir, { recursive: true });

    expect(resolveRuntimeRoot({ startDir })).toBe(root);
  });

  it('uses a valid DT_RUNTIME_ROOT override', () => {
    const root = makeTempRoot();
    createPackageRoot(root);

    expect(
      resolveRuntimeRoot({
        startDir: join(makeTempRoot(), 'unrelated'),
        override: root,
      }),
    ).toBe(root);
  });

  it('warns about an invalid override and falls back to package discovery', () => {
    const root = makeTempRoot();
    createPackageRoot(root);
    const startDir = join(root, 'src', 'config');
    mkdirSync(startDir, { recursive: true });
    const warnings: string[] = [];

    expect(
      resolveRuntimeRoot({
        startDir,
        override: makeTempRoot(),
        warn: (message) => warnings.push(message),
      }),
    ).toBe(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DT_RUNTIME_ROOT');
  });

  it('throws an actionable error when no package root can be found', () => {
    const startDir = join(makeTempRoot(), 'missing', 'dist', 'config');
    mkdirSync(startDir, { recursive: true });

    expect(() => resolveRuntimeRoot({ startDir })).toThrowError(
      /Unable to locate the delegate-team runtime root.*DT_RUNTIME_ROOT/s,
    );
  });

  it('builds all runtime paths from one canonical root', () => {
    const root = '/opt/delegate-team';
    const paths = createRuntimePaths(root);

    expect(paths.workspaceRoot).toBe(root);
    expect(paths.relayScript).toBe(
      join(root, 'delegate-team', 'scripts', 'relay.mjs'),
    );
    expect(paths.routerScript).toBe(
      join(root, 'delegate-team', 'scripts', 'opencode-router.mjs'),
    );
    expect(paths.vertexVenvPython).toBe(
      join(root, 'vertex-coder', '.venv', 'bin', 'python3'),
    );
  });
});
