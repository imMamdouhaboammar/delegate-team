import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { C } from '../utils/index.js';
import { ExitCode } from '../utils/exit-codes.js';
import { FALLBACK_RING } from '../fallback/ring.js';
import { NeuralMesh } from '../neural/mesh.js';
import { emitSynapse } from '../neural/trace-bus.js';

// The failover chain is now mesh-driven. Fall back to the hardcoded ring only
// if the neural mesh cannot be loaded (keeps dt run resilient).
function resolveFallbackChain(backend: string): string[] {
  try {
    const mesh = NeuralMesh.fromPath();
    const chain = mesh.fallbackChain(backend);
    if (chain.length > 0) return chain;
  } catch {
    /* mesh unavailable — fall through */
  }
  return FALLBACK_RING[backend] || [];
}
import { RELAY_SCRIPT, ROUTER_SCRIPT, VERTEX_DIRECT_SCRIPT, VERTEX_INTERACTIVE_SCRIPT, VERTEX_VENV_PYTHON } from '../config/index.js';

export function runVertex(mode: string, args: string[]) {
  if (!existsSync(VERTEX_VENV_PYTHON)) {
    console.error(`${C.bold}${C.red}Error: Python virtual environment (.venv) not found at: ${VERTEX_VENV_PYTHON}${C.reset}`);
    console.error(`${C.dim}Please verify your vertex-coder setup or re-run 'dt check' to inspect.${C.reset}`);
    process.exit(ExitCode.MISSING_DEPENDENCY);
  }

  if (mode === "direct") {
    if (args.length < 2) {
      console.error(`${C.bold}${C.red}Usage: dt vx direct <file_path> "<prompt>" [model]${C.reset}`);
      process.exit(ExitCode.USAGE);
    }
    const proc = spawnSync(VERTEX_VENV_PYTHON, [VERTEX_DIRECT_SCRIPT, ...args], { stdio: "inherit" });
    process.exit(proc.status ?? ExitCode.FAILURE);
  } else if (mode === "interactive") {
    if (args.length < 1) {
      console.error(`${C.bold}${C.red}Usage: dt vx interactive "<complex_prompt>" [model]${C.reset}`);
      process.exit(ExitCode.USAGE);
    }
    const proc = spawnSync(VERTEX_VENV_PYTHON, [VERTEX_INTERACTIVE_SCRIPT, ...args], { stdio: "inherit" });
    process.exit(proc.status ?? ExitCode.FAILURE);
  } else {
    console.error(`${C.bold}${C.red}Error: Unknown mode "${mode}". Supported: direct, interactive${C.reset}`);
    console.error(`  ${C.dim}Example: dt vx direct index.html "Add background transition"`);
    console.error(`  ${C.dim}Example: dt vx interactive "Setup vitest suite"`);
    process.exit(ExitCode.USAGE);
  }
}

type DispatchOptions = {
  backend?: string;
  brief?: string;
  team?: boolean;
  allowInstall?: boolean;
  approveWrite?: boolean;
  dryRun?: boolean;
};

export function runDispatch(rawPrompt: string | undefined, options: DispatchOptions) {
  let backend = options.backend;
  if (options.team) {
    backend = "mmas";
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
    process.exit(ExitCode.USAGE);
  }

  const briefText = readFileSync(briefFile, "utf8");

  // 2. Resolve default backend via Router if not specified
  let forceMetagpt = false;
  let forceMmas = false;
  let autoRouted = false;
  let routeReason = "explicit backend";
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
        routeReason = `router score ${routeData.score}`;
        console.log(`${C.bold}${C.cyan}Router Complexity Score: ${routeData.score}${C.reset}`);
        // Choose best backend based on score
        if (routeData.score >= 8) {
          backend = "mmas";
          autoRouted = true;
          console.log(`  🎯 Routing to: ${C.bold}${C.magenta}mmas${C.reset} (Apeiron Multi-Agent System for complex tasks)`);
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
        routeReason = `router status ${routerProc.status ?? 'unknown'}`;
        const stderr = routerProc.stderr?.trim();
        console.log(`Router returned non-zero status, defaulting to: ${C.bold}${C.green}vertexcoder${C.reset}`);
        if (stderr) console.log(`${C.dim}Router stderr: ${stderr}${C.reset}`);
      }
    } catch (err: any) {
      backend = "vertexcoder";
      routeReason = `router exception: ${err?.message || String(err)}`;
      console.log(`Router evaluation failed, defaulting to: ${C.bold}${C.green}vertexcoder${C.reset}`);
    }
    
    if (!backend) {
      backend = "vertexcoder";
      routeReason = "router returned no backend";
    }
  }
  
  if (backend === "metagpt") {
    forceMetagpt = true;
  } else if (backend === "mmas") {
    forceMmas = true;
  } else {
    forwardArgs.push("--backend", backend as string);
  }

  const plannedChain = forceMmas ? ["mmas"] : (forceMetagpt ? ["metagpt"] : [backend as string, ...resolveFallbackChain(backend as string)]);

  // Fire a ROUTES_TO synapse from the dispatcher so the neural trace records
  // the primary routing decision in one connected bus.
  emitSynapse('dt-cli', backend as string, 'ROUTES_TO', {
    signal: routeReason,
    meta: { autoRouted, dryRun: !!options.dryRun },
  });

  if (options.dryRun) {
    console.log(`\n${C.bold}${C.cyan}Dry run dispatch plan${C.reset}`);
    console.log(`  brief:        ${briefFile}`);
    console.log(`  selected:     ${backend}`);
    console.log(`  route reason: ${routeReason}`);
    console.log(`  chain:        ${plannedChain.join(' -> ')}`);
    console.log(`  would execute: ${forceMetagpt ? 'dt metagpt' : 'relay.mjs'}\n`);

    if (isTempBrief && existsSync(briefFile)) {
      try { unlinkSync(briefFile); } catch {}
    }
    return;
  }

  // 3. Dispatch & Automatic Fallback Ring
  let success = false;
  if (backend === "mmas") {
    console.log(`\n${C.bold}${C.magenta}🚀 Dispatching task to Multi-Agent System: [MMAS]${C.reset}`);
    const dtCli = process.argv[1] || process.argv[0];
    const mmasArgs = ["mmas", "spawn", rawPrompt || briefText];
    if (options.dryRun) {
      mmasArgs.push("--plan-only");
    }
    if (!options.allowInstall) {
      mmasArgs.push("--no-write");
    }
    const proc = spawnSync(process.execPath, [dtCli, ...mmasArgs], { stdio: "inherit" });
    success = proc.status === 0;
  } else if (forceMetagpt) {
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
          // Fire a FALLBACKS_TO synapse so the neural trace records the handoff.
          emitSynapse(activeBackend, nextBackend, 'FALLBACKS_TO', {
            signal: `failover ring (attempt ${attempt + 1})`,
            weight: 1.0,
          });
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
    process.exit(ExitCode.FAILURE);
  }
}
