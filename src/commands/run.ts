import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// We must import unlinkSync from node:fs to fix the bug
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { C } from '../utils/index.js';
import { FALLBACK_RING } from '../fallback/ring.js';
import { RELAY_SCRIPT, ROUTER_SCRIPT, VERTEX_DIRECT_SCRIPT, VERTEX_INTERACTIVE_SCRIPT, VERTEX_VENV_PYTHON } from '../config/index.js';

export function runVertex(mode: string, args: string[]) {
  if (!existsSync(VERTEX_VENV_PYTHON)) {
    console.error(`${C.bold}${C.red}Error: Python virtual environment (.venv) not found at: ${VERTEX_VENV_PYTHON}${C.reset}`);
    console.error(`${C.dim}Please verify your vertex-coder setup or re-run 'dt check' to inspect.${C.reset}`);
    process.exit(127);
  }

  if (mode === "direct") {
    if (args.length < 2) {
      console.error(`${C.bold}${C.red}Usage: dt vx direct <file_path> "<prompt>" [model]${C.reset}`);
      process.exit(2);
    }
    const proc = spawnSync(VERTEX_VENV_PYTHON, [VERTEX_DIRECT_SCRIPT, ...args], { stdio: "inherit" });
    process.exit(proc.status ?? 1);
  } else if (mode === "interactive") {
    if (args.length < 1) {
      console.error(`${C.bold}${C.red}Usage: dt vx interactive "<complex_prompt>" [model]${C.reset}`);
      process.exit(2);
    }
    const proc = spawnSync(VERTEX_VENV_PYTHON, [VERTEX_INTERACTIVE_SCRIPT, ...args], { stdio: "inherit" });
    process.exit(proc.status ?? 1);
  } else {
    console.error(`${C.bold}${C.red}Error: Unknown mode "${mode}". Supported: direct, interactive${C.reset}`);
    console.error(`  ${C.dim}Example: dt vx direct index.html "Add background transition"`);
    console.error(`  ${C.dim}Example: dt vx interactive "Setup vitest suite"`);
    process.exit(2);
  }
}

export function runDispatch(rawPrompt: string | undefined, options: { backend?: string, brief?: string, team?: boolean, allowInstall?: boolean, approveWrite?: boolean }) {
  let backend = options.backend;
  if (options.team) {
    backend = "metagpt";
  }
  let briefFile = options.brief;
  
  const forwardArgs: string[] = [];

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
    forwardArgs.push("--brief", briefFile ?? "");
    isTempBrief = true;
    console.log(`${C.dim}Generated temporary brief file: ${briefFile}${C.reset}`);
  } else if (briefFile) {
    forwardArgs.push("--brief", briefFile);
  }

  if (!briefFile) {
    console.error(`${C.bold}${C.red}Error: Please specify either a prompt or a brief file using --brief <file_path>${C.reset}`);
    process.exit(2);
  }

  const briefText = readFileSync(briefFile, "utf8");

    // 2. Resolve default backend via Router if not specified
  let forceMetagpt = false;
  let autoRouted = false;
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
        if (routeData.score >= 8) {
          backend = "metagpt";
          autoRouted = true;
          console.log(`  🎯 Routing to: ${C.bold}${C.magenta}metagpt${C.reset} (MetaGPT Team Orchestrator for complex tasks)`);
        } else if (routeData.score > 5) {
          backend = "vertexcoder";
          console.log(`  🎯 Routing to: ${C.bold}${C.green}vertexcoder${C.reset} (Premium Gemini AI via GCP SDK)`);
        } else if (routeData.score > 0) {
          backend = "opencode";
          console.log(`  🎯 Routing to: ${C.bold}${C.green}opencode${C.reset} (Balanced OpenCode Router)`);
        } else {
          backend = "minimax";
          console.log(`  🎯 Routing to: ${C.bold}${C.green}minimax${C.reset} (Fast MiniMax Agent)`);
        }
      } else {
        backend = "vertexcoder";
        console.log(`Router returned non-zero status, defaulting to: ${C.bold}${C.green}vertexcoder${C.reset}`);
      }
    } catch {
      // Fallback default
      backend = "vertexcoder";
      console.log(`Router evaluation failed, defaulting to: ${C.bold}${C.green}vertexcoder${C.reset}`);
    }
    
    if (!backend) {
      backend = "vertexcoder";
    }
  }
  
  if (backend === "metagpt") {
    forceMetagpt = true;
  } else {
    forwardArgs.push("--backend", backend as string);
  }

  // 3. Dispatch & Automatic Fallback Ring
  let success = false;
  if (forceMetagpt) {
    console.log(`\n${C.bold}${C.magenta}🚀 Dispatching task to team orchestrator: [METAGPT]${C.reset}`);
    // We import runMetaGPTRouter dynamically to avoid circular dependencies if any, but since it's just a run we can spawn the CLI
    const dtCli = process.argv[1] || process.argv[0]; 
    const metagptArgs = ["metagpt", rawPrompt || briefText];
    
    // Guardrails injection
    if (autoRouted || !options.allowInstall) {
      metagptArgs.push("--no-install");
    }
    metagptArgs.push("--workspace-only");
    
    if (options.approveWrite) {
      metagptArgs.push("--approve-write");
    }
    
    const proc = spawnSync(process.execPath, [dtCli, ...metagptArgs], { stdio: "inherit" });
    success = proc.status === 0;
  } else {
    let activeBackend = backend as string;
    let currentChain = [activeBackend, ...(FALLBACK_RING[activeBackend] || [])];

    for (let attempt = 0; attempt < currentChain.length; attempt++) {
      activeBackend = currentChain[attempt];
      console.log(`\n${C.bold}${C.magenta}🚀 Dispatching task to backend: [${activeBackend.toUpperCase()}] (Attempt ${attempt + 1}/${currentChain.length})${C.reset}`);
      console.log(`${C.dim}relay.mjs ${forwardArgs.filter(a => a !== "--backend" && a !== activeBackend).join(" ")} --backend ${activeBackend}${C.reset}\n`);

      const runArgs = [...forwardArgs];
      const bIndex = runArgs.indexOf("--backend");
      if (bIndex !== -1) {
        runArgs[bIndex + 1] = activeBackend;
      }

      const start = Date.now();
      const proc = spawnSync(process.execPath, [RELAY_SCRIPT, ...runArgs], { stdio: "inherit" });
      const durationSec = ((Date.now() - start) / 1000).toFixed(1);

      if (proc.status === 0) {
        console.log(`\n${C.bold}${C.green}✅ Task completed successfully by [${activeBackend.toUpperCase()}] in ${durationSec}s!${C.reset}\n`);
        success = true;
        break;
      } else {
        console.log(`\n${C.bold}${C.yellow}⚠️  Backend [${activeBackend.toUpperCase()}] failed or exited with status code ${proc.status || "N/A"} after ${durationSec}s.${C.reset}`);
        
        const nextBackend = currentChain[attempt + 1];
        if (nextBackend) {
          console.log(`${C.bold}${C.yellow}🔄 Activating Automated Failover Ring → Routing to next backup: [${nextBackend.toUpperCase()}]${C.reset}`);
        }
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
