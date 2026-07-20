import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SOURCE_SCRIPTS = join(ROOT, 'delegate-team', 'scripts');
const tempRoots: string[] = [];

function makeFixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'delegate team file-url '));
  tempRoots.push(tempRoot);

  const installRoot = join(tempRoot, 'install with spaces #1');
  const scriptsDir = join(installRoot, 'delegate-team', 'scripts');
  const homeDir = join(tempRoot, 'home with spaces');
  const binDir = join(tempRoot, 'fake bin');
  const workDir = join(tempRoot, 'work tree');

  for (const dir of [scriptsDir, homeDir, binDir, workDir]) {
    mkdirSync(dir, { recursive: true });
  }

  for (const name of [
    'relay.mjs',
    'codex-router.mjs',
    'gemini-router.mjs',
    'opencode-router.mjs',
  ]) {
    copyFileSync(join(SOURCE_SCRIPTS, name), join(scriptsDir, name));
  }

  return { tempRoot, installRoot, scriptsDir, homeDir, binDir, workDir };
}

function isolatedEnv(homeDir: string, binDir?: string) {
  return {
    ...process.env,
    HOME: homeDir,
    PATH: binDir ? `${binDir}:${process.env.PATH ?? ''}` : process.env.PATH,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('file URL path handling', () => {
  it.each(['codex-router.mjs', 'gemini-router.mjs', 'opencode-router.mjs'])(
    'executes %s from a path containing spaces and reserved URL characters',
    (routerName) => {
      const fixture = makeFixture();
      const result = spawnSync(
        process.execPath,
        [join(fixture.scriptsDir, routerName), 'route'],
        {
          input: 'TASK path-check: quick path check\n',
          encoding: 'utf8',
          env: isolatedEnv(fixture.homeDir),
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
    },
  );

  it('honors an explicit secondary Codex account from a path containing spaces', () => {
    const fixture = makeFixture();
    const configDir = join(fixture.homeDir, '.config', 'dt');
    const mainHome = join(fixture.homeDir, '.codex-delegate');
    const secondaryHome = join(fixture.homeDir, '.codex-delegate-2');
    mkdirSync(configDir, { recursive: true });

    for (const codexHome of [mainHome, secondaryHome]) {
      mkdirSync(codexHome, { recursive: true });
      writeFileSync(join(codexHome, 'config.toml'), 'model = "fake"\n');
      writeFileSync(join(codexHome, 'auth.json'), '{}\n');
    }

    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({
        codex_accounts: [
          { name: 'main', email: 'main@example.test', codexHome: mainHome },
          { name: 'secondary', email: 'secondary@example.test', codexHome: secondaryHome },
        ],
      }),
    );

    const fakeCodex = join(fixture.binDir, 'codex');
    writeFileSync(
      fakeCodex,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo "codex-cli fake"\n  exit 0\nfi\nprintf '{"type":"thread.started","thread_id":"fake-thread"}\\n'\nprintf '{"type":"item.completed","item":{"type":"agent_message","text":"CODEX_HOME=%s"}}\\n' "$CODEX_HOME"\n`,
    );
    chmodSync(fakeCodex, 0o755);

    const briefPath = join(fixture.tempRoot, 'brief.txt');
    const outDir = join(fixture.tempRoot, 'codex result');
    writeFileSync(briefPath, 'TASK account-check: report selected account only\n');

    const result = spawnSync(
      process.execPath,
      [
        join(fixture.scriptsDir, 'relay.mjs'),
        '--backend', 'codex',
        '--account', 'secondary',
        '--read-only',
        '--max-retries', '0',
        '--brief', briefPath,
        '--cd', fixture.workDir,
        '--out-dir', outDir,
      ],
      {
        encoding: 'utf8',
        env: isolatedEnv(fixture.homeDir, fixture.binDir),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('via secondary');
    const relayResult = JSON.parse(readFileSync(join(outDir, 'result.json'), 'utf8'));
    expect(relayResult.finalMessage).toContain(`CODEX_HOME=${secondaryHome}`);
  });

  it('prefers the workspace-local VertexCoder runtime under a path containing spaces', () => {
    const fixture = makeFixture();
    const vertexRoot = join(fixture.installRoot, 'vertex-coder');
    const workspacePython = join(vertexRoot, '.venv', 'bin', 'python3');
    const workspaceAgent = join(vertexRoot, 'vertex_interactive_agent.py');
    mkdirSync(dirname(workspacePython), { recursive: true });
    writeFileSync(workspaceAgent, '# fake workspace agent\n');
    writeFileSync(
      workspacePython,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python workspace"; exit 0; fi\necho "🤖 Final Response from Agent: workspace-python:$1"\n',
    );
    chmodSync(workspacePython, 0o755);

    const fallbackPython = join(fixture.binDir, 'python3');
    writeFileSync(
      fallbackPython,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python fallback"; exit 0; fi\necho "🤖 Final Response from Agent: fallback-python:$1"\n',
    );
    chmodSync(fallbackPython, 0o755);

    const briefPath = join(fixture.tempRoot, 'vertex-brief.txt');
    const outDir = join(fixture.tempRoot, 'vertex result');
    writeFileSync(briefPath, 'TASK vertex-path-check: report selected runtime\n');

    const result = spawnSync(
      process.execPath,
      [
        join(fixture.scriptsDir, 'relay.mjs'),
        '--backend', 'vertexcoder',
        '--model', 'fake-model',
        '--read-only',
        '--max-retries', '0',
        '--brief', briefPath,
        '--cd', fixture.workDir,
        '--out-dir', outDir,
      ],
      {
        encoding: 'utf8',
        env: isolatedEnv(fixture.homeDir, fixture.binDir),
      },
    );

    expect(result.status).toBe(0);
    const relayResult = JSON.parse(readFileSync(join(outDir, 'result.json'), 'utf8'));
    expect(relayResult.cliVersion).toBe('Python workspace');
    expect(relayResult.finalMessage).toContain(`workspace-python:${realpathSync(workspaceAgent)}`);
    expect(relayResult.finalMessage).not.toContain('fallback-python');
  }, 15_000);
});
