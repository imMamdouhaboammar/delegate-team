import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { debugLog } from '../utils/debug.js';

export interface RuntimePaths {
  workspaceRoot: string;
  delegateTeamPath: string;
  vertexCoderPath: string;
  relayScript: string;
  routerScript: string;
  vertexVenvPython: string;
  vertexDirectScript: string;
  vertexInteractiveScript: string;
}

export interface ResolveRuntimeRootOptions {
  startDir: string;
  override?: string;
  warn?: (message: string) => void;
}

export function isDelegateTeamRoot(directory: string): boolean {
  const packagePath = join(directory, 'package.json');
  if (!existsSync(packagePath)) return false;

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      name?: unknown;
    };
    return packageJson.name === 'delegate-team';
  } catch {
    return false;
  }
}

export function resolveRuntimeRoot({
  startDir,
  override = process.env.DT_RUNTIME_ROOT,
  warn = console.warn,
}: ResolveRuntimeRootOptions): string {
  if (override) {
    const resolvedOverride = resolve(override);
    if (isDelegateTeamRoot(resolvedOverride)) {
      debugLog('runtime-paths', 'using DT_RUNTIME_ROOT override', { root: resolvedOverride });
      return resolvedOverride;
    }

    warn(
      `[dt] Ignoring DT_RUNTIME_ROOT because it does not point to a delegate-team package root: ${resolvedOverride}`,
    );
    debugLog('runtime-paths', 'ignored invalid DT_RUNTIME_ROOT override', { root: resolvedOverride });
  }

  let current = resolve(startDir);
  const filesystemRoot = parse(current).root;

  while (true) {
    if (isDelegateTeamRoot(current)) {
      debugLog('runtime-paths', 'resolved runtime root', { startDir, root: current });
      return current;
    }
    if (current === filesystemRoot) break;
    current = dirname(current);
  }

  debugLog('runtime-paths', 'failed to resolve runtime root', { startDir: resolve(startDir) });
  throw new Error(
    `Unable to locate the delegate-team runtime root from ${resolve(startDir)}. ` +
      'Set DT_RUNTIME_ROOT to the installed delegate-team package root or reinstall delegate-team.',
  );
}

export function createRuntimePaths(workspaceRoot: string): RuntimePaths {
  const canonicalRoot = resolve(workspaceRoot);
  const delegateTeamPath = join(canonicalRoot, 'delegate-team');
  const vertexCoderPath = join(canonicalRoot, 'vertex-coder');

  return {
    workspaceRoot: canonicalRoot,
    delegateTeamPath,
    vertexCoderPath,
    relayScript: join(delegateTeamPath, 'scripts', 'relay.mjs'),
    routerScript: join(delegateTeamPath, 'scripts', 'opencode-router.mjs'),
    vertexVenvPython: join(vertexCoderPath, '.venv', 'bin', 'python3'),
    vertexDirectScript: join(vertexCoderPath, 'vertex_direct_coder.py'),
    vertexInteractiveScript: join(
      vertexCoderPath,
      'vertex_interactive_agent.py',
    ),
  };
}
