import { copyFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
copyFileSync(join(root, 'src', 'cli.mjs'), join(root, 'dist', 'cli.mjs'));
chmodSync(join(root, 'dist', 'cli.mjs'), 0o755);
console.log('Built dist/cli.mjs');
