import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { discoverAgents, probeCommand } from './agents.js';
import { buildProjectPrompt } from './prompts.js';
import type {
  RemoteDoctorReport,
  RemoteMetadata,
  RemotePolicy,
  RemoteSessionState,
  RemoteWorkspace,
} from './types.js';
import type { DiscoveryOptions } from './agents.js';

export type InitializeRemoteOptions = {
  force?: boolean;
  permissions?: Partial<Pick<
    RemotePolicy,
    | 'allowDependencyInstall'
    | 'allowDelete'
    | 'allowCommit'
    | 'allowPush'
    | 'allowMerge'
    | 'allowPublish'
    | 'allowSystemChanges'
    | 'allowSecretRead'
  >>;
};

export type RemoteInitResult = RemoteWorkspace & {
  created: boolean;
};

function canonicalizeWorkspace(project?: string): string {
  const candidate = resolve(project || process.cwd());
  if (!existsSync(candidate)) {
    throw new Error(`Remote workspace does not exist: ${candidate}`);
  }
  if (!statSync(candidate).isDirectory()) {
    throw new Error(`Remote workspace is not a directory: ${candidate}`);
  }
  return realpathSync.native(candidate);
}

function remotePaths(workspaceRoot: string) {
  const controlDir = join(workspaceRoot, '.delegate-team');
  return {
    controlDir,
    logsDir: join(controlDir, 'logs'),
    metadata: join(controlDir, 'remote-agent.json'),
    policy: join(controlDir, 'policy.json'),
    session: join(controlDir, 'session-state.json'),
    ignore: join(controlDir, '.gitignore'),
    logKeep: join(controlDir, 'logs', '.gitkeep'),
    prompt: join(workspaceRoot, 'CHATGPT_REMOTE_AGENT.md'),
  };
}

function writeAtomic(path: string, content: string, mode = 0o600): void {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, content, { encoding: 'utf8', mode });
  renameSync(temporary, path);
  chmodSync(path, mode);
}

function writeJson(path: string, value: unknown): void {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultPolicy(
  workspaceRoot: string,
  permissions: InitializeRemoteOptions['permissions'] = {},
): RemotePolicy {
  return {
    schema: 'delegate-team.remote-policy.v1',
    workspaceRoot,
    allowDependencyInstall: permissions.allowDependencyInstall === true,
    allowDelete: permissions.allowDelete === true,
    allowCommit: permissions.allowCommit === true,
    allowPush: permissions.allowPush === true,
    allowMerge: permissions.allowMerge === true,
    allowPublish: permissions.allowPublish === true,
    allowSystemChanges: permissions.allowSystemChanges === true,
    allowSecretRead: permissions.allowSecretRead === true,
    requireFeatureBranch: true,
    requireBaselineTests: true,
    requireFinalVerification: true,
    requireDiffReview: true,
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function validatePolicy(policy: RemotePolicy, workspaceRoot: string): void {
  if (policy.schema !== 'delegate-team.remote-policy.v1') {
    throw new Error(`Unsupported remote policy schema in ${workspaceRoot}`);
  }
  if (policy.workspaceRoot !== workspaceRoot) {
    throw new Error(
      `Remote policy workspace mismatch: expected ${workspaceRoot}, got ${policy.workspaceRoot}`,
    );
  }
}

export function initializeRemoteWorkspace(
  project?: string,
  options: InitializeRemoteOptions = {},
): RemoteInitResult {
  const workspaceRoot = canonicalizeWorkspace(project);
  const paths = remotePaths(workspaceRoot);
  const alreadyInitialized = existsSync(paths.metadata) && existsSync(paths.policy);
  const now = new Date().toISOString();

  mkdirSync(paths.controlDir, { recursive: true, mode: 0o700 });
  mkdirSync(paths.logsDir, { recursive: true, mode: 0o700 });
  chmodSync(paths.controlDir, 0o700);
  chmodSync(paths.logsDir, 0o700);

  let metadata: RemoteMetadata;
  if (existsSync(paths.metadata) && !options.force) {
    metadata = readJson<RemoteMetadata>(paths.metadata);
  } else {
    metadata = {
      schema: 'delegate-team.remote-agent.v1',
      version: 1,
      projectName: basename(workspaceRoot),
      workspaceRoot,
      createdAt: now,
      updatedAt: now,
    };
    writeJson(paths.metadata, metadata);
  }

  let policy: RemotePolicy;
  if (existsSync(paths.policy) && !options.force) {
    policy = readJson<RemotePolicy>(paths.policy);
    validatePolicy(policy, workspaceRoot);
  } else {
    policy = defaultPolicy(workspaceRoot, options.permissions);
    writeJson(paths.policy, policy);
  }

  if (!existsSync(paths.session) || options.force) {
    const state: RemoteSessionState = {
      schema: 'delegate-team.remote-session.v1',
      selectedMode: 'unselected',
      lastCheckedAt: null,
    };
    writeJson(paths.session, state);
  }

  if (!existsSync(paths.ignore) || options.force) {
    writeAtomic(
      paths.ignore,
      'logs/*\n!logs/.gitkeep\nsession-state.json\n',
      0o600,
    );
  }
  if (!existsSync(paths.logKeep)) {
    writeAtomic(paths.logKeep, '', 0o600);
  }

  writeAtomic(paths.prompt, `${buildProjectPrompt(metadata, policy)}\n`, 0o600);

  return {
    created: !alreadyInitialized,
    workspaceRoot,
    metadata,
    policy,
  };
}

export function readRemoteWorkspace(project?: string): RemoteWorkspace {
  const workspaceRoot = canonicalizeWorkspace(project);
  const paths = remotePaths(workspaceRoot);
  if (!existsSync(paths.metadata) || !existsSync(paths.policy)) {
    throw new Error(
      `Remote workspace is not initialized. Initialize the project with the remote init command: ${workspaceRoot}`,
    );
  }

  const metadata = readJson<RemoteMetadata>(paths.metadata);
  const policy = readJson<RemotePolicy>(paths.policy);
  validatePolicy(policy, workspaceRoot);
  return { workspaceRoot, metadata, policy };
}

export function buildRemoteDoctorReport(
  project?: string,
  options: DiscoveryOptions = {},
): RemoteDoctorReport {
  const workspaceRoot = canonicalizeWorkspace(project);
  const paths = remotePaths(workspaceRoot);
  const initialized = existsSync(paths.metadata) && existsSync(paths.policy);

  const node = {
    command: 'node',
    path: process.execPath,
    installed: true,
    version: process.version,
  };
  const npm = probeCommand('npm', options);
  const git = probeCommand('git', options);
  const dt = probeCommand('dt', options);
  const agents = discoverAgents(options);
  const coreReady = [node, npm, git, dt].every((tool) => tool.installed);

  return {
    ready: initialized && coreReady,
    workspace: { root: workspaceRoot, initialized },
    coreTools: { node, npm, git, dt },
    agents,
  };
}
