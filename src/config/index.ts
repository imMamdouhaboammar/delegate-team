import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRuntimePaths,
  resolveRuntimeRoot,
} from './runtime-paths.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);
const runtimePaths = createRuntimePaths(
  resolveRuntimeRoot({ startDir: currentDirectory }),
);

export const WORKSPACE_ROOT = runtimePaths.workspaceRoot;
export const DELEGATE_TEAM_PATH = runtimePaths.delegateTeamPath;
export const VERTEX_CODER_PATH = runtimePaths.vertexCoderPath;
export const RELAY_SCRIPT = runtimePaths.relayScript;
export const ROUTER_SCRIPT = runtimePaths.routerScript;
export const VERTEX_VENV_PYTHON = runtimePaths.vertexVenvPython;
export const VERTEX_DIRECT_SCRIPT = runtimePaths.vertexDirectScript;
export const VERTEX_INTERACTIVE_SCRIPT = runtimePaths.vertexInteractiveScript;
