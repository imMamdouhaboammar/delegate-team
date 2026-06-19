import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync, lstatSync, readlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { C, runCmd } from '../utils/index.js';
import { DELEGATE_TEAM_PATH, RELAY_SCRIPT, VERTEX_CODER_PATH, VERTEX_DIRECT_SCRIPT, VERTEX_INTERACTIVE_SCRIPT, VERTEX_VENV_PYTHON } from '../config/index.js';

export function runLinkSkill() {
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
      } catch (err: any) {
        console.error(`${C.red}Failed to create skills directory ${dir}: ${err.message}${C.reset}`);
        continue;
      }
    }

    const delTarget = join(dir, "delegate-team");
    const vtxTarget = join(dir, "vertex-coder");

    // Symlink delegate-team
    try {
      let shouldLink = true;
      try {
        const stat = lstatSync(delTarget);
        if (stat.isSymbolicLink()) {
          const target = readlinkSync(delTarget);
          if (target === DELEGATE_TEAM_PATH) {
            shouldLink = false;
          } else {
            rmSync(delTarget, { force: true });
          }
        } else {
          console.log(`  ${C.yellow}⚠️  Directory ${delTarget} exists and is not a symlink. Skipping to prevent data loss.${C.reset}`);
          shouldLink = false;
        }
      } catch (e) {
        // Doesn't exist
      }
      
      if (shouldLink) {
        symlinkSync(DELEGATE_TEAM_PATH, delTarget, "dir");
        console.log(`  ${C.green}✅ Linked delegate-team${C.reset} -> ${C.dim}${dir}/delegate-team${C.reset}`);
        linkedCount++;
      }
    } catch (err: any) {
      console.error(`  ${C.red}❌ Failed link delegate-team to ${dir}: ${err.message}${C.reset}`);
    }

    // Symlink vertex-coder
    try {
      let shouldLink = true;
      try {
        const stat = lstatSync(vtxTarget);
        if (stat.isSymbolicLink()) {
          const target = readlinkSync(vtxTarget);
          if (target === VERTEX_CODER_PATH) {
            shouldLink = false;
          } else {
            rmSync(vtxTarget, { force: true });
          }
        } else {
          console.log(`  ${C.yellow}⚠️  Directory ${vtxTarget} exists and is not a symlink. Skipping to prevent data loss.${C.reset}`);
          shouldLink = false;
        }
      } catch (e) {
        // Doesn't exist
      }

      if (shouldLink) {
        symlinkSync(VERTEX_CODER_PATH, vtxTarget, "dir");
        console.log(`  ${C.green}✅ Linked vertex-coder${C.reset}  -> ${C.dim}${dir}/vertex-coder${C.reset}`);
        linkedCount++;
      }
    } catch (err: any) {
      console.error(`  ${C.red}❌ Failed link vertex-coder to ${dir}: ${err.message}${C.reset}`);
    }
  }

  if (linkedCount > 0) {
    console.log(`\n${C.bold}${C.green}🎉 Skill registration completed successfully! (${linkedCount} symlinks updated)${C.reset}\n`);
  } else {
    console.error(`\n${C.bold}${C.red}⚠️  Skill registration completed with errors.${C.reset}\n`);
  }
}

