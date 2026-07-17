import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { WORKSPACE_ROOT } from '../config/index.js';

export type IntegrationsOptions = {
  auto?: boolean;
  dryRun?: boolean;
  path?: string;
};

export function runIntegrations(options: IntegrationsOptions = {}): void {
  if (options.auto) {
    const catalogPath = join(WORKSPACE_ROOT, 'orchestrator', 'scripts', 'catalog.py');
    const args = ['auto-install'];
    if (options.path) {
      args.push(options.path);
    }
    if (options.dryRun) {
      args.push('--dry-run');
    }
    
    console.log('🔄 Autodetecting project traits and recommending useful companion integrations...');
    const child = spawn('python3', [catalogPath, ...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    
    child.on('error', (err) => {
      console.error(`❌ Failed to run integrations auto-discovery: ${err.message}`);
      process.exitCode = 1;
    });
    
    child.on('close', (code) => {
      if (code && code !== 0) {
        process.exitCode = code;
      }
    });
    return;
  }

  console.log('🔄 Checking, installing, and updating companion integrations (Waza, unslop-preflight, superpowers, autoresearch)...');
  const scriptPath = join(WORKSPACE_ROOT, 'bin', 'integrations.sh');
  const child = spawn('bash', [scriptPath], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('error', (err) => {
    console.error(`❌ Failed to run integrations manager: ${err.message}`);
    process.exitCode = 1;
  });

  child.on('close', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    } else {
      console.log('✓ Companion integrations verified!');
    }
  });
}
