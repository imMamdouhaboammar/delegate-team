#!/usr/bin/env node
import { Command } from 'commander';
import { runCheck } from './commands/check.js';
import { runLinkSkill, runSetup, runAuth, runGcpEnable, runVertexProvision } from './commands/setup.js';
import { runDispatch, runVertex } from './commands/run.js';
import { runMetaGPTRouter } from './commands/metagpt.js';
import { runMMAS, resolveMMASScript } from './commands/mmas.js';
import { runApeiron } from './commands/apeiron.js';
import { runServe } from './proxy/server.js';
import { installBackendRequestTimeout } from './proxy/request-timeout.js';
import { runRouteExplain } from './commands/route.js';
import { runKernelStatus, runKernelVersion } from './commands/kernel.js';
import { parsePort } from './utils/port.js';
import { runDelegate, DELEGATE_AGENTS } from './commands/delegate.js';
import { runMesh } from './commands/mesh.js';
import { runIntegrations } from './commands/integrations.js';
import { WORKSPACE_ROOT } from './config/index.js';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read version from package.json — use fileURLToPath + dirname + join
// (NOT `new URL('../package.json', import.meta.url)` — that pattern
// makes Rspack/webpack treat package.json as an asset to bundle, which
// breaks BundlePhobia's new Rspack-backed analyzer with a
// "asset without `.bundle` suffix" error.)
const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(here, '..', 'package.json');
let version = '1.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  version = pkg.version;
} catch (e) {
  // fallback
}

const program = new Command();

program
  .name('dt')
  .description('Unified Multi-Backend Developer Agent Dispatch & CLI suite')
  .version(version);

program
  .command('check')
  .alias('status')
  .description('Scan health, configs, and credential status of all backends')
  .option('--strict', 'Exit with code 1 if no backends are fully ready')
  .option('--json', 'Print machine-readable JSON without ANSI formatting')
  .action((options) => {
    runCheck(options.strict, options.json);
  });

program
  .command('doctor')
  .description('Alias for check command')
  .option('--strict', 'Exit with code 1 if no backends are fully ready')
  .option('--json', 'Print machine-readable JSON without ANSI formatting')
  .action((options) => {
    runCheck(options.strict, options.json);
  });

program
  .command('link-skill')
  .description('Automate integration by symlinking tools to local Claude/Gemini folders')
  .action(() => {
    runLinkSkill();
  });

program
  .command('setup')
  .alias('init')
  .description('Run autopilot setup to automatically configure dependencies, auth, GCP & agents')
  .option('--project <id>', 'GCP project ID for non-interactive setup')
  .option('--location <region>', 'GCP location to write into dt config', 'us-central1')
  .option('--skip-auth', 'Skip gcloud auth login and ADC login')
  .option('--skip-gcp-enable', 'Skip enabling Vertex AI and Dialogflow APIs')
  .option('--skip-provision', 'Skip Vertex AI agent provisioning')
  .option('-y, --yes', 'Use safe default answers for setup prompts')
  .action((options) => {
    runSetup(options).catch(err => {
      console.error('\n❌ Setup failed:', err);
      process.exit(1);
    });
  });

program
  .command('auth')
  .description('Authenticate with Google Cloud (gcloud login)')
  .action(() => {
    runAuth().catch(err => {
      console.error('\n❌ Auth failed:', err);
      process.exit(1);
    });
  });

program
  .command('gcp-enable <project_id>')
  .description('Enable Vertex AI and Dialogflow APIs in your GCP project')
  .action((projectId) => {
    runGcpEnable(projectId).catch(err => {
      console.error('\n❌ GCP Enable failed:', err);
      process.exit(1);
    });
  });

program
  .command('vertex-provision')
  .description('Provision the Vertex AI agent on GCP')
  .action(() => {
    runVertexProvision().catch(err => {
      console.error('\n❌ Vertex provision failed:', err);
      process.exit(1);
    });
  });

program
  .command('vx <mode> [args...]')
  .alias('vertex')
  .description('Direct high-performance interface for Google Vertex AI coding agent (modes: direct, interactive)')
  .action((mode, args) => {
    runVertex(mode, args);
  });

