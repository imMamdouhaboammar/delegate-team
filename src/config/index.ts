import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function hasDelegateTeamPackageJson(dir: string): boolean {
  const packagePath = join(dir, 'package.json');
  if (!existsSync(packagePath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    return pkg.name === 'delegate-team';
  } catch {
    return false;
  }
}

function findWorkspaceRoot(startDir: string): string {
  const override = process.env.DT_RUNTIME_ROOT;
  if (override) {
    const resolvedOverride = resolve(override);
    if (hasDelegateTeamPackageJson(resolvedOverride)) return resolvedOverride;
    console.warn(`[dt] Ignoring DT_RUNTIME_ROOT because no delegate-team package.json was found: ${resolvedOverride}`);
  }

  let current = resolve(startDir);
  const root = parse(current).root;

  while (true) {
    if (hasDelegateTeamPackageJson(current)) return current;
    if (current === root) break;
    current = dirname(current);
  }

  // Fallback for the bundled npm layout: dist/config/index.js -> package root.
  return resolve(startDir, '..', '..');
}

export const WORKSPACE_ROOT = findWorkspaceRoot(__dirname);

export const DELEGATE_TEAM_PATH = join(WORKSPACE_ROOT, "delegate-team");
export const VERTEX_CODER_PATH = join(WORKSPACE_ROOT, "vertex-coder");

export const RELAY_SCRIPT = join(DELEGATE_TEAM_PATH, "scripts", "relay.mjs");
export const ROUTER_SCRIPT = join(DELEGATE_TEAM_PATH, "scripts", "opencode-router.mjs");

export const VERTEX_VENV_PYTHON = join(VERTEX_CODER_PATH, ".venv", "bin", "python3");
export const VERTEX_DIRECT_SCRIPT = join(VERTEX_CODER_PATH, "vertex_direct_coder.py");
export const VERTEX_INTERACTIVE_SCRIPT = join(VERTEX_CODER_PATH, "vertex_interactive_agent.py");
