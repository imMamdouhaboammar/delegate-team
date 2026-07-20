import type { Command } from 'commander';
import { discoverAgents } from '../remote/agents.js';
import { buildProjectPrompt, getBootstrapPrompt } from '../remote/prompts.js';
import {
  buildRemoteDoctorReport,
  initializeRemoteWorkspace,
  readRemoteWorkspace,
} from '../remote/workspace.js';
import type { AgentStatus, RemoteDoctorReport, RemotePolicy } from '../remote/types.js';

type JsonOption = { json?: boolean };

type InitOptions = JsonOption & {
  force?: boolean;
  allowInstall?: boolean;
  allowDelete?: boolean;
  allowCommit?: boolean;
  allowPush?: boolean;
  allowMerge?: boolean;
  allowPublish?: boolean;
  allowSystemChanges?: boolean;
  allowSecretRead?: boolean;
};

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nRemote agent error: ${message}\n`);
  process.exitCode = 1;
}

function printAgents(agents: AgentStatus[], json = false): void {
  if (json) {
    console.log(JSON.stringify(agents, null, 2));
    return;
  }

  console.log('\nLocal coding-agent CLIs\n');
  for (const agent of agents) {
    if (!agent.installed) {
      console.log(`- ${agent.label}: not installed`);
      continue;
    }
    const version = agent.version ? ` (${agent.version})` : '';
    console.log(`- ${agent.label}: ${agent.path}${version}`);
  }
}

function printDoctor(report: RemoteDoctorReport, json = false): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nRemote Agent Doctor: ${report.ready ? 'READY' : 'NOT READY'}`);
  console.log(`Workspace: ${report.workspace.root}`);
  console.log(`Initialized: ${report.workspace.initialized ? 'yes' : 'no'}`);
  console.log('\nCore tools');
  for (const [name, tool] of Object.entries(report.coreTools)) {
    const detail = tool.installed
      ? `${tool.path || 'available'}${tool.version ? ` (${tool.version})` : ''}`
      : 'missing';
    console.log(`- ${name}: ${detail}`);
  }
  printAgents(report.agents, false);
}

function policySummary(policy: RemotePolicy): Record<string, boolean | string> {
  return {
    workspaceRoot: policy.workspaceRoot,
    allowDependencyInstall: policy.allowDependencyInstall,
    allowDelete: policy.allowDelete,
    allowCommit: policy.allowCommit,
    allowPush: policy.allowPush,
    allowMerge: policy.allowMerge,
    allowPublish: policy.allowPublish,
    allowSystemChanges: policy.allowSystemChanges,
    allowSecretRead: policy.allowSecretRead,
  };
}

export function registerRemoteCommands(program: Command): void {
  const remote = program
    .command('remote')
    .description('Prepare ChatGPT as a governed local coding agent or delegator');

  remote
    .command('bootstrap')
    .description('Print the copy-ready ChatGPT bootstrap prompt')
    .action(() => {
      try {
        console.log(getBootstrapPrompt());
      } catch (error) {
        fail(error);
      }
    });

  remote
    .command('agents')
    .description('Detect local coding-agent CLIs')
    .option('--json', 'Print machine-readable JSON')
    .action((options: JsonOption) => {
      try {
        printAgents(discoverAgents(), options.json === true);
      } catch (error) {
        fail(error);
      }
    });

  remote
    .command('init [project]')
    .description('Initialize a project for ChatGPT Remote Agent workflows')
    .option('--force', 'Replace existing remote metadata and policy')
    .option('--json', 'Print machine-readable JSON')
    .option('--allow-install', 'Allow dependency installation')
    .option('--allow-delete', 'Allow file deletion')
    .option('--allow-commit', 'Allow Git commits')
    .option('--allow-push', 'Allow Git push')
    .option('--allow-merge', 'Allow Git merge')
    .option('--allow-publish', 'Allow package publishing')
    .option('--allow-system-changes', 'Allow persistent system changes')
    .option('--allow-secret-read', 'Allow reading secret or credential files')
    .action((project: string | undefined, options: InitOptions) => {
      try {
        const result = initializeRemoteWorkspace(project, {
          force: options.force === true,
          permissions: {
            allowDependencyInstall: options.allowInstall === true,
            allowDelete: options.allowDelete === true,
            allowCommit: options.allowCommit === true,
            allowPush: options.allowPush === true,
            allowMerge: options.allowMerge === true,
            allowPublish: options.allowPublish === true,
            allowSystemChanges: options.allowSystemChanges === true,
            allowSecretRead: options.allowSecretRead === true,
          },
        });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(
            `\nRemote workspace ${result.created ? 'initialized' : 'already initialized'}: ${result.workspaceRoot}`,
          );
          console.log('Project instructions: CHATGPT_REMOTE_AGENT.md');
          console.log('Policy: .delegate-team/policy.json\n');
        }
      } catch (error) {
        fail(error);
      }
    });

  remote
    .command('status [project]')
    .description('Show the current remote workspace policy')
    .option('--json', 'Print machine-readable JSON')
    .action((project: string | undefined, options: JsonOption) => {
      try {
        const workspace = readRemoteWorkspace(project);
        const summary = policySummary(workspace.policy);
        if (options.json) {
          console.log(JSON.stringify({
            initialized: true,
            metadata: workspace.metadata,
            policy: workspace.policy,
          }, null, 2));
        } else {
          console.log(`\nRemote workspace: ${workspace.workspaceRoot}`);
          for (const [key, value] of Object.entries(summary)) {
            console.log(`- ${key}: ${value}`);
          }
          console.log('');
        }
      } catch (error) {
        fail(error);
      }
    });

  remote
    .command('prompt [project]')
    .description('Print project-specific ChatGPT operating instructions')
    .action((project?: string) => {
      try {
        const workspace = readRemoteWorkspace(project);
        console.log(buildProjectPrompt(workspace.metadata, workspace.policy));
      } catch (error) {
        fail(error);
      }
    });

  remote
    .command('doctor [project]')
    .description('Check Remote Agent workspace and local tool readiness')
    .option('--json', 'Print machine-readable JSON')
    .action((project: string | undefined, options: JsonOption) => {
      try {
        const report = buildRemoteDoctorReport(project);
        printDoctor(report, options.json === true);
        if (!report.ready) process.exitCode = 1;
      } catch (error) {
        fail(error);
      }
    });
}
