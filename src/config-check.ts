#!/usr/bin/env node

import { readUserConfig } from './config/user-config.js';
import { ExitCode } from './utils/exit-codes.js';

const json = process.argv.includes('--json');
const result = readUserConfig();

if (json) {
  console.log(JSON.stringify({
    ok: result.state === 'valid',
    state: result.state,
    path: result.path,
    issues: result.issues,
  }, null, 2));
} else if (result.state === 'valid') {
  console.log(`dt config is valid: ${result.path}`);
} else if (result.state === 'missing') {
  console.error(`dt config not found: ${result.path}. Run \`dt setup\` to create it.`);
} else {
  console.error(result.error);
}

if (result.state !== 'valid') {
  process.exitCode = ExitCode.CONFIG;
}
