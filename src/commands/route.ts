import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_ROOT } from '../config/index.js';
import { ExitCode } from '../utils/exit-codes.js';

function resolveOrchestrator(): string {
  return join(WORKSPACE_ROOT, 'orchestrator', 'scripts', 'orchestrate.sh');
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
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const path = join(traceDir, file);
      return { file, path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.file.localeCompare(a.file));

  if (files.length === 0) {
    return null;
  }

  return readFileSync(files[0].path, 'utf8');
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
    return ExitCode.FAILURE;
  }

  // Require a task for everything else.
  if (!task) {
    console.error('Usage: dt route [--explain] [--check-kernel] [--no-trace-file] "<task>"');
    console.error('       dt route --last                       # print most recent trace');
    return ExitCode.USAGE;
  }

  if (!existsSync(ORCHESTRATE)) {
    console.error(`orchestrate.sh not found at ${ORCHESTRATE}`);
    console.error('Run ./install.sh --orchestrator to install it, or check that you are in the delegate-team repo.');
    return ExitCode.MISSING_DEPENDENCY;
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

  return result.status ?? ExitCode.FAILURE;
}
