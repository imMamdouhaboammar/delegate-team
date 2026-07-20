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
