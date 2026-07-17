import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { WORKSPACE_ROOT } from '../config/index.js';

export function resolveMMASScript(): string {
  const localPath = join(WORKSPACE_ROOT, 'mmas', 'spawn-team.py');
  if (existsSync(localPath)) {
    return localPath;
  }
  return join(homedir(), '.apeiron', 'agents', 'apeiron', 'multi-agent', 'spawn-team.py');
}

export function runMMAS(prompt: string, options: any = {}): Promise<number> {
  const scriptPath = resolveMMASScript();
  const args = ['spawn', prompt];

  if (options.team) {
    args.push('--team', options.team);
  } else {
    args.push('--atlas'); // default to Atlas picking the team
  }

  if (options.planOnly) {
    args.push('--plan-only');
  }
  if (options.noWrite) {
    args.push('--no-write');
  }
  if (options.writeMode) {
    args.push('--write-mode', options.writeMode);
  }
  if (options.timeout) {
    args.push('--timeout', options.timeout.toString());
  }

  console.log(`\n👥 Spawning MMAS Multi-Agent Team...`);
  console.log(`📋 Prompt: "${prompt}"\n`);

  return new Promise((resolve) => {
    const child = spawn('python3', [scriptPath, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DELEGATE_TEAM_ROOT: WORKSPACE_ROOT,
      }
    });

    child.on('error', (err) => {
      console.error(`\n❌ Failed to launch MMAS: ${err.message}`);
      resolve(1);
    });

    child.on('close', (code) => {
      resolve(code || 0);
    });
  });
}
