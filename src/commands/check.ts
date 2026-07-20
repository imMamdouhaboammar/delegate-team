import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { C, runCmd } from '../utils/index.js';
import { ExitCode } from '../utils/exit-codes.js';
import { spawnSync } from 'node:child_process';
import { VERTEX_VENV_PYTHON } from '../config/index.js';

type BackendHealth = {
  backend: string;
  adapter?: string;
  ready: boolean;
  state: 'ready' | 'unconfigured' | 'not_ready';
  binary: {
    ok: boolean;
    label: string;
    path?: string;
  };
  auth: {
    ok: boolean;
    label: string;
    path?: string;
  };
  sdk?: {
    ok: boolean;
    label: string;
  };
};

function statusLabel(row: BackendHealth): string {
  if (row.ready) return `${C.green}READY ✅${C.reset}`;
  if (row.state === 'unconfigured') return `${C.yellow}UNCONFIGURED ⚠️${C.reset}`;
  return `${C.red}NOT READY ❌${C.reset}`;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function toJsonRows(results: BackendHealth[]) {
  return results.map(row => ({
    backend: row.backend,
    adapter: row.adapter || null,
    ready: row.ready,
    state: row.state,
    binary: row.binary,
    auth: row.auth,
    sdk: row.sdk || null
  }));
}

export function collectHealth(): BackendHealth[] {
  const results: BackendHealth[] = [];

  // 1. VertexCoder Check
  const gcloudCheck = runCmd("gcloud", ["auth", "print-access-token"]);
  const gcloudAccount = runCmd("gcloud", ["config", "get-value", "account"]);
  const vertexPythonCheck = existsSync(VERTEX_VENV_PYTHON);
  let vertexSdkCheck = false;
  if (vertexPythonCheck) {
    const pyRes = spawnSync(VERTEX_VENV_PYTHON, ["-c", "import google.genai"], { encoding: "utf8" });
    vertexSdkCheck = pyRes.status === 0;
  }

  const isVertexReady = gcloudCheck.status === 0 && vertexPythonCheck && vertexSdkCheck;
  results.push({
    backend: "vertexcoder",
    adapter: "gcloud + python venv",
    ready: isVertexReady,
    state: isVertexReady ? 'ready' : 'not_ready',
    binary: {
      ok: vertexPythonCheck,
      label: vertexPythonCheck ? "Python venv present" : "Python venv missing",
      path: VERTEX_VENV_PYTHON
    },
    auth: {
      ok: gcloudCheck.status === 0,
      label: gcloudCheck.status === 0 ? `GCP active: ${gcloudAccount.stdout.trim()}` : "gcloud not logged in"
    },
    sdk: {
      ok: vertexSdkCheck,
      label: vertexSdkCheck ? "google.genai import ok" : "google.genai import failed or unavailable"
    }
  });

  // 2. Codex Check
  const codexBin = runCmd("which", ["codex"]);
  const codexConfigPath = join(homedir(), ".codex-delegate", "config.toml");
  const codexConfig = existsSync(codexConfigPath);
  results.push({
    backend: "codex",
    adapter: "codex cli",
    ready: codexBin.status === 0 && codexConfig,
    state: (codexBin.status === 0 && codexConfig) ? 'ready' : 'unconfigured',
    binary: {
      ok: codexBin.status === 0,
      label: codexBin.status === 0 ? "codex installed" : "codex missing",
      path: codexBin.stdout.trim() || undefined
    },
    auth: {
      ok: codexConfig,
      label: codexConfig ? "config.toml present" : "config.toml missing",
      path: codexConfigPath
    }
  });

  // 3. MiniMax Check
  const minimaxBin = runCmd("which", ["claude"]);
  const minimaxConfigPath = join(homedir(), ".minimax", ".env");
  const minimaxConfig = existsSync(minimaxConfigPath);
  results.push({
    backend: "minimax",
    adapter: "claude cli adapter",
    ready: minimaxBin.status === 0 && minimaxConfig,
    state: (minimaxBin.status === 0 && minimaxConfig) ? 'ready' : 'unconfigured',
    binary: {
      ok: minimaxBin.status === 0,
      label: minimaxBin.status === 0 ? "claude cli installed" : "claude cli missing",
      path: minimaxBin.stdout.trim() || undefined
    },
    auth: {
      ok: minimaxConfig,
      label: minimaxConfig ? ".env present" : ".env missing",
      path: minimaxConfigPath
    }
  });

  // 4. OpenCode Check
  const opencodeBin = runCmd("which", ["opencode"]);
  const opencodeConfigPath = join(homedir(), ".local", "share", "opencode", "auth.json");
  const opencodeConfig = existsSync(opencodeConfigPath);
  results.push({
    backend: "opencode",
    adapter: "opencode cli",
    ready: opencodeBin.status === 0 && opencodeConfig,
    state: (opencodeBin.status === 0 && opencodeConfig) ? 'ready' : 'unconfigured',
    binary: {
      ok: opencodeBin.status === 0,
      label: opencodeBin.status === 0 ? "opencode installed" : "opencode missing",
      path: opencodeBin.stdout.trim() || undefined
    },
    auth: {
      ok: opencodeConfig,
      label: opencodeConfig ? "auth.json present" : "auth.json missing",
      path: opencodeConfigPath
    }
  });

  // 5. Gemini Check
  const geminiBin = runCmd("which", ["gemini"]);
  const geminiConfigPath = join(homedir(), ".gemini", ".env");
  const geminiConfig = existsSync(geminiConfigPath);
  results.push({
    backend: "gemini",
    adapter: "gemini cli",
    ready: geminiBin.status === 0 && geminiConfig,
    state: (geminiBin.status === 0 && geminiConfig) ? 'ready' : 'unconfigured',
    binary: {
      ok: geminiBin.status === 0,
      label: geminiBin.status === 0 ? "gemini installed" : "gemini missing",
      path: geminiBin.stdout.trim() || undefined
    },
    auth: {
      ok: geminiConfig,
      label: geminiConfig ? ".env present" : ".env missing",
      path: geminiConfigPath
    }
  });

  // 6. OpenRouter Check
  const openrouterConfigPath = join(homedir(), ".openrouter", ".env");
  const openrouterConfig = existsSync(openrouterConfigPath);
  results.push({
    backend: "openrouter",
    adapter: "opencode cli adapter",
    ready: opencodeBin.status === 0 && openrouterConfig,
    state: (opencodeBin.status === 0 && openrouterConfig) ? 'ready' : 'unconfigured',
    binary: {
      ok: opencodeBin.status === 0,
      label: opencodeBin.status === 0 ? "opencode installed" : "opencode missing",
      path: opencodeBin.stdout.trim() || undefined
    },
    auth: {
      ok: openrouterConfig,
      label: openrouterConfig ? ".env present" : ".env missing",
      path: openrouterConfigPath
    }
  });

  return results;
}

export function runCheck(strict: boolean = false, json: boolean = false) {
  const results = collectHealth();

  if (json) {
    const payload = {
      ok: results.some(r => r.ready),
      strict,
      generated_at: new Date().toISOString(),
      backends: toJsonRows(results)
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`\n${C.bold}${C.cyan}🔍 Scanning Backend Systems Health & Authentication Status...${C.reset}\n`);
    console.log(`${C.bold}${"Backend".padEnd(15)} | ${"Adapter".padEnd(20)} | ${"Binary / SDK".padEnd(30)} | ${"Config / Credentials".padEnd(45)} | Status${C.reset}`);
    console.log("-".repeat(125));
    for (const row of results) {
      const binary = stripAnsi(row.sdk ? `${row.binary.label}; ${row.sdk.label}` : row.binary.label);
      console.log(`${C.bold}${C.cyan}${row.backend.padEnd(15)}${C.reset} | ${(row.adapter || '').padEnd(20)} | ${binary.padEnd(30)} | ${row.auth.label.padEnd(45)} | ${statusLabel(row)}`);
    }
    console.log("\n");
  }

  if (strict && !results.some(r => r.ready)) {
    process.exit(ExitCode.FAILURE);
  }
}
