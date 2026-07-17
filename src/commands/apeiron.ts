import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { WORKSPACE_ROOT } from '../config/index.js';

export function resolveAutopilotScript(): string {
  const localPath = join(WORKSPACE_ROOT, 'bin', 'autopilot.sh');
  if (existsSync(localPath)) {
    return localPath;
  }
  return join(homedir(), '.mavis', 'bin', 'autopilot.sh'); // fallback
}

export function runApeiron(prompt: string, options: any = {}): Promise<number> {
  const scriptPath = resolveAutopilotScript();
  const args = [prompt];

  if (options.background) {
    args.push('--background');
  }
  if (options.backend) {
    args.push(`--backend=${options.backend}`);
  }
  if (options.dryRun) {
    args.push('--dry-run');
  }

  console.log(`\n🌀 Running Apeiron universal orchestrator autopilot...`);
  console.log(`📋 Prompt: "${prompt}"\n`);

  return new Promise((resolve) => {
    const child = spawn('bash', [scriptPath, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DELEGATE_TEAM_ROOT: WORKSPACE_ROOT,
        ORCHESTRATE_OVERRIDE: join(WORKSPACE_ROOT, 'orchestrator', 'scripts', 'orchestrate.sh')
      }
    });

    child.on('error', (err) => {
      console.error(`\n❌ Failed to launch Apeiron: ${err.message}`);
      resolve(1);
    });

    child.on('close', (code) => {
      resolve(code || 0);
    });
  });
}
