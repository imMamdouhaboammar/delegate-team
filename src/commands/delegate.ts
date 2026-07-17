import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// The five CLI implementer agents this component knows how to delegate to.
// Each maps to a sibling skill dir: delegate-skills/<agent>-delegate/.
export const DELEGATE_AGENTS = ['agy', 'codex', 'grok', 'kimi', 'opencode'] as const;
export type DelegateAgent = (typeof DELEGATE_AGENTS)[number];

export interface DelegateOptions {
  brief?: string;
  readOnly?: boolean;
  fullAccess?: boolean;
  model?: string;
  cd?: string;
  maxTurns?: number;
}

const here = dirname(fileURLToPath(import.meta.url));
// src/commands/delegate.ts → repo root is two levels up.
const REPO_ROOT_FALLBACK = join(here, '..', '..');

/** Resolve the repo root. Prefer cwd (set by `dt` at runtime); fall back to
 *  the module-relative path so unit tests and built dist behave identically. */
export function resolveRepoRoot(override?: string): string {
  return override ?? process.cwd() ?? REPO_ROOT_FALLBACK;
}

/** Absolute path to a delegate skill's relay script. */
export function resolveRelayPath(agent: string, repoRoot?: string): string {
  if (!DELEGATE_AGENTS.includes(agent as DelegateAgent)) {
    throw new Error(`unknown delegate agent: ${agent}`);
  }
  return join(resolveRepoRoot(repoRoot), 'delegate-skills', `${agent}-delegate`, 'scripts', 'relay.mjs');
}

/**
 * Build the argv for invoking a delegate skill's relay. Pure + side-effect free
 * so it can be unit-tested without spawning a process.
 *
 * @throws if the agent is unknown or no --brief is supplied.
 */
export function buildDelegateArgs(
  agent: string,
  options: DelegateOptions,
  repoRoot?: string,
): string[] {
  if (!DELEGATE_AGENTS.includes(agent as DelegateAgent)) {
    throw new Error(`unknown delegate agent: ${agent} (expected one of ${DELEGATE_AGENTS.join(', ')})`);
  }
  if (!options.brief) {
    throw new Error('a --brief <file> is required to delegate a task');
  }

  const relay = resolveRelayPath(agent, repoRoot);
  const args: string[] = ['node', relay, '--brief', options.brief];

  if (options.readOnly) args.push('--read-only');
  if (options.fullAccess) args.push('--full-access');
  if (options.model) args.push('--model', options.model);
  if (options.cd) args.push('--cd', options.cd);
  if (options.maxTurns !== undefined) args.push('--max-turns', String(options.maxTurns));

  return args;
}

/** CLI action: resolve + run the delegate relay, streaming its output. */
export function runDelegate(agent: string, options: DelegateOptions): void {
  const relay = resolveRelayPath(agent);
  if (!existsSync(relay)) {
    console.error(`\n❌ Delegate skill not found at ${relay}`);
    console.error(`   Run \`./install.sh --delegate-skills\` to install it, or check delegate-skills/.`);
    process.exitCode = 1;
    return;
  }

  const args = buildDelegateArgs(agent, options);
  const child = spawn(args[0], args.slice(1), {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('error', (err) => {
    console.error(`\n❌ Failed to launch delegate relay: ${err.message}`);
    process.exitCode = 1;
  });
  child.on('close', (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}
