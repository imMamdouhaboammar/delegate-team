import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';

function runPython(source: string) {
  return spawnSync(PYTHON, ['-'], {
    cwd: ROOT,
    input: source,
    encoding: 'utf8',
  });
}

describe('Python command execution hardening', () => {
  it('runs approved MiniMax commands without a shell', () => {
    const modulePath = join(ROOT, 'minimax-coder', 'tools_registry.py');
    const script = `
import importlib.util, os
spec = importlib.util.spec_from_file_location('minimax_tools', ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
recorded = {}
class Result:
    stdout = 'ok'
    stderr = ''
    returncode = 0
def fake_run(*args, **kwargs):
    recorded['args'] = args
    recorded['kwargs'] = kwargs
    return Result()
module.subprocess.run = fake_run
os.environ.pop('DT_ALLOW_UNSAFE_COMMANDS', None)
result = module.tool_run_command('python3 --version')
assert recorded['kwargs'].get('shell') is False
assert isinstance(recorded['args'][0], list)
assert result.startswith('--- stdout ---')
`;
    const result = runPython(script);
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects unapproved MiniMax commands before spawning a process', () => {
    const modulePath = join(ROOT, 'minimax-coder', 'tools_registry.py');
    const script = `
import importlib.util, os
spec = importlib.util.spec_from_file_location('minimax_tools', ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def forbidden(*args, **kwargs):
    raise AssertionError('subprocess should not run')
module.subprocess.run = forbidden
os.environ.pop('DT_ALLOW_UNSAFE_COMMANDS', None)
result = module.tool_run_command('echo hello')
assert result.startswith('Security Error:')
`;
    const result = runPython(script);
    expect(result.status, result.stderr).toBe(0);
  });

  it('restricts catalog install execution to reviewed commands', () => {
    const modulePath = join(ROOT, 'orchestrator', 'scripts', 'catalog.py');
    const script = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('catalog', ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
try:
    module._run_trusted_install_command('echo unreviewed')
except ValueError:
    pass
else:
    raise AssertionError('unreviewed command was accepted')
`;
    const result = runPython(script);
    expect(result.status, result.stderr).toBe(0);
  });

  it('scopes MMAS provider credentials to the selected backend', () => {
    const modulePath = join(ROOT, 'mmas', 'spawn-team.py');
    const script = `
import importlib.util, os, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('spawn_team', ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
keys = {
    'MINIMAX_API_KEY': 'minimax-secret',
    'GEMINI_API_KEY': 'gemini-secret',
    'GOOGLE_API_KEY': 'google-secret',
    'OPENAI_API_KEY': 'openai-secret',
    'ANTHROPIC_API_KEY': 'anthropic-secret',
    'PROXY_TOKEN': 'proxy-secret',
}
old = {key: os.environ.get(key) for key in keys}
try:
    os.environ.update(keys)
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        minimax_env = module.get_clean_env('workspace', root, 'minimax-coder')
        vertex_env = module.get_clean_env('workspace', root, 'vertex-coder')
        relay_env = module.get_clean_env('workspace', root, 'codex')
        watchdog_env = module.get_clean_env('workspace', root, None)

    assert minimax_env.get('MINIMAX_API_KEY') == 'minimax-secret'
    assert 'GEMINI_API_KEY' not in minimax_env
    assert 'GOOGLE_API_KEY' not in minimax_env
    assert 'OPENAI_API_KEY' not in minimax_env
    assert 'ANTHROPIC_API_KEY' not in minimax_env
    assert 'PROXY_TOKEN' not in minimax_env

    assert vertex_env.get('GEMINI_API_KEY') == 'gemini-secret'
    assert vertex_env.get('GOOGLE_API_KEY') == 'google-secret'
    assert 'MINIMAX_API_KEY' not in vertex_env
    assert 'OPENAI_API_KEY' not in vertex_env
    assert 'ANTHROPIC_API_KEY' not in vertex_env
    assert 'PROXY_TOKEN' not in vertex_env

    assert all(key not in relay_env for key in keys)
    assert all(key not in watchdog_env for key in keys)
finally:
    for key, value in old.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
`;
    const result = runPython(script);
    expect(result.status, result.stderr).toBe(0);
  });

  it('marks non-security hashes and disables Flask debug mode', () => {
    const catalog = readFileSync(
      join(ROOT, 'orchestrator', 'scripts', 'catalog.py'),
      'utf8',
    );
    const flaskTest = readFileSync(
      join(ROOT, 'vertex-coder', 'test_global_skill.py'),
      'utf8',
    );
    expect(catalog).toContain('usedforsecurity=False');
    expect(flaskTest).not.toContain('debug=True');
  });
});