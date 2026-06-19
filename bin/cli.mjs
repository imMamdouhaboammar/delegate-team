#!/usr/bin/env node
/**
 * dt / delegate-team — Unified Multi-Backend Developer Agent Dispatch & CLI suite
 * 
 * Zero-dependency, pure Node.js CLI tool.
 */

import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import readline from "node:readline";


// ─── Path Resolutions ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE_ROOT = resolve(__dirname, "..");

const DELEGATE_TEAM_PATH = join(WORKSPACE_ROOT, "delegate-team");
const VERTEX_CODER_PATH = join(WORKSPACE_ROOT, "vertex-coder");

const RELAY_SCRIPT = join(DELEGATE_TEAM_PATH, "scripts", "relay.mjs");
const ROUTER_SCRIPT = join(DELEGATE_TEAM_PATH, "scripts", "opencode-router.mjs");

const VERTEX_VENV_PYTHON = join(VERTEX_CODER_PATH, ".venv", "bin", "python3");
const VERTEX_DIRECT_SCRIPT = join(VERTEX_CODER_PATH, "vertex_direct_coder.py");
const VERTEX_INTERACTIVE_SCRIPT = join(VERTEX_CODER_PATH, "vertex_interactive_agent.py");

// ─── ANSI Colors for Premium CLI ─────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m"
};

// ─── Fallback Rings (Rule 4 from SKILL.md) ────────────────────────────────────
const FALLBACK_RING = {
  codex: ["minimax", "opencode", "vertexcoder", "gemini"],
  minimax: ["codex", "opencode", "vertexcoder", "gemini"],
  opencode: ["codex", "minimax", "vertexcoder", "gemini"],
  vertexcoder: ["codex", "minimax", "opencode", "gemini"],
  gemini: ["vertexcoder", "codex", "minimax", "opencode"],
  openrouter: ["vertexcoder", "codex", "minimax", "opencode"]
};

// ─── Main Program Entry ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const command = argv[0];

if (!command || ["help", "-h", "--help"].includes(command)) {
  showHelp();
  process.exit(0);
}

switch (command) {
  case "check":
  case "status":
    runCheck();
    break;
  case "link-skill":
    runLinkSkill();
    break;
  case "vx":
  case "vertex":
    runVertex(argv.slice(1));
    break;
  case "run":
  case "dispatch":
    runDispatch(argv.slice(1));
    break;
  case "setup":
  case "init":
    runSetup().catch(err => {
      console.error("\n❌ Setup failed:", err);
      process.exit(1);
    });
    break;
  case "serve":
  case "proxy":
    runServe(argv.slice(1));
    break;
  default:
    // If command doesn't match, assume user typed a raw prompt directly to run
    runDispatch(argv);
    break;

}

// ─── Subcommands ─────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
${C.bold}${C.cyan}╔╦╗╔═╗╦  ╔═╗╔═╗╔═╗╔╦╗╔═╗  ╔╦╗╔═╗╔═╗╔╦╗
 ║║║╣ ║  ║╣ ║ ╦╠═╣ ║ ║╣    ║ ║╣ ╠═╣║║║
═╩╝╚═╝╩═╝╚═╝╚═╝╩ ╩ ╩ ╚═╝   ╩ ╚═╝╩ ╩╩ ╩${C.reset}
  ${C.dim}Unified Developer Agent Dispatch Suite & CLI · v1.0.0${C.reset}

${C.bold}USAGE:${C.reset}
  ${C.green}dt${C.reset} <command> [arguments]

${C.bold}COMMANDS:${C.reset}
  ${C.bold}${C.green}dt setup${C.reset} / ${C.bold}${C.green}init${C.reset}           Run autopilot setup to automatically configure dependencies, auth, GCP & agents.
  ${C.bold}${C.green}dt check${C.reset} / ${C.bold}${C.green}status${C.reset}         Scan health, configs, and credential status of all 6 backends.
  ${C.bold}${C.green}dt link-skill${C.reset}            Automate integration by symlinking tools to local Claude/Gemini folders.
  ${C.bold}${C.green}dt vx${C.reset} [direct|interactive]   Direct high-performance interface for Google Vertex AI coding agent.
  ${C.bold}${C.green}dt run${C.reset} [options] ["prompt"]  Dispatch a task to a backend agent with automatic routing & failover.
  ${C.bold}${C.green}dt serve${C.reset} [port]              Start the LLM Gateway Proxy Server.

