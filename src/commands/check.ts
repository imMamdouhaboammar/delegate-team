import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { C, runCmd } from '../utils/index.js';
import { spawnSync } from 'node:child_process';
import { VERTEX_VENV_PYTHON } from '../config/index.js';

export function runCheck(strict: boolean = false) {
  console.log(`\n${C.bold}${C.cyan}🔍 Scanning Backend Systems Health & Authentication Status...${C.reset}\n`);

  const results = [];

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
    binary: vertexPythonCheck ? `Python venv ✅` : `venv Missing ❌`,
    auth: gcloudCheck.status === 0 ? `GCP Active: ${gcloudAccount.stdout.trim()}` : `gcloud NOT Logged In ❌`,
    status: isVertexReady ? `${C.green}READY ✅${C.reset}` : `${C.red}NOT READY ❌${C.reset}`
  });

  // 2. Codex Check
  const codexBin = runCmd("which", ["codex"]);
  const codexConfig = existsSync(join(homedir(), ".codex-delegate", "config.toml"));
  results.push({
    backend: "codex",
    binary: codexBin.status === 0 ? `Installed ✅` : `Missing ❌`,
    auth: codexConfig ? `config.toml Present ✅` : `~/.codex-delegate/config.toml Missing ❌`,
    status: (codexBin.status === 0 && codexConfig) ? `${C.green}READY ✅${C.reset}` : `${C.yellow}UNCONFIGURED ⚠️${C.reset}`
  });

  // 3. MiniMax Check
  const minimaxBin = runCmd("which", ["claude"]);
  const minimaxConfig = existsSync(join(homedir(), ".minimax", ".env"));
  results.push({
    backend: "minimax",
    binary: minimaxBin.status === 0 ? `Installed (claude) ✅` : `Missing ❌`,
    auth: minimaxConfig ? `.env Present ✅` : `~/.minimax/.env Missing ❌`,
    status: (minimaxBin.status === 0 && minimaxConfig) ? `${C.green}READY ✅${C.reset}` : `${C.yellow}UNCONFIGURED ⚠️${C.reset}`
  });

  // 4. OpenCode Check
  const opencodeBin = runCmd("which", ["opencode"]);
  const opencodeConfig = existsSync(join(homedir(), ".local", "share", "opencode", "auth.json"));
  results.push({
    backend: "opencode",
    binary: opencodeBin.status === 0 ? `Installed ✅` : `Missing ❌`,
    auth: opencodeConfig ? `auth.json Present ✅` : `auth.json Missing ❌`,
    status: (opencodeBin.status === 0 && opencodeConfig) ? `${C.green}READY ✅${C.reset}` : `${C.yellow}UNCONFIGURED ⚠️${C.reset}`
  });

  // 5. Gemini Check
  const geminiBin = runCmd("which", ["gemini"]);
  const geminiConfig = existsSync(join(homedir(), ".gemini", ".env"));
  results.push({
    backend: "gemini",
    binary: geminiBin.status === 0 ? `Installed ✅` : `Missing ❌`,
    auth: geminiConfig ? `.env Present ✅` : `~/.gemini/.env Missing ❌`,
    status: (geminiBin.status === 0 && geminiConfig) ? `${C.green}READY ✅${C.reset}` : `${C.yellow}UNCONFIGURED ⚠️${C.reset}`
  });

  // 6. OpenRouter Check
  results.push({
    backend: "openrouter",
    binary: opencodeBin.status === 0 ? `Installed (opencode) ✅` : `Missing ❌`,
    auth: existsSync(join(homedir(), ".openrouter", ".env")) ? `.env Present ✅` : `~/.openrouter/.env Missing ❌`,
    status: (opencodeBin.status === 0 && existsSync(join(homedir(), ".openrouter", ".env"))) ? `${C.green}READY ✅${C.reset}` : `${C.yellow}UNCONFIGURED ⚠️${C.reset}`
  });

  // Display beautiful formatted table
  console.log(`${C.bold}${"Backend".padEnd(15)} | ${"Binary / SDK".padEnd(23)} | ${"Config / Credentials".padEnd(45)} | Status${C.reset}`);
  console.log("-".repeat(95));
  for (const row of results) {
    console.log(`${C.bold}${C.cyan}${row.backend.padEnd(15)}${C.reset} | ${row.binary.padEnd(23)} | ${row.auth.padEnd(45)} | ${row.status}`);
  }
  console.log("\n");

  if (strict) {
    const anyReady = results.some(r => r.status.includes('READY ✅'));
    if (!anyReady) {
      process.exit(1);
    }
  }
}