export async function runSetup() {
  console.log(`\n${C.bold}${C.cyan}🚀 Initiating Autopilot Onboarding Setup Wizard...${C.reset}`);
  console.log(`${C.dim}This wizard will configure your local environment, authentications, and cloud projects automatically.${C.reset}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));
  const proxyToken = "dt-local-" + randomBytes(8).toString('hex');

  // --- STEP 1: Local Virtual Environment Setup ---
  console.log(`${C.bold}📦 [Step 1/6] Setting up Python Virtual Environment...${C.reset}`);
  const venvDir = join(VERTEX_CODER_PATH, ".venv");
  if (!existsSync(venvDir)) {
    console.log(`  ${C.dim}Virtual environment (.venv) not found. Creating a new one...${C.reset}`);
    
    // Prefer python3.11 for compatibility with MetaGPT/faiss
    let pythonCmd = "python3";
    const py311Check = spawnSync("which", ["python3.11"]);
    if (py311Check.status === 0) {
      pythonCmd = "python3.11";
      console.log(`  ${C.dim}Using ${pythonCmd} for compatibility...${C.reset}`);
    }

    const venvProc = spawnSync(pythonCmd, ["-m", "venv", venvDir], { stdio: "inherit" });
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
  const pipProc = spawnSync(pipPath, ["install", "--upgrade", "pip", "google-genai", "google-cloud-dialogflow-cx", "google-auth-oauthlib", "pytest"], { stdio: "inherit" });
  if (pipProc.status !== 0) {
    console.error(`  ${C.red}❌ Failed to install core Python dependencies.${C.reset}`);
    rl.close();
    process.exit(1);
  }
  console.log(`  ${C.green}✅ Core Python dependencies installed successfully!${C.reset}\n`);

  console.log(`  ${C.dim}Attempting to install MetaGPT (requires Python <= 3.11)...${C.reset}`);
  const metagptProc = spawnSync(pipPath, ["install", "metagpt"], { stdio: "inherit" });
  if (metagptProc.status !== 0) {
    console.log(`  ${C.yellow}⚠️  MetaGPT installation skipped (often due to Python 3.12+ or Apple Silicon faiss-cpu issues). You can install it manually later if needed.${C.reset}\n`);
  } else {
    console.log(`  ${C.green}✅ MetaGPT installed successfully!${C.reset}\n`);
  }

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
      await runAuth();
    } else {
      console.log(`  ${C.dim}Skipping active authentication...${C.reset}\\n`);
    }
  }

  // --- STEP 4: Resolve GCP Project ID ---
  let selectedProjectId = "";
  if (gcloudBinCheck.status === 0) {
    console.log(`${C.bold}💼 [Step 4/6] Resolving Google Cloud Project ID...${C.reset}`);
    console.log(`  ${C.dim}Fetching active projects from your account...${C.reset}`);
    const projectsProc = spawnSync("gcloud", ["projects", "list", "--format=json"], { encoding: "utf8" });
    let projects: any[] = [];
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
    console.log(`${C.bold}⚙️  [Step 5/6] Enabling APIs & Provisioning Agent...${C.reset}`);
    const apiChoice = await ask(`  Do you want to automatically enable Vertex AI & Dialogflow APIs in project '${selectedProjectId}'? (Y/n): `);
    if (apiChoice.trim().toLowerCase() !== "n") {
      await runGcpEnable(selectedProjectId);
    }

    const configDir = join(homedir(), ".config", "dt");
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const configPath = join(configDir, "config.json");
    const configData = {
      project_id: selectedProjectId,
      location: "us-central1",
      proxy_token: proxyToken
    };
    writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf8");

    const provisionChoice = await ask(`  Do you want to provision the dt agent on GCP? (Y/n): `);
    if (provisionChoice.trim().toLowerCase() !== "n") {
      await runVertexProvision();
    }
  } else {
    console.log(`${C.bold}⚙️  [Step 5/6] Skipping API enablement & Agent provisioning (no gcloud).${C.reset}\\n`);
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
    location: "us-central1",
    proxy_token: proxyToken
  };
  writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf8");
  console.log(`  ${C.green}💾 Written configuration to: ${C.dim}${configPath}${C.reset}`);

  // MetaGPT Configuration
  const metagptDir = join(homedir(), ".metagpt");
  if (!existsSync(metagptDir)) {
    mkdirSync(metagptDir, { recursive: true });
  }
  const metagptConfigPath = join(metagptDir, "config2.yaml");
  const metagptConfigContent = `llm:
  api_type: "openai"
  base_url: "http://127.0.0.1:3000/v1"
  api_key: "${proxyToken}"
  model: "google/gemini-3.1-pro-custom-tools"
`;
  writeFileSync(metagptConfigPath, metagptConfigContent, "utf8");
  console.log(`  ${C.green}💾 Written MetaGPT configuration to: ${C.dim}${metagptConfigPath}${C.reset}`);

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

Thank you for using dt / delegate-team!
  `);

  rl.close();
}

export async function runAuth() {
  console.log(`\n${C.bold}${C.cyan}🔐 Authenticating with Google Cloud...${C.reset}`);
  console.log(`  ${C.dim}Opening browser for user authentication...${C.reset}`);
  const loginProc = spawnSync("gcloud", ["auth", "login"], { stdio: "inherit" });
  if (loginProc.status !== 0) throw new Error("gcloud auth login failed");
  console.log(`\n  ${C.dim}Opening browser for application-default credentials (ADC) authentication...${C.reset}`);
  const adcProc = spawnSync("gcloud", ["auth", "application-default", "login"], { stdio: "inherit" });
  if (adcProc.status !== 0) throw new Error("gcloud auth application-default login failed");
  console.log(`  ${C.green}✅ Google Cloud authentication completed.${C.reset}\n`);
}

export async function runGcpEnable(projectId: string) {
  console.log(`\n${C.bold}${C.cyan}⚙️  Enabling APIs in project '${projectId}'...${C.reset}`);
  console.log(`  ${C.dim}Enabling Vertex AI API...${C.reset}`);
  const aiProc = spawnSync("gcloud", ["services", "enable", "aiplatform.googleapis.com", "--project", projectId], { stdio: "inherit" });
  if (aiProc.status !== 0) throw new Error("Failed to enable aiplatform.googleapis.com");
  console.log(`  ${C.dim}Enabling Dialogflow API...${C.reset}`);
  const dfProc = spawnSync("gcloud", ["services", "enable", "dialogflow.googleapis.com", "--project", projectId], { stdio: "inherit" });
  if (dfProc.status !== 0) throw new Error("Failed to enable dialogflow.googleapis.com");
  console.log(`  ${C.green}✅ GCP APIs enabled successfully.${C.reset}\n`);
}

export async function runVertexProvision() {
  console.log(`\n${C.bold}${C.cyan}🤖 Provisioning Vertex AI Agent...${C.reset}`);
  console.log(`  ${C.dim}Running vertex-coder provisioner...${C.reset}`);
  
  const provisionScript = join(VERTEX_CODER_PATH, "provision_agent.py");
  const pythonPath = VERTEX_VENV_PYTHON;
  
  if (!existsSync(pythonPath)) {
    console.error(`  ${C.red}❌ Python virtual environment not found at ${pythonPath}. Please run 'dt setup' first.${C.reset}`);
    process.exit(1);
  }
  
  if (!existsSync(provisionScript)) {
    console.error(`  ${C.red}❌ Provision script not found at ${provisionScript}.${C.reset}`);
    process.exit(1);
  }

  const proc = spawnSync(pythonPath, [provisionScript], { stdio: "inherit" });
  if (proc.status === 0) {
    console.log(`  ${C.green}✅ Vertex AI Agent provisioned successfully.${C.reset}\n`);
  } else {
    console.error(`  ${C.red}❌ Failed to provision Vertex AI Agent.${C.reset}\n`);
    throw new Error("Vertex AI Agent provisioning failed");
  }
}