${C.bold}EXAMPLES:${C.reset}
  ${C.dim}# Run autopilot setup for zero-friction onboarding:${C.reset}
  ${C.cyan}dt setup${C.reset}

  ${C.dim}# Check which backends are active and ready:${C.reset}
  ${C.cyan}dt check${C.reset}

  ${C.dim}# Auto-link delegate-team & vertex-coder as global agent skills:${C.reset}
  ${C.cyan}dt link-skill${C.reset}

  ${C.dim}# Run a single-file edit quickly via Vertex Coder:${C.reset}
  ${C.cyan}dt vx direct index.html "Update the hero title to a premium dark gradient design"${C.reset}

  ${C.dim}# Run a multi-step task with automated fallback (routes first via Opencode Router):${C.reset}
  ${C.cyan}dt run "Create a pytest suite in test_math.py checking basic arithmetic operations"${C.reset}

  ${C.dim}# Run a task on a specific backend:${C.reset}
  ${C.cyan}dt run --backend vertexcoder "Refactor user authentication schema"${C.reset}

  ${C.dim}# Start the local LLM Gateway Proxy on port 8080 (highly optimized for Cursor/IDE integration):${C.reset}
  ${C.cyan}dt serve 8080${C.reset}
`);
}

/**
 * dt check / status
 */
function runCheck() {
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
  console.log(`${C.bold}${"Backend".padEnd(15)} | ${"Binary / SDK SDK".padEnd(23)} | ${"Config / Credentials".padEnd(45)} | Status${C.reset}`);
  console.log("-".repeat(95));
  for (const row of results) {
    console.log(`${C.bold}${C.cyan}${row.backend.padEnd(15)}${C.reset} | ${row.binary.padEnd(23)} | ${row.auth.padEnd(45)} | ${row.status}`);
  }
  console.log("\n");
}

/**
 * dt link-skill
 */
function runLinkSkill() {
  console.log(`\n${C.bold}${C.cyan}🔗 Symlinking Agent Skills to Local Systems...${C.reset}`);

  const agentSkillsDir = join(homedir(), ".agents", "skills");
  const geminiSkillsDir = join(homedir(), ".gemini", "config", "skills");

  const skillDirs = [agentSkillsDir, geminiSkillsDir];

  // Set file executables
  runCmd("chmod", ["+x", RELAY_SCRIPT]);
  runCmd("chmod", ["+x", VERTEX_DIRECT_SCRIPT]);
  runCmd("chmod", ["+x", VERTEX_INTERACTIVE_SCRIPT]);
  runCmd("chmod", ["+x", join(DELEGATE_TEAM_PATH, "scripts", "opencode-router.mjs")]);

  let linkedCount = 0;

  for (const dir of skillDirs) {
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
        console.log(`${C.dim}Created skills directory: ${dir}${C.reset}`);
      } catch (err) {
        console.error(`${C.red}Failed to create skills directory ${dir}: ${err.message}${C.reset}`);
        continue;
      }
    }

    const delTarget = join(dir, "delegate-team");
    const vtxTarget = join(dir, "vertex-coder");

    // Symlink delegate-team
    try {
      if (existsSync(delTarget)) rmSync(delTarget, { recursive: true, force: true });
      symlinkSync(DELEGATE_TEAM_PATH, delTarget, "dir");
      console.log(`  ${C.green}✅ Linked delegate-team${C.reset} -> ${C.dim}${dir}/delegate-team${C.reset}`);
      linkedCount++;
    } catch (err) {
      console.error(`  ${C.red}❌ Failed link delegate-team to ${dir}: ${err.message}${C.reset}`);
    }

    // Symlink vertex-coder
    try {
      if (existsSync(vtxTarget)) rmSync(vtxTarget, { recursive: true, force: true });
      symlinkSync(VERTEX_CODER_PATH, vtxTarget, "dir");
      console.log(`  ${C.green}✅ Linked vertex-coder${C.reset}  -> ${C.dim}${dir}/vertex-coder${C.reset}`);
      linkedCount++;
    } catch (err) {
      console.error(`  ${C.red}❌ Failed link vertex-coder to ${dir}: ${err.message}${C.reset}`);
    }
  }

  if (linkedCount > 0) {
    console.log(`\n${C.bold}${C.green}🎉 Skill registration completed successfully! (${linkedCount} symlinks updated)${C.reset}\n`);
  } else {
    console.error(`\n${C.bold}${C.red}⚠️  Skill registration completed with errors.${C.reset}\n`);
  }
}

/**
 * dt vx [direct|interactive] [args]
 */
function runVertex(args) {
  const mode = args[0];
  const rest = args.slice(1);

  if (!existsSync(VERTEX_VENV_PYTHON)) {
    console.error(`${C.bold}${C.red}Error: Python virtual environment (.venv) not found at: ${VERTEX_VENV_PYTHON}${C.reset}`);
    console.error(`${C.dim}Please verify your vertex-coder setup or re-run 'dt check' to inspect.${C.reset}`);
    process.exit(127);
  }

  if (mode === "direct") {
    if (rest.length < 2) {
      console.error(`${C.bold}${C.red}Usage: dt vx direct <file_path> "<prompt>" [model]${C.reset}`);
      process.exit(2);
    }
    const proc = spawnSync(VERTEX_VENV_PYTHON, [VERTEX_DIRECT_SCRIPT, ...rest], { stdio: "inherit" });
    process.exit(proc.status);
  } else if (mode === "interactive") {
    if (rest.length < 1) {
      console.error(`${C.bold}${C.red}Usage: dt vx interactive "<complex_prompt>" [model]${C.reset}`);
      process.exit(2);
    }
    const proc = spawnSync(VERTEX_VENV_PYTHON, [VERTEX_INTERACTIVE_SCRIPT, ...rest], { stdio: "inherit" });
    process.exit(proc.status);
  } else {
    console.error(`${C.bold}${C.red}Error: Unknown mode "${mode}". Supported: direct, interactive${C.reset}`);
    console.error(`  ${C.dim}Example: dt vx direct index.html "Add background transition"`);
    console.error(`  ${C.dim}Example: dt vx interactive "Setup vitest suite"`);
    process.exit(2);
  }
}

/**
 * dt run [options] ["prompt"]
 */
function runDispatch(args) {
  let backend = null;
  let briefFile = null;
  let rawPrompt = null;
  const forwardArgs = [];

  // Parse options manually
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--backend" && args[i + 1]) {
      backend = args[i + 1];
      forwardArgs.push("--backend", args[i + 1]);
      i++;
    } else if (arg === "--brief" && args[i + 1]) {
      briefFile = args[i + 1];
      forwardArgs.push("--brief", args[i + 1]);
      i++;
    } else if (arg.startsWith("-")) {
      forwardArgs.push(arg);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        forwardArgs.push(args[i + 1]);
        i++;
      }
    } else {
      rawPrompt = arg;
    }
  }

  // 1. Generate brief if direct prompt is given
  let isTempBrief = false;
  if (rawPrompt && !briefFile) {
    const tempBriefDir = join(tmpdir(), "dt-briefs");
    if (!existsSync(tempBriefDir)) mkdirSync(tempBriefDir, { recursive: true });
    
    briefFile = join(tempBriefDir, `brief-${Date.now()}.txt`);
    const briefContent = `TASK CLI_TASK: ${rawPrompt}
