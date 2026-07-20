import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { debugLog } from '../utils/debug.js';

export type UserConfig = {
  project_id: string;
  location: string;
  proxy_token: string;
};

export type UserConfigIssue = {
  field: string;
  message: string;
};

export type UserConfigValidation =
  | { ok: true; config: UserConfig; issues: [] }
  | { ok: false; config?: undefined; issues: UserConfigIssue[] };

const REQUIRED_FIELDS = ['project_id', 'location', 'proxy_token'] as const;

export function getUserConfigPath(homeDirectory: string = homedir()): string {
  return join(homeDirectory, '.config', 'dt', 'config.json');
}

export function validateUserConfig(value: unknown): UserConfigValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ field: 'config', message: 'must be a JSON object' }],
    };
  }

  const source = value as Record<string, unknown>;
  const issues: UserConfigIssue[] = [];
  const normalized: Record<string, string> = {};

  for (const field of REQUIRED_FIELDS) {
    const raw = source[field];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      issues.push({ field, message: 'must be a non-empty string' });
      continue;
    }
    normalized[field] = raw.trim();
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    config: normalized as UserConfig,
    issues: [],
  };
}

export function formatUserConfigIssues(issues: UserConfigIssue[]): string {
  const details = issues.map(issue => `${issue.field}: ${issue.message}`).join('; ');
  return `Invalid dt config: ${details}. Re-run \`dt setup\` to repair ${getUserConfigPath()}.`;
}

export type ReadUserConfigResult =
  | { state: 'missing'; path: string; issues: [] }
  | { state: 'valid'; path: string; config: UserConfig; issues: [] }
  | { state: 'invalid'; path: string; issues: UserConfigIssue[]; error: string };

export function readUserConfig(path: string = getUserConfigPath()): ReadUserConfigResult {
  if (!existsSync(path)) {
    debugLog('config', 'user config is missing', { path });
    return { state: 'missing', path, issues: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    const issues = [{ field: 'config', message: 'contains invalid JSON' }];
    debugLog('config', 'user config contains invalid JSON', { path, issues });
    return { state: 'invalid', path, issues, error: formatUserConfigIssues(issues) };
  }

  const validation = validateUserConfig(parsed);
  if (!validation.ok) {
    debugLog('config', 'user config failed validation', { path, issues: validation.issues });
    return {
      state: 'invalid',
      path,
      issues: validation.issues,
      error: formatUserConfigIssues(validation.issues),
    };
  }

  debugLog('config', 'user config is valid', { path });
  return { state: 'valid', path, config: validation.config, issues: [] };
}
