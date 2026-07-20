import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, extname, join } from 'node:path';
import type { AgentStatus, CommandStatus } from './types.js';

export type DiscoveryOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

type AgentDefinition = {
  id: string;
  label: string;
  commands: string[];
};

export const KNOWN_AGENTS: AgentDefinition[] = [
  { id: 'codex', label: 'OpenAI Codex CLI', commands: ['codex'] },
  { id: 'claude', label: 'Claude Code', commands: ['claude'] },
  { id: 'gemini', label: 'Gemini CLI', commands: ['gemini'] },
  { id: 'opencode', label: 'OpenCode', commands: ['opencode'] },
  { id: 'kimi', label: 'Kimi CLI', commands: ['kimi'] },
  { id: 'minimax', label: 'MiniMax', commands: ['mmx', 'minimax'] },
  { id: 'grok', label: 'Grok CLI', commands: ['grok'] },
  { id: 'agy', label: 'AGY', commands: ['agy'] },
];

function executableExtensions(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== 'win32') return [''];
  return (env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .filter(Boolean)
    .map((value) => value.toLowerCase());
}

export function resolveExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const pathValue = env.PATH || env.Path || env.path || '';
  const extensions = executableExtensions(env);
  const hasExtension = extname(command).length > 0;

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidates = hasExtension
      ? [join(directory, command)]
      : extensions.map((extension) => join(directory, `${command}${extension}`));

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  }

  return null;
}

function cleanVersion(output: string): string | null {
  const line = output
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line || null;
}

export function probeCommand(
  command: string,
  options: DiscoveryOptions = {},
): CommandStatus {
  const env = options.env || process.env;
  const path = resolveExecutable(command, env);
  if (!path) {
    return { command, path: null, installed: false, version: null };
  }

  const result = spawnSync(path, ['--version'], {
    encoding: 'utf8',
    env,
    timeout: options.timeoutMs ?? 3_000,
    windowsHide: true,
  });
  const version = cleanVersion(`${result.stdout || ''}\n${result.stderr || ''}`);
  return { command, path, installed: true, version };
}

export function discoverAgents(options: DiscoveryOptions = {}): AgentStatus[] {
  return KNOWN_AGENTS.map((definition) => {
    for (const command of definition.commands) {
      const status = probeCommand(command, options);
      if (status.installed) {
        return {
          id: definition.id,
          label: definition.label,
          command,
          path: status.path,
          installed: true,
          version: status.version,
        };
      }
    }

    return {
      id: definition.id,
      label: definition.label,
      command: null,
      path: null,
      installed: false,
      version: null,
    };
  });
}
