import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { WORKSPACE_ROOT } from '../config/index.js';

export function runIntegrations(): void {
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