program
  .command('metagpt [prompt...]')
  .alias('mg')
  .description('Launch MetaGPT AI Software Company for complex multi-agent architectures')
  .option('--plan-only', 'Generate plan and architecture without writing code')
  .option('--approve-write', 'Require human approval before writing to disk')
  .option('--workspace-only', 'Strictly sandbox MetaGPT to the current workspace root')
  .option('--no-install', 'Prevent MetaGPT from installing package dependencies')
  .option('--dry-run', 'Simulate workflow without making destructive changes')
  .action(async (promptArray, options) => {
    const prompt = Array.isArray(promptArray) ? promptArray.join(" ") : promptArray;
    const code = await runMetaGPTRouter(prompt, options);
    process.exit(code);
  });

program
  .command('apeiron [task...]')
  .alias('ship')
  .description('Run the Apeiron universal orchestrator autopilot')
  .option('-b, --backend <backend>', 'Override execution backend')
  .option('--background', 'Run in background (returns PID and log path)')
  .option('--dry-run', 'Print the execution plan without executing')
  .action(async (taskArray, options) => {
    const task = Array.isArray(taskArray) ? taskArray.join(" ") : taskArray;
    const code = await runApeiron(task, options);
    process.exit(code);
  });

program
  .command('mmas [task...]')
  .description('Interface with Apeiron Multi-Agent System (MMAS)')
  .option('--team <agents>', 'Comma-separated agent names')
  .option('--atlas', 'Spawn Atlas alone to pick the team')
  .option('--status <task_id>', 'Show status of a running task')
  .option('--stop <task_id>', 'Stop a running task')
  .option('--report <task_id>', 'Print post-hoc summary report')
  .option('--list', 'List available agents')
  .option('--plan-only', 'Print planned team and exit before spawning')
  .option('--no-write', 'Do not write edits to disk')
  .option('--write-mode <mode>', 'Write mode (workspace, logs-only, none)', 'workspace')
  .option('--timeout <seconds>', 'Per-agent timeout')
  .action(async (taskArray, options) => {
    const taskArgs = Array.isArray(taskArray) ? taskArray : [];
    let subArgs: string[] = [];

    if (taskArgs[0] === 'list') {
      subArgs = ['list'];
    } else if (taskArgs[0] === 'status') {
      subArgs = ['status', taskArgs[1]];
    } else if (taskArgs[0] === 'stop') {
      subArgs = ['stop', taskArgs[1]];
    } else if (taskArgs[0] === 'report') {
      subArgs = ['report', taskArgs[1]];
    } else {
      // Default to spawn
      const task = taskArgs.join(' ');
      const code = await runMMAS(task, options);
      process.exit(code);
      return;
    }

    // Run subcommands by spawning Python script
    const scriptPath = resolveMMASScript();
    const { spawn } = await import('node:child_process');
    const child = spawn('python3', [scriptPath, ...subArgs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DELEGATE_TEAM_ROOT: WORKSPACE_ROOT,
      }
    });

    child.on('close', (code) => {
      process.exit(code || 0);
    });
  });

program
  .command('run [prompt...]')
  .alias('dispatch')
  .description('Dispatch a task to a backend agent with automatic routing & failover')
  .option('-b, --backend <backend>', 'Specify a backend to use directly')
  .option('--brief <file>', 'Specify a brief file instead of a direct prompt')
  .option('--team', 'Force routing to the MetaGPT team orchestrator')
  .option('--allow-install', 'Allow package installation during execution')
  .option('--approve-write', 'Require human approval before writing to disk')
  .option('--dry-run', 'Show routing and fallback plan without executing a backend')
  .action((promptArray, options) => {
    const prompt = Array.isArray(promptArray) ? promptArray.join(" ") : promptArray;
    runDispatch(prompt, options);
  });

program
  .command('route')
  .description('Inspect /Apeiron routing decisions without executing')
  .argument('[task...]', 'Task to route (omit when using --last)')
  .option('--explain', 'Print structured JSON trace')
  .option('--last', 'Print the most recent trace from dt_traces/routing/')
  .option('--check-kernel', 'Warn when agent-kernel is missing (with --explain)')
  .option('--no-trace-file', 'Do not persist a trace to dt_traces/routing/')
  .option('--trace-dir <dir>', 'Override the trace output directory')
  .option('--human', 'Print human-readable summary (default if --explain omitted)')
  .action((taskArray, options) => {
    const task = Array.isArray(taskArray) ? taskArray.join(" ") : (taskArray || '');
    const code = runRouteExplain(task, options);
    process.exit(code);
  });

