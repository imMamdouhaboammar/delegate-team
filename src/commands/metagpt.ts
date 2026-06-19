import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TraceManager } from "../utils/tracer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMetaGPTRouter(prompt: string, options: any = {}): Promise<number> {
  const venvDir = join(__dirname, "..", "..", "vertex-coder", ".venv");
  const pythonPath = join(venvDir, "bin", "python3");
  const metagptCliPath = join(venvDir, "bin", "metagpt");

  const tracer = new TraceManager();
  const trace = tracer.createTrace();

  if (trace.depth_control.current_depth > trace.depth_control.max_depth) {
    console.error(`\n❌ Delegation Blocked: Maximum execution depth (${trace.depth_control.max_depth}) exceeded.`);
    return 1;
  }

  console.log(`\n🤖 Launching MetaGPT AI Software Company...`);
  console.log(`📋 Trace ID: ${trace.trace_id}`);
  console.log(`📋 Prompt: "${prompt}"\n`);
  
  const metagptArgs = [metagptCliPath, prompt, "--project-path", process.cwd()];
  
  if (options.planOnly) {
    console.log(`🛡️  Guardrail Active: [--plan-only] MetaGPT will generate plan/architecture only.`);
    // Map to MetaGPT config or args if natively supported, or pass as custom flag if extended
    metagptArgs.push("--plan-only");
  }
  if (options.approveWrite) {
    console.log(`🛡️  Guardrail Active: [--approve-write] Requiring human approval before disk writes.`);
    metagptArgs.push("--approve-write");
  }
  if (options.workspaceOnly) {
    console.log(`🛡️  Guardrail Active: [--workspace-only] Sandboxing to workspace root.`);
    metagptArgs.push("--workspace-only");
  }
  if (options.noInstall) {
    console.log(`🛡️  Guardrail Active: [--no-install] Package installation blocked.`);
    metagptArgs.push("--no-install");
  }
  if (options.dryRun) {
    console.log(`🛡️  Guardrail Active: [--dry-run] Simulating workflow safely.`);
    metagptArgs.push("--dry-run");
  }

  console.log(`\x1b[90mEnsure your dt proxy server is running (dt serve 3000) for MetaGPT to connect to the backend.\x1b[0m\n`);

  return new Promise((resolve) => {
    
    // Pass execution bounds via Env
    const execEnv = { 
      ...process.env,
      DT_TRACE_ID: trace.trace_id,
      DT_MAX_ROLES: trace.budget.max_roles.toString(),
      DT_MAX_TOKENS: trace.budget.max_tokens_total.toString(),
      DT_EXECUTION_DEPTH: trace.depth_control.current_depth.toString(),
      DT_CAN_CALL_METAGPT: trace.depth_control.can_call_metagpt.toString()
    };

    const child = spawn(pythonPath, metagptArgs, {
      stdio: "inherit",
      env: execEnv
    });

    child.on("error", (err: Error) => {
      console.error(`\n❌ Failed to launch MetaGPT: ${err.message}`);
      console.error(`Did you run 'dt setup' to install metagpt in the virtual environment?`);
      resolve(1);
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        console.log(`\n✅ MetaGPT software company completed its work.`);
        trace.final_status = 'ready_for_review';
      } else {
        console.log(`\n⚠️ MetaGPT exited with code ${code}.`);
        trace.final_status = 'executing'; // or failed depending on logic
      }
      
      // Save trace after execution
      tracer.saveTrace(trace);
      
      resolve(code || 0);
    });
  });
}
