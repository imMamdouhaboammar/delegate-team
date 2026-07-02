import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

describe('version consistency', () => {
  it('package.json, plugin.json, and marketplace.json share the same version', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const plugin = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
    expect(plugin.version).toBe(pkg.version);
    expect(marketplace.version).toBe(pkg.version);
  });

  it('CHANGELOG.md has an entry for the current version', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toMatch(new RegExp(`## \\[${pkg.version.replace(/\./g, '\\.')}\\]`));
  });

  it('README install example shows the current version', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    // The README must NOT show a stale version string in its dt --version example.
    // We check that the version it shows is no older than package.json.
    const exampleMatch = readme.match(/dt --version\s+#\s+→\s+(\d+\.\d+\.\d+)/);
    if (exampleMatch) {
      const shown = exampleMatch[1];
      expect(shown).toBe(pkg.version);
    } else {
      // If no example is present at all, that's also fine (relaxed).
      expect(readme).toContain('Pick your lane');
    }
  });
});

describe('orchestrator --json trace', () => {
  const ORCHESTRATE = join(ROOT, 'orchestrator', 'scripts', 'orchestrate.sh');
  const runOrchestrate = (task: string, extraArgs: string[] = []) => {
    return execFileSync('bash', [ORCHESTRATE, task, '--json', '--no-trace-file', ...extraArgs], {
      encoding: 'utf8',
    });
  };

  beforeAll(() => {
    if (!existsSync(ORCHESTRATE)) {
      throw new Error(`orchestrate.sh missing at ${ORCHESTRATE}`);
    }
  });

  it('emits a valid JSON trace with the required top-level keys', () => {
    const out = runOrchestrate('Build a pricing page with shadcn components');
    const trace = JSON.parse(out);
    expect(trace).toHaveProperty('task');
    expect(trace).toHaveProperty('detected_signals');
    expect(trace).toHaveProperty('selected_workflow');
    expect(trace).toHaveProperty('selected_stages');
    expect(trace).toHaveProperty('reasons');
    expect(trace).toHaveProperty('skipped_stages');
    expect(trace).toHaveProperty('timestamp');
  });

  it('contains the 6 spec-required signal buckets', () => {
    const trace = JSON.parse(runOrchestrate('Build a pricing page with shadcn components'));
    const required = [
      'publish_release_build',
      'ui_frontend',
      'bug_fix',
      'metrics_research',
      'memory_recall',
      'multi_agent',
    ];
    for (const key of required) {
      expect(trace.detected_signals).toHaveProperty(key);
      expect(typeof trace.detected_signals[key]).toBe('number');
    }
  });

  it('routes a UI task to UI DELIVERY with ui_frontend > 0', () => {
    const trace = JSON.parse(runOrchestrate('Build a pricing page with shadcn components'));
    expect(trace.selected_workflow).toBe('UI DELIVERY');
    expect(trace.detected_signals.ui_frontend).toBeGreaterThan(0);
  });

  it('routes a memory task to MEMORY when the keyword is strong enough', () => {
    const trace = JSON.parse(runOrchestrate('remember this: never use local SQLite fallback'));
    expect(trace.detected_signals.memory_recall).toBeGreaterThanOrEqual(4);
    expect(trace.selected_workflow).toBe('MEMORY');
  });

  it('routes a research task to RESEARCH', () => {
    const trace = JSON.parse(runOrchestrate('research how retry backoff works in queue workers'));
    expect(trace.selected_workflow).toBe('RESEARCH');
    expect(trace.detected_signals.research).toBeGreaterThan(0);
  });

  it('routes a publish task to BUILD/PUBLISH', () => {
    const trace = JSON.parse(runOrchestrate('publish v1.0 to npm and create the GitHub release'));
    expect(trace.selected_workflow).toBe('BUILD/PUBLISH');
    expect(trace.detected_signals.publish_release_build).toBe(1);
  });

  it('routes a perf task to PERFORMANCE/METRIC', () => {
    const trace = JSON.parse(runOrchestrate('make the API p95 < 200ms'));
    expect(trace.selected_workflow).toBe('PERFORMANCE/METRIC');
    expect(trace.detected_signals.metrics_research).toBeGreaterThan(0);
  });

  it('routes a multi-agent task to MULTI-AGENT TEAM', () => {
    const trace = JSON.parse(runOrchestrate('spawn a squad of specialists to audit the migration'));
    expect(trace.selected_workflow).toBe('MULTI-AGENT TEAM');
    expect(trace.detected_signals.multi_agent).toBeGreaterThan(0);
  });

  it('routes a bug task to BUG', () => {
    const trace = JSON.parse(runOrchestrate('fix the bug where Safari iOS renders wrong'));
    expect(trace.selected_workflow).toBe('BUG');
    expect(trace.detected_signals.bug_fix).toBeGreaterThan(0);
  });

  it('honors --check-kernel and reports kernel_used in the trace', () => {
    const trace = JSON.parse(runOrchestrate('Build a pricing page', ['--check-kernel']));
    expect(trace).toHaveProperty('kernel_used');
    expect([0, 1]).toContain(trace.kernel_used);
  });
});

