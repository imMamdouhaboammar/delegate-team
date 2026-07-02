#!/usr/bin/env node
import { Command } from 'commander';
import { runCheck } from './commands/check.js';
import { runLinkSkill, runSetup, runAuth, runGcpEnable, runVertexProvision } from './commands/setup.js';
import { runDispatch, runVertex } from './commands/run.js';
import { runMetaGPTRouter } from './commands/metagpt.js';
import { runServe } from './proxy/server.js';
import { runRouteExplain } from './commands/route.js';
import { runKernelStatus, runKernelVersion } from './commands/kernel.js';
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
  .action((options) => {
    runCheck(options.strict);
  });

program
  .command('doctor')
  .description('Alias for check command')
  .option('--strict', 'Exit with code 1 if no backends are fully ready')
  .action((options) => {
    runCheck(options.strict);
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
  .action(() => {
    runSetup().catch(err => {
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
  .command('run [prompt...]')
  .alias('dispatch')
  .description('Dispatch a task to a backend agent with automatic routing & failover')
  .option('-b, --backend <backend>', 'Specify a backend to use directly')
  .option('--brief <file>', 'Specify a brief file instead of a direct prompt')
  .option('--team', 'Force routing to the MetaGPT team orchestrator')
  .option('--allow-install', 'Allow package installation during execution')
  .option('--approve-write', 'Require human approval before writing to disk')
  .action((promptArray, options) => {
    const prompt = Array.isArray(promptArray) ? promptArray.join(" ") : promptArray;
    runDispatch(prompt, options);
  });

program
  .command('route')
  .description('Inspect /mavis-ship routing decisions without executing')
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
  .command('serve [port]')
  .alias('proxy')
  .description('Start the LLM Gateway Proxy Server')
  .action((port) => {
    runServe(port ? parseInt(port, 10) : 3000);
  });

// Check for unknown commands before parsing to prevent dangerous fallbacks
if (process.argv.length > 2 && !process.argv[2].startsWith('-')) {
  const isCommand = ['check', 'status', 'doctor', 'link-skill', 'setup', 'init', 'auth', 'gcp-enable', 'vertex-provision', 'vx', 'vertex', 'metagpt', 'mg', 'run', 'dispatch', 'serve', 'proxy', 'route', 'kernel', 'kernel-version', 'help'].includes(process.argv[2]);
  if (!isCommand) {
    console.error(`\\n❌ Error: Unknown command '${process.argv[2]}'.`);
    console.error(`Run 'dt --help' to see available commands.\\n`);
    process.exit(1);
  }
}

program.parse(process.argv);