NAV: use the code graph
CHANGE:
${rawPrompt}
`;
    writeFileSync(briefFile, briefContent, "utf8");
    forwardArgs.push("--brief", briefFile);
    isTempBrief = true;
    console.log(`${C.dim}Generated temporary brief file: ${briefFile}${C.reset}`);
  }

  if (!briefFile) {
    console.error(`${C.bold}${C.red}Error: Please specify either a prompt or a brief file using --brief <file_path>${C.reset}`);
    process.exit(2);
  }

  const briefText = readFileSync(briefFile, "utf8");

  // 2. Resolve default backend via Router if not specified
  if (!backend) {
    console.log(`${C.dim}Running OpenCode Router to evaluate task complexity...${C.reset}`);
    try {
      const routerProc = spawnSync(process.execPath, [ROUTER_SCRIPT, "route"], {
        input: briefText,
        encoding: "utf8",
        timeout: 5000
      });
      if (routerProc.status === 0) {
        const routeData = JSON.parse(routerProc.stdout.trim());
        console.log(`${C.bold}${C.cyan}Router Complexity Score: ${routeData.score}${C.reset}`);
        // Choose best backend based on score
        if (routeData.score > 5) {
          backend = "vertexcoder";
          console.log(`  🎯 Routing to: ${C.bold}${C.green}vertexcoder${C.reset} (Premium Gemini AI via GCP SDK)`);
        } else if (routeData.score > 0) {
          backend = "opencode";
          console.log(`  🎯 Routing to: ${C.bold}${C.green}opencode${C.reset} (Balanced OpenCode Router)`);
        } else {
          backend = "minimax";
          console.log(`  🎯 Routing to: ${C.bold}${C.green}minimax${C.reset} (Fast MiniMax Agent)`);
        }
      }
    } catch {
      // Fallback default
      backend = "vertexcoder";
      console.log(`Router evaluation failed, defaulting to: ${C.bold}${C.green}vertexcoder${C.reset}`);
    }
    
    // Inject selected backend into forward arguments
    forwardArgs.push("--backend", backend);
  }

  // 3. Dispatch & Automatic Fallback Ring
  let activeBackend = backend;
  let currentChain = [activeBackend, ...(FALLBACK_RING[activeBackend] || [])];
  let success = false;

  for (let attempt = 0; attempt < currentChain.length; attempt++) {
    activeBackend = currentChain[attempt];
    console.log(`\n${C.bold}${C.magenta}🚀 Dispatching task to backend: [${activeBackend.toUpperCase()}] (Attempt ${attempt + 1}/${currentChain.length})${C.reset}`);
    console.log(`${C.dim}relay.mjs ${forwardArgs.filter(a => a !== "--backend" && a !== activeBackend).join(" ")} --backend ${activeBackend}${C.reset}\n`);

    // Override the backend flag in argv
    const runArgs = [...forwardArgs];
    const bIndex = runArgs.indexOf("--backend");
    if (bIndex !== -1) {
      runArgs[bIndex + 1] = activeBackend;
    }

    const start = Date.now();
    const proc = spawnSync(process.execPath, [RELAY_SCRIPT, ...runArgs], { stdio: "inherit" });
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);

    if (proc.status === 0) {
      // Success!
      console.log(`\n${C.bold}${C.green}✅ Task completed successfully by [${activeBackend.toUpperCase()}] in ${durationSec}s!${C.reset}\n`);
      success = true;
      break;
    } else {
      // Failure
      console.log(`\n${C.bold}${C.yellow}⚠️  Backend [${activeBackend.toUpperCase()}] failed or exited with status code ${proc.status || "N/A"} after ${durationSec}s.${C.reset}`);
      
      const nextBackend = currentChain[attempt + 1];
      if (nextBackend) {
        console.log(`${C.bold}${C.yellow}🔄 Activating Automated Failover Ring → Routing to next backup: [${nextBackend.toUpperCase()}]${C.reset}`);
      }
    }
  }

  // Cleanup temp brief if created
  if (isTempBrief && existsSync(briefFile)) {
    try { unlinkSync(briefFile); } catch {}
  }

  if (!success) {
    console.error(`\n${C.bold}${C.red}❌ Failover Ring Exhausted! All available backends have failed to execute this task.${C.reset}`);
    console.error(`  ${C.bold}${C.yellow}Orchestrator Directive: Please finish the task manually using SELF.${C.reset}\n`);
    process.exit(1);
  }
}

/**
 * dt serve [port]
 */
function runServe(args) {
  const port = args[0] || 3000;
  const proxyScript = join(__dirname, "proxy.mjs");
  if (!existsSync(proxyScript)) {
    console.error(`${C.bold}${C.red}Error: proxy.mjs not found at ${proxyScript}${C.reset}`);
    process.exit(1);
  }
  console.log(`\n${C.bold}${C.cyan}🚀 Starting LLM Gateway Proxy Server on port ${port}...${C.reset}\n`);
  const proc = spawnSync(process.execPath, [proxyScript, port], { stdio: "inherit" });
  process.exit(proc.status);
}

/**
 * dt setup / dt init (Autopilot Setup)
 */
async function runSetup() {
  console.log(`\n${C.bold}${C.cyan}🚀 Initiating Autopilot Onboarding Setup Wizard...${C.reset}`);
  console.log(`${C.dim}This wizard will configure your local environment, authentications, and cloud projects automatically.${C.reset}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (query) => new Promise(resolve => rl.question(query, resolve));

  // --- STEP 1: Local Virtual Environment Setup ---
  console.log(`${C.bold}📦 [Step 1/6] Setting up Python Virtual Environment...${C.reset}`);
  const venvDir = join(VERTEX_CODER_PATH, ".venv");
  if (!existsSync(venvDir)) {
    console.log(`  ${C.dim}Virtual environment (.venv) not found. Creating a new one...${C.reset}`);
    const venvProc = spawnSync("python3", ["-m", "venv", venvDir], { stdio: "inherit" });
    if (venvProc.status !== 0) {
      console.error(`  ${C.red}❌ Failed to create virtual environment. Please install python3-venv.${C.reset}`);
      rl.close();
      process.exit(1);
    }
    console.log(`  ${C.green}✅ Virtual environment created at: ${venvDir}${C.reset}`);
  } else {
    console.log(`  ${C.green}✅ Existing virtual environment detected.${C.reset}`);
  }

  console.log(`  ${C.dim}Installing required Python dependencies...${C.reset}`);
  const pipPath = join(venvDir, "bin", "pip");
  const pipProc = spawnSync(pipPath, ["install", "--upgrade", "pip", "google-genai", "google-cloud-dialogflow-cx", "google-oauth2", "pytest"], { stdio: "inherit" });
  if (pipProc.status !== 0) {
    console.error(`  ${C.red}❌ Failed to install Python dependencies. Please verify internet access and python configurations.${C.reset}`);
    rl.close();
    process.exit(1);
  }
  console.log(`  ${C.green}✅ Python dependencies installed successfully!${C.reset}\n`);

  // --- STEP 2: Google Cloud CLI Verification ---
  console.log(`${C.bold}🔑 [Step 2/6] Verifying Google Cloud SDK (gcloud)...${C.reset}`);
  const gcloudBinCheck = runCmd("which", ["gcloud"]);
  if (gcloudBinCheck.status !== 0) {
    console.log(`  ${C.yellow}⚠️  Google Cloud CLI (gcloud) was not found in your system PATH.${C.reset}`);
    console.log(`  ${C.dim}To use Vertex AI, you need to install gcloud. Follow instructions at: https://cloud.google.com/sdk/docs/install${C.reset}`);
    const proceed = await ask(`  Do you want to skip gcloud checks and continue setting up other components? (y/N): `);
    if (proceed.trim().toLowerCase() !== "y") {
      rl.close();
      process.exit(127);
    }
    console.log(`  ${C.dim}Skipping gcloud verification...${C.reset}\n`);
  } else {
    console.log(`  ${C.green}✅ Google Cloud CLI detected.${C.reset}\n`);
  }

  // --- STEP 3: GCP Authentication ---
  if (gcloudBinCheck.status === 0) {
    console.log(`${C.bold}🔐 [Step 3/6] Authenticating with Google Cloud...${C.reset}`);
    const loginChoice = await ask(`  Would you like to log in to gcloud and set up application credentials now? (Y/n): `);
    if (loginChoice.trim().toLowerCase() !== "n") {
      console.log(`\n  ${C.dim}Opening browser for user authentication...${C.reset}`);
      spawnSync("gcloud", ["auth", "login"], { stdio: "inherit" });
      
      console.log(`\n  ${C.dim}Opening browser for application-default credentials (ADC) authentication...${C.reset}`);
      spawnSync("gcloud", ["auth", "application-default", "login"], { stdio: "inherit" });
      console.log(`  ${C.green}✅ Google Cloud authentication completed.${C.reset}\n`);
    } else {
      console.log(`  ${C.dim}Skipping active authentication...${C.reset}\n`);
    }
  }

  // --- STEP 4: Resolve GCP Project ID ---
  let selectedProjectId = "";
  if (gcloudBinCheck.status === 0) {
    console.log(`${C.bold}💼 [Step 4/6] Resolving Google Cloud Project ID...${C.reset}`);
    console.log(`  ${C.dim}Fetching active projects from your account...${C.reset}`);
    const projectsProc = spawnSync("gcloud", ["projects", "list", "--format=json"], { encoding: "utf8" });
    let projects = [];
    if (projectsProc.status === 0) {
      try {
        projects = JSON.parse(projectsProc.stdout.trim());
      } catch (err) {
        // ignore
      }
    }

    if (projects.length > 0) {
      console.log(`\n  ${C.bold}Available GCP Projects:${C.reset}`);
      for (let i = 0; i < projects.length; i++) {
        console.log(`  [${i + 1}] ${C.cyan}${projects[i].projectId}${C.reset} (${projects[i].name || "N/A"})`);
      }
      console.log(`  [${projects.length + 1}] Enter Project ID Manually`);
      
      const pChoice = await ask(`\n  Select a project by number (1-${projects.length + 1}): `);
      const choiceIdx = parseInt(pChoice.trim(), 10) - 1;
      if (choiceIdx >= 0 && choiceIdx < projects.length) {
        selectedProjectId = projects[choiceIdx].projectId;
      }
    }

    if (!selectedProjectId) {
      const manualProj = await ask(`  Enter your Google Cloud Project ID manually: `);
      selectedProjectId = manualProj.trim();
    }

    if (!selectedProjectId) {
      console.error(`  ${C.red}❌ No Project ID provided. Setup aborted.${C.reset}`);
      rl.close();
      process.exit(1);
    }
    console.log(`  ${C.green}🎯 Bound to GCP Project: ${C.bold}${selectedProjectId}${C.reset}\n`);
  } else {
    // If no gcloud, let them type manual project ID
    const manualProj = await ask(`💼 [Step 4/6] Enter your Google Cloud Project ID manually: `);
    selectedProjectId = manualProj.trim();
    if (!selectedProjectId) {
      console.error(`  ${C.red}❌ No Project ID provided. Setup aborted.${C.reset}`);
      rl.close();
      process.exit(1);
    }
  }

  // --- STEP 5: Enable APIs and Provision Virtual Agent ---
  if (gcloudBinCheck.status === 0) {
    console.log(`${C.bold}⚙️  [Step 5/6] Enabling APIs & Provisioning Dialogflow CX Agent...${C.reset}`);
    const apiChoice = await ask(`  Do you want to automatically enable Vertex AI & Dialogflow APIs in project '${selectedProjectId}'? (Y/n): `);
    if (apiChoice.trim().toLowerCase() !== "n") {
      console.log(`  ${C.dim}Enabling services (this might take up to a minute)...${C.reset}`);
      spawnSync("gcloud", ["services", "enable", "aiplatform.googleapis.com", "dialogflow.googleapis.com", "serviceusage.googleapis.com", "--project", selectedProjectId], { stdio: "inherit" });
      console.log(`  ${C.green}✅ Services enabled successfully.${C.reset}`);
    }

    // Save temporary global configuration first so create_agent can read it
    const configDir = join(homedir(), ".config", "dt");
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const configPath = join(configDir, "config.json");
    const configData = {
      project_id: selectedProjectId,
      location: "us-central1"
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf8");

    console.log(`\n  ${C.dim}Provisioning Dialogflow CX 'Antigravity Coding Agent' on GCP...${C.reset}`);
    const pythonScript = join(VERTEX_CODER_PATH, "create_agent.py");
    const agentProc = spawnSync(join(venvDir, "bin", "python3"), [pythonScript], { stdio: "inherit" });
    if (agentProc.status === 0) {
      console.log(`  ${C.green}✅ Virtual Agent provisioning completed successfully!${C.reset}\n`);
    } else {
      console.log(`  ${C.yellow}⚠️  Agent provisioning returned non-zero status. Proceeding to save setup.${C.reset}\n`);
    }
  } else {
    console.log(`${C.bold}⚙️  [Step 5/6] Skipping API enablement & Agent provisioning (no gcloud).${C.reset}\n`);
  }

  // --- STEP 6: Global Skills Symlinking & Save Config ---
  console.log(`${C.bold}🔗 [Step 6/6] Linking Agent Skills & Writing Global Configuration...${C.reset}`);
  runLinkSkill();

  const configDir = join(homedir(), ".config", "dt");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const configPath = join(configDir, "config.json");
  const configData = {
    project_id: selectedProjectId,
    location: "us-central1"
  };
  writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf8");
  console.log(`  ${C.green}💾 Written configuration to: ${C.dim}${configPath}${C.reset}`);

  console.log(`
${C.bold}${C.green}🎉 CONGRATULATIONS! AUTOPILOT SETUP COMPLETED SUCCESSFULLY!${C.reset}
--------------------------------------------------------------
${C.bold}Your settings:${C.reset}
  🎯 Bound Project: ${C.bold}${C.cyan}${selectedProjectId}${C.reset}
  📍 Location:      ${C.bold}${C.cyan}us-central1${C.reset}
  💼 Python env:    ${C.dim}${venvDir}${C.reset}
  📂 Config Path:   ${C.dim}${configPath}${C.reset}

${C.bold}Ready commands:${C.reset}
  ${C.cyan}dt check${C.reset}                        Check status of all backends
  ${C.cyan}dt vx interactive "prompt"${C.reset}     Launch Interactive Vertex Coding Agent
  ${C.cyan}dt run "prompt"${C.reset}                Dispatch task with routing and failover

Thank you for choosing Antigravity Coding Agents!
  `);

  rl.close();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function runCmd(command, args = []) {
  try {
    const res = spawnSync(command, args, { encoding: "utf8" });
    return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
  } catch (err) {
    return { status: -1, stdout: "", stderr: err.message };
  }
}