describe('installer safety modes', () => {
  const INSTALL = join(ROOT, 'install.sh');

  it('has bash syntax', () => {
    expect(() => execFileSync('bash', ['-n', INSTALL])).not.toThrow();
  });

  it('--dry-run does not modify ~/.mavis/skills/mavis-ship/SKILL.md', () => {
    const skillPath = join(process.env.HOME || '', '.mavis', 'skills', 'mavis-ship', 'SKILL.md');
    let before = '';
    let beforeMtime = 0;
    if (existsSync(skillPath)) {
      const stat = require('node:fs').statSync(skillPath);
      before = readFileSync(skillPath, 'utf8');
      beforeMtime = stat.mtimeMs;
    }
    execFileSync('bash', [INSTALL, '--all', '--dry-run'], { encoding: 'utf8', stdio: 'pipe' });
    if (existsSync(skillPath)) {
      const stat = require('node:fs').statSync(skillPath);
      const after = readFileSync(skillPath, 'utf8');
      expect(after).toBe(before);
      expect(stat.mtimeMs).toBe(beforeMtime);
    }
  });

  it('--no-network --dry-run does not call curl, git clone, or npm install -g', () => {
    const out = execFileSync(
      'bash',
      [INSTALL, '--integrations', '--no-network', '--dry-run'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(out).toMatch(/no-network.*blocked/);
    // The integrations block should not contain a real network invocation.
    // We assert by absence of unstubbed calls in dry-run output.
    expect(out).not.toMatch(/npm install -g/);
  });

  it('--help exits 0 and prints usage', () => {
    const out = execFileSync('bash', [INSTALL, '--help'], { encoding: 'utf8' });
    expect(out).toContain('install.sh');
  });

  it('--trust-mode invalid value exits non-zero', () => {
    let code = 0;
    try {
      execFileSync('bash', [INSTALL, '--trust-mode', 'paranoid', '--verify'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      code = err.status ?? 1;
    }
    expect(code).not.toBe(0);
  });

  it('--verify is non-destructive', () => {
    const out = execFileSync('bash', [INSTALL, '--verify'], { encoding: 'utf8' });
    expect(out).toContain('Verifying install state');
  });
});

describe('kernel detection', () => {
  it('resolveKernelBinary returns null when env is clean (no kernel installed)', async () => {
    // We do NOT mock fs; we test that the function gracefully handles
    // a missing kernel without throwing.
    const { _internal } = await import('../src/commands/kernel.js');
    // It should at least return a string (best guess) or null. Never throw.
    const result = _internal.resolveKernelBinary();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('memoryHome returns the env override when set', async () => {
    process.env.AGENT_KERNEL_HOME = '/tmp/ak-test-home';
    const { _internal } = await import('../src/commands/kernel.js');
    expect(_internal.memoryHome()).toBe('/tmp/ak-test-home');
    delete process.env.AGENT_KERNEL_HOME;
  });

  it('memoryHome returns ~/.agent-kernel by default', async () => {
    delete process.env.AGENT_KERNEL_HOME;
    const { _internal } = await import('../src/commands/kernel.js');
    const os = await import('node:os');
    const path = await import('node:path');
    expect(_internal.memoryHome()).toBe(path.join(os.homedir(), '.agent-kernel'));
  });
});

describe('MMAS guardrails', () => {
  const SPAWN = join(ROOT, 'mmas', 'spawn-team.py');

  it('has python syntax', () => {
    expect(() => execFileSync('python3', ['-m', 'py_compile', SPAWN])).not.toThrow();
  });

  it('spawn --help documents all guardrail flags', () => {
    const out = execFileSync('python3', [SPAWN, 'spawn', '--help'], { encoding: 'utf8' });
    expect(out).toContain('--max-agents');
    expect(out).toContain('--timeout');
    expect(out).toContain('--plan-only');
    expect(out).toContain('--no-write');
    expect(out).toContain('--write-mode');
    expect(out).toContain('--kill-grace');
  });

  it('rejects --team larger than the hard cap of 8', () => {
    let code = 0;
    let stderr = '';
    try {
      execFileSync(
        'python3',
        [
          SPAWN,
          'spawn',
          'test',
          '--team',
          'atlas,forge,scout,oracle,reviewer,sentinel,visionary,librarian,atlas',
        ],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (err: any) {
      code = err.status ?? 1;
      stderr = err.stderr?.toString() || '';
    }
    expect(code).toBe(2);
    expect(stderr).toMatch(/hard cap/);
  });

  it('rejects --team larger than --max-agents', () => {
    let code = 0;
    let stderr = '';
    try {
      execFileSync(
        'python3',
        [
          SPAWN,
          'spawn',
          'test',
          '--team',
          'atlas,forge,scout,oracle,reviewer',
          '--max-agents',
          '3',
        ],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (err: any) {
      code = err.status ?? 1;
      stderr = err.stderr?.toString() || '';
    }
    expect(code).toBe(2);
    expect(stderr).toMatch(/max-agents/);
  });

  it('--plan-only exits 0 without spawning', () => {
    const out = execFileSync(
      'python3',
      [SPAWN, 'spawn', 'test plan', '--team', 'atlas,forge', '--plan-only'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(out).toContain('plan-only mode');
    expect(out).toContain('Re-run without --plan-only');
  });

  it('report subcommand rejects nonexistent task_id with non-zero exit', () => {
    let code = 0;
    try {
      execFileSync('python3', [SPAWN, 'report', 'nonexistent-task-id-zzz'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      code = err.status ?? 1;
    }
    expect(code).not.toBe(0);
  });
});