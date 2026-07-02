import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function resolveKernelBinary(): string | null {
  // 1. Explicit override
  if (process.env.AGENT_KERNEL_BIN && existsSync(process.env.AGENT_KERNEL_BIN)) {
    return process.env.AGENT_KERNEL_BIN;
  }
  // 2. On PATH
  const onPath = spawnSync('command', ['-v', 'agent-kernel'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) {
    return onPath.stdout.trim();
  }
  // 3. Common bin dirs
  for (const d of [`${homedir()}/.local/bin`, `${homedir()}/bin`]) {
    const candidate = join(d, 'agent-kernel');
    if (existsSync(candidate)) return candidate;
  }
  // 4. Vendored (delegate-team ships agent-kernel/dist/cli.mjs)
  const candidates = [
    join(here, '..', '..', 'agent-kernel', 'dist', 'cli.mjs'),
    join(here, '..', '..', '..', 'agent-kernel', 'dist', 'cli.mjs'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function memoryHome(): string {
  return process.env.AGENT_KERNEL_HOME || join(homedir(), '.agent-kernel');
}

export interface KernelStatus {
  available: boolean;
  binary_path: string | null;
  binary_version: string | null;
  memory_home: string;
  memory_home_exists: boolean;
  episodes_count: number | null;
  rules_count: number | null;
  reason: string;
}

function runKernelCli(bin: string): string {
  // bin may be a path to cli.mjs (needs `node`) or a shell wrapper.
  const isMjs = bin.endsWith('.mjs');
  const cmd = isMjs ? 'node' : bin;
  const args = isMjs ? [bin, '--version'] : ['--version'];
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000 });
  if (r.status === 0) return (r.stdout || '').trim();
  return '';
}

function countJsonFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    const r = spawnSync('find', [dir, '-maxdepth', '2', '-name', '*.json', '-type', 'f'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      return r.stdout.trim().split('\n').filter(Boolean).length;
    }
  } catch {
    /* ignore */
  }
  return -1;
}

export function getKernelStatus(requireKernel: boolean): KernelStatus {
  const bin = resolveKernelBinary();
  const home = memoryHome();
  const homeExists = existsSync(home);

  const status: KernelStatus = {
    available: bin !== null,
    binary_path: bin,
    binary_version: null,
    memory_home: home,
    memory_home_exists: homeExists,
    episodes_count: null,
    rules_count: null,
    reason: '',
  };

  if (bin) {
    try {
      const v = runKernelCli(bin);
      status.binary_version = v || null;
    } catch {
      /* ignore */
    }
  }

  if (homeExists) {
    status.episodes_count = countJsonFiles(join(home, 'episodes'));
    status.rules_count = countJsonFiles(join(home, 'source', 'memories'));
  }

  if (requireKernel && !bin) {
    status.reason =
      'agent-kernel binary not found on PATH and not at vendored path. ' +
      'Run `./install.sh --kernel` or `npx -y @mamdouh/agent-kernel` to install.';
  } else if (requireKernel && bin && !homeExists) {
    status.reason =
      'agent-kernel binary is on PATH but the memory home ' +
      `${home} ` +
      'does not exist. Run `agent-kernel init --sync` to bootstrap it.';
  } else if (!bin) {
    status.reason =
      'agent-kernel is optional. delegate-team runs without it; the orchestrator ' +
      'silently skips the memory stage. Install via `./install.sh --kernel` to enable.';
  } else {
    status.reason = 'agent-kernel detected and ready.';
  }

  return status;
}

export function runKernelStatus(requireKernel: boolean): number {
  const s = getKernelStatus(requireKernel);
  console.log('');
  console.log('  agent-kernel status');
  console.log('  -------------------');
  console.log(`  available         : ${s.available ? 'yes' : 'no'}`);
  console.log(`  binary path       : ${s.binary_path || '(not found)'}`);
  console.log(`  binary version    : ${s.binary_version || '(unknown)'}`);
  console.log(`  memory home       : ${s.memory_home}${s.memory_home_exists ? '' : ' (missing)'}`);
  console.log(`  episodes (count)  : ${s.episodes_count === null ? 'n/a' : s.episodes_count}`);
  console.log(`  rules (count)     : ${s.rules_count === null ? 'n/a' : s.rules_count}`);
  console.log(`  reason            : ${s.reason}`);
  console.log('');

  // --require fails if either the binary is missing OR the memory home
  // does not exist (since the kernel is not functional without it).
  const kernelReady = s.available && s.memory_home_exists;
  if (requireKernel && !kernelReady) {
    console.error(`❌ --kernel was requested but agent-kernel is not ready.`);
    console.error(`   ${s.reason}`);
    return 2;
  }
  return 0;
}

export function runKernelVersion(): number {
  const bin = resolveKernelBinary();
  if (!bin) {
    console.error('agent-kernel not found. Run `./install.sh --kernel` to install.');
    return 2;
  }
  const isMjs = bin.endsWith('.mjs');
  const cmd = isMjs ? 'node' : bin;
  const args = isMjs ? [bin, '--version'] : ['--version'];
  const r = spawnSync(cmd, args, { stdio: 'inherit', timeout: 5000 });
  return r.status ?? 1;
}

// Re-export for tests
export const _internal = {
  resolveKernelBinary,
  memoryHome,
  runKernelCli,
};