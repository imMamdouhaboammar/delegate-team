import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// When bundled by tsup, route.ts ends up inlined into dist/cli.js, so
// `here` is the dist/ directory at runtime. The orchestrator script
// lives at <repo>/orchestrator/scripts/orchestrate.sh — i.e. one level
// up from dist/. Try that first, then fall back to two levels up in
// case the file is loaded unbundled (e.g. ts-node, vitest).
function resolveOrchestrator(): string {
  const candidates = [
    join(here, '..', 'orchestrator', 'scripts', 'orchestrate.sh'),
    join(here, '..', '..', 'orchestrator', 'scripts', 'orchestrate.sh'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]; // best guess; will trigger the not-found branch.
}

const ORCHESTRATE = resolveOrchestrator();
const DEFAULT_TRACE_DIR = join(process.cwd(), 'dt_traces', 'routing');

interface RouteOptions {
  explain?: boolean;
  last?: boolean;
  checkKernel?: boolean;
  noTraceFile?: boolean;
  traceDir?: string;
  human?: boolean;
}

function readLatestTrace(traceDir: string): string | null {
  if (!existsSync(traceDir)) {
    return null;
  }
  const files = readdirSync(traceDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) {
    return null;
  }
  const latest = files[0];
  return readFileSync(join(traceDir, latest), 'utf8');
}

export function runRouteExplain(task: string, options: RouteOptions): number {
  // --last: print the most recent trace from disk (or the override dir).
  if (options.last && !task) {
    const dir = options.traceDir ? options.traceDir : DEFAULT_TRACE_DIR;
    const trace = readLatestTrace(dir);
    if (trace) {
      process.stdout.write(trace + '\n');
      return 0;
    }
    console.error(`No trace files found in ${dir}`);
    return 1;
  }

  // Require a task for everything else.
  if (!task) {
    console.error('Usage: dt route [--explain] [--check-kernel] [--no-trace-file] "<task>"');
    console.error('       dt route --last                       # print most recent trace');
    return 64;
  }

  if (!existsSync(ORCHESTRATE)) {
    console.error(`orchestrate.sh not found at ${ORCHESTRATE}`);
    console.error('Run ./install.sh --orchestrator to install it, or check that you are in the delegate-team repo.');
    return 2;
  }

  const args: string[] = [ORCHESTRATE];
  if (options.explain) {
    args.push('--json');
  }
  if (options.checkKernel) {
    args.push('--check-kernel');
  }
  if (options.noTraceFile) {
    args.push('--no-trace-file');
  }
  if (options.traceDir) {
    args.push('--trace-dir', options.traceDir);
  }
  args.push(task);

  const result = spawnSync('bash', args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });

  return result.status ?? 1;
}