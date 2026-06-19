import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// In ESM, when bundled to dist/cli.js, __dirname will be dist/
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const WORKSPACE_ROOT = resolve(__dirname, ".."); 

export const DELEGATE_TEAM_PATH = join(WORKSPACE_ROOT, "delegate-team");
export const VERTEX_CODER_PATH = join(WORKSPACE_ROOT, "vertex-coder");

export const RELAY_SCRIPT = join(DELEGATE_TEAM_PATH, "scripts", "relay.mjs");
export const ROUTER_SCRIPT = join(DELEGATE_TEAM_PATH, "scripts", "opencode-router.mjs");

export const VERTEX_VENV_PYTHON = join(VERTEX_CODER_PATH, ".venv", "bin", "python3");
export const VERTEX_DIRECT_SCRIPT = join(VERTEX_CODER_PATH, "vertex_direct_coder.py");
export const VERTEX_INTERACTIVE_SCRIPT = join(VERTEX_CODER_PATH, "vertex_interactive_agent.py");
