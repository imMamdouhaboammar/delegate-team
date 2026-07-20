import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAgents } from '../src/remote/agents.js';
import { getBootstrapPrompt } from '../src/remote/prompts.js';
import {
  buildRemoteDoctorReport,
  initializeRemoteWorkspace,
  readRemoteWorkspace,
} from '../src/remote/workspace.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'delegate team remote '));
  tempRoots.push(root);
  return root;
}

function makeWorkspace(): string {
  const workspace = join(makeTempRoot(), 'project with spaces #1');
  mkdirSync(workspace, { recursive: true });
  return workspace;
}

function writeExecutable(path: string, version: string): void {
  writeFileSync(path, `#!/bin/sh\necho "${version}"\n`);
  chmodSync(path, 0o755);
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('README bootstrap synchronization', () => {
  it('matches the shipped bootstrap template byte-for-byte', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const match = readme.match(/<!-- CHATGPT_REMOTE_BOOTSTRAP_PROMPT_START -->\n````text\n([\s\S]*?)\n````\n<!-- CHATGPT_REMOTE_BOOTSTRAP_PROMPT_END -->/);
    expect(match?.[1].trimEnd()).toBe(getBootstrapPrompt());
    expect(readme).toContain('npx @wonderwhy-er/desktop-commander@latest remote');
    expect(readme).toContain('keep it running');
  });
});

describe('ChatGPT remote bootstrap prompt', () => {
  it('discloses setup and offers all operating modes', () => {
    const prompt = getBootstrapPrompt();

    expect(prompt).toContain('Remote Desktop Commander');
    expect(prompt).toContain('npm install -g delegate-team');
    expect(prompt).toContain('Tell the user before');
    expect(prompt).toContain('dt --version');
    expect(prompt).toContain('dt doctor');
    expect(prompt).toContain('ChatGPT Coding Agent');
    expect(prompt).toContain('ChatGPT Delegator');
    expect(prompt).toContain('Hybrid Mode');
    expect(prompt).toContain("Wait for the user's choice");
  });
});

describe('remote workspace initialization', () => {
  it('creates a canonical, deny-by-default workspace contract', () => {
    const workspace = makeWorkspace();
    const result = initializeRemoteWorkspace(workspace);

    expect(result.created).toBe(true);
    expect(result.workspaceRoot).toContain('project with spaces #1');

    const controlDir = join(workspace, '.delegate-team');
    for (const relative of [
      'remote-agent.json',
      'policy.json',
      'session-state.json',
      '.gitignore',
      'logs/.gitkeep',
    ]) {
      expect(existsSync(join(controlDir, relative))).toBe(true);
    }
    expect(existsSync(join(workspace, 'CHATGPT_REMOTE_AGENT.md'))).toBe(true);

    const policy = readJson(join(controlDir, 'policy.json'));
    expect(policy.workspaceRoot).toBe(result.workspaceRoot);
    expect(policy.allowDependencyInstall).toBe(false);
    expect(policy.allowDelete).toBe(false);
    expect(policy.allowCommit).toBe(false);
    expect(policy.allowPush).toBe(false);
    expect(policy.allowMerge).toBe(false);
    expect(policy.allowPublish).toBe(false);
    expect(policy.allowSystemChanges).toBe(false);
    expect(policy.allowSecretRead).toBe(false);
    expect(policy.requireFeatureBranch).toBe(true);
    expect(policy.requireBaselineTests).toBe(true);
    expect(policy.requireFinalVerification).toBe(true);
    expect(policy.requireDiffReview).toBe(true);

    const projectPrompt = readFileSync(
      join(workspace, 'CHATGPT_REMOTE_AGENT.md'),
      'utf8',
    );
    expect(projectPrompt).toContain(result.workspaceRoot);
    expect(projectPrompt).toContain('dt delegate');
    expect(projectPrompt).toContain('Do not read secrets');
  });

  it('preserves existing policy unless force is requested', () => {
    const workspace = makeWorkspace();
    initializeRemoteWorkspace(workspace);
    const policyPath = join(workspace, '.delegate-team', 'policy.json');
    const policy = readJson(policyPath);
    policy.allowPush = true;
    writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

    const second = initializeRemoteWorkspace(workspace);
    expect(second.created).toBe(false);
    expect(readJson(policyPath).allowPush).toBe(true);

    initializeRemoteWorkspace(workspace, { force: true });
    expect(readJson(policyPath).allowPush).toBe(false);
  });

  it('fails clearly before a project is initialized', () => {
    const workspace = makeWorkspace();
    expect(() => readRemoteWorkspace(workspace)).toThrow(/remote init/i);
  });
});

describe('local coding-agent discovery', () => {
  it('detects installed CLIs without requiring every optional agent', () => {
    const root = makeTempRoot();
    const binDir = join(root, 'fake bin');
    mkdirSync(binDir, { recursive: true });
    writeExecutable(join(binDir, 'codex'), 'codex-cli 9.9.9');
    writeExecutable(join(binDir, 'claude'), 'claude 8.8.8');

    const agents = discoverAgents({
      env: { ...process.env, PATH: binDir },
      timeoutMs: 2_000,
    });

    const codex = agents.find((agent) => agent.id === 'codex');
    const claude = agents.find((agent) => agent.id === 'claude');
    const gemini = agents.find((agent) => agent.id === 'gemini');

    expect(codex).toMatchObject({
      installed: true,
      command: 'codex',
      version: 'codex-cli 9.9.9',
    });
    expect(claude).toMatchObject({ installed: true, command: 'claude' });
    expect(gemini).toMatchObject({ installed: false });
  });
});

describe('remote doctor report', () => {
  it('reports initialized readiness while treating agents as optional', () => {
    const workspace = makeWorkspace();
    initializeRemoteWorkspace(workspace);

    const root = makeTempRoot();
    const binDir = join(root, 'core tools');
    mkdirSync(binDir, { recursive: true });
    writeExecutable(join(binDir, 'npm'), 'npm 11.0.0');
    writeExecutable(join(binDir, 'git'), 'git version 2.50.0');
    writeExecutable(join(binDir, 'dt'), '3.1.0');

    const report = buildRemoteDoctorReport(workspace, {
      env: { ...process.env, PATH: binDir },
      timeoutMs: 2_000,
    });

    expect(report.ready).toBe(true);
    expect(report.workspace.initialized).toBe(true);
    expect(report.coreTools.node.installed).toBe(true);
    expect(report.coreTools.npm.installed).toBe(true);
    expect(report.coreTools.git.installed).toBe(true);
    expect(report.coreTools.dt.installed).toBe(true);
    expect(report.agents.every((agent) => agent.installed === false)).toBe(true);
  });

  it('fails for a target that does not exist', () => {
    const missing = join(makeTempRoot(), 'missing project');
    expect(() => buildRemoteDoctorReport(missing)).toThrow(/does not exist/i);
  });
});
