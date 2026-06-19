import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

export async function runMetaGPTRouter(prompt) {
  const condaEnvDir = join(homedir(), "miniconda", "envs", "metagpt");
  const pythonPath = join(condaEnvDir, "bin", "python3");
  const metagptCliPath = join(condaEnvDir, "bin", "metagpt");

  console.log(`\n🤖 Launching MetaGPT AI Software Company...`);
  console.log(`📋 Prompt: "${prompt}"\n`);
  console.log(`\x1b[90mEnsure your dt proxy server is running (dt serve 3000) for MetaGPT to connect to the backend.\x1b[0m\n`);

  return new Promise((resolve) => {
    const child = spawn(pythonPath, [metagptCliPath, prompt, "--project-path", process.cwd()], {
      stdio: "inherit",
      env: { ...process.env }
    });

    child.on("error", (err) => {
      console.error(`\n❌ Failed to launch MetaGPT: ${err.message}`);
      console.error(`Did you run 'dt setup' to install metagpt in the virtual environment?`);
      resolve(1);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ MetaGPT software company completed its work.`);
      } else {
        console.log(`\n⚠️ MetaGPT exited with code ${code}.`);
      }
      resolve(code || 0);
    });
  });
}
