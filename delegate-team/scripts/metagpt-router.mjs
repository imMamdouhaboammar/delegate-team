import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMetaGPTRouter(prompt) {
  const venvDir = join(__dirname, "..", "..", "vertex-coder", ".venv");
  const pythonPath = join(venvDir, "bin", "python3");
  const metagptCliPath = join(venvDir, "bin", "metagpt");

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