program
  .command('kernel')
  .description('agent-kernel status, version, and detection')
  .option('--require', 'Exit non-zero if agent-kernel is not installed')
  .action((options) => {
    const code = runKernelStatus(options.require === true);
    process.exit(code);
  });

program
  .command('kernel-version')
  .description('Print the vendored agent-kernel version (or fail if missing)')
  .action(() => {
    const code = runKernelVersion();
    process.exit(code);
  });

program
  .command('delegate <agent> [prompt...]')
  .description(`Delegate a coding task to a CLI implementer agent, then review the diff yourself. Agents: ${DELEGATE_AGENTS.join(', ')}`)
  .option('--brief <file>', 'Path to the self-contained brief file')
  .option('--read-only', 'Review/diagnosis only (no edits; best-effort)')
  .option('--full-access', 'Unrestricted auto-approve (opt-in)')
  .option('--model <name>', 'Model to use for this run')
  .option('--cd <dir>', 'Working root for the implementer (default: cwd)')
  .option('--max-turns <n>', 'Maximum number of agent turns')
  .action((agent: string, promptArray: string[], options: any) => {
    const prompt = Array.isArray(promptArray) ? promptArray.join(' ') : (promptArray || '');
    if (prompt && !options.brief) {
      // Convenience: a bare prompt string becomes the brief contents via stdin
      // is not supported here; require --brief for determinism.
      console.error('\n❌ Provide the task via --brief <file> (a self-contained brief).');
      process.exit(1);
    }
    runDelegate(agent, {
      brief: options.brief,
      readOnly: options.readOnly === true,
      fullAccess: options.fullAccess === true,
      model: options.model,
      cd: options.cd,
      maxTurns: options.maxTurns !== undefined ? Number(options.maxTurns) : undefined,
    });
  });

program
  .command('mesh')
  .description('Inspect the neural mesh: neurons, synapses, graph, and live trace bus')
  .option('--json', 'Print the full mesh as JSON')
  .option('--graph', 'Print a DOT graph of the mesh (pipe to dot -Tsvg)')
  .option('--neurons', 'Show only neurons')
  .option('--synapses', 'Show only synapses')
  .option('--trace', 'Replay recent synapse events from the trace bus')
  .option('--last', 'Print only the most recent synapse event')
  .action((options) => {
    const code = runMesh({
      format: options.graph ? 'graph' : options.json ? 'json' : 'human',
      last: options.last === true,
      neurons: options.neurons === true ? true : undefined,
      synapses: options.synapses === true ? true : undefined,
      trace: options.trace === true,
    });
    process.exit(code);
  });

program
  .command('serve [port]')
  .alias('proxy')
  .description('Start the LLM Gateway Proxy Server')
  .action((port) => {
    try {
      const timeoutMs = installBackendRequestTimeout();
      runServe(parsePort(port));
      console.log(`[PROXY] Backend timeout: ${timeoutMs}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ ${message}\n`);
      process.exitCode = 64;
    }
  });

program
  .command('integrations [path]')
  .alias('intg')
  .description('Check, install, and update companion integrations. Use --auto to auto-discover based on project needs.')
  .option('--auto', 'Scan target path and automatically install recommended tools')
  .option('--dry-run', 'Show recommendations and installation commands without executing them')
  .action((path, options) => {
    runIntegrations({
      auto: options.auto === true,
      dryRun: options.dryRun === true,
      path: path,
    });
  });

// Check for unknown commands before parsing to prevent dangerous fallbacks
if (process.argv.length > 2 && !process.argv[2].startsWith('-')) {
  const isCommand = ['check', 'status', 'doctor', 'link-skill', 'setup', 'init', 'auth', 'gcp-enable', 'vertex-provision', 'vx', 'vertex', 'metagpt', 'mg', 'run', 'dispatch', 'serve', 'proxy', 'route', 'kernel', 'kernel-version', 'delegate', 'mesh', 'help', 'apeiron', 'ship', 'mmas', 'integrations', 'intg'].includes(process.argv[2]);
  if (!isCommand) {
    console.error(`\n❌ Error: Unknown command '${process.argv[2]}'.`);
    console.error(`Run 'dt --help' to see available commands.\n`);
    process.exit(1);
  }
}

program.parse(process.argv);
