#!/usr/bin/env node
/**
 * delegate-team · relay.mjs — unified multi-backend dispatch
 *
 * Dispatch a self-contained brief to ANY implementer backend (Codex, Gemini,
 * MiniMax, OpenRouter, or any opencode-go provider), capture the run, and write
 * a structured result.json the orchestrating agent can review.
 *
 * Trust posture: relay.mjs makes no network calls itself, has no dependencies
 * (Node built-ins only), and shells out only to the backend CLI + git. Credentials
 * are read from backend-specific dotfiles (outside any repo) and injected into
 * the child env — never logged, never in argv, never in a tracked file.
 *
 * It deliberately does NOT commit. The orchestrator commits after review.
 *
 * Usage:
 *   node relay.mjs --backend <name> --brief <file> [options]
 *   cat brief.txt | node relay.mjs --backend gemini [options]
 *
 * Backends:
 *   codex        OpenAI Codex CLI (codex exec)
 *   gemini       Google Gemini CLI (gemini -p), Vertex AI, 8-account quota rotation
 *   minimax      MiniMax via Claude CLI (claude -p --bare)
 *   openrouter   OpenRouter via opencode CLI (opencode run)
 *   opencode     opencode-go models via opencode CLI (smart 4-tier router)
 *   vertexcoder  Google Vertex AI interactive Python agent
 *
 * Common options:
 *   --brief <file>          Path to brief (or pipe stdin)
 *   --cd <dir>              Working root (default: cwd)
 *   --model <name>          Model override (each backend has a default)
 *   --read-only             Review/diagnosis mode — no edits
 *   --out-dir <dir>         Artifact directory (default: temp dir)
 *   --max-retries <n>       Auto-retry on 429/transient (default: 4)
 *   --retry-base-ms <ms>    Backoff base (default: 20000 → 20s/40s/80s/160s)
 *   -h, --help              Show this help
 *
 * Backend-specific options:
 *   Codex:      --sandbox <mode>     read-only|workspace-write|danger-full-access
 *               --resume-last        Continue most recent session
 *               --skip-git-repo-check
 *   Gemini:     --approval-mode <m>  yolo|auto_edit|plan
 *               --sandbox            OS sandbox (-s)
 *               --include <dir>      Extra workspace dir (repeatable)
 *   MiniMax:    --permission-mode <m> bypassPermissions|acceptEdits|plan
 *               --env-file <path>    Credential file (default: ~/.minimax/.env)
 *   OpenRouter: (--model takes provider/model, e.g. qwen/qwen3-coder:free)
 *
 * Result: <out-dir>/result.json + stdout summary.
 * Exit: usage error=2, binary missing=127, otherwise mirrors the backend's exit.
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const STDIN_DIRECTIVE =
  "\n\n---\nExecute the task described above in the current working directory. " +
  "Do NOT run git commit or git push — the orchestrator commits after review. " +
  "When done, end with a short report: files changed, gate/command results you ran, and anything you deliberately left out.";

const READONLY_SUFFIX =
  "\n\n---\nREAD-ONLY: do not modify, create, or delete any files. Only inspect and report.";

const RETRYABLE_RE = /(^|[^0-9])(429|503|529)([^0-9]|$)|RESOURCE[ _-]?EXHAUSTED|resource[ _-]?exhausted|rate[ _-]?limit|too many requests|\bUNAVAILABLE\b|overloaded/i;

// Credit exhaustion: matches OpenAI daily quota / usage limit errors
const CREDIT_EXHAUSTED_RE = /insufficient.?credits|usage.?limit.?reached|daily.?limit|quota.?exceeded|out.?of.?credit|billing|payment.?required|credit.?balance/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function fail(message, code = 2) {
  process.stderr.write(`relay: ${message}\n`);
  process.exit(code);
}

function gitTouchedFiles(cwd) {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
    return out.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  } catch { return null; }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function loadDotenv(path) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function isRetryable(stdoutBuf, stderrTail) {
  const combined = typeof stdoutBuf === "string"
    ? `${stdoutBuf}\n${stderrTail.join("\n")}`
    : `${stdoutBuf.join("\n")}\n${stderrTail.join("\n")}`;
  return RETRYABLE_RE.test(combined);
}

function readBrief(opts) {
  if (opts.brief) {
    if (!existsSync(opts.brief)) fail(`brief file not found: ${opts.brief}`);
    return readFileSync(opts.brief, "utf8");
  }
  let stdin = "";
  try { stdin = readFileSync(0, "utf8"); } catch { stdin = ""; }
  return stdin;
}

function prepareRunDir(opts, brief, tag) {
  const startedAt = new Date().toISOString();
  const outDir = opts.outDir || join(tmpdir(), `delegate-team-${tag}`, `${basename(opts.cd) || "repo"}-${timestamp()}`);
  mkdirSync(outDir, { recursive: true });
  const run = {
    startedAt,
    eventsPath: join(outDir, "events.jsonl"),
    finalPath: join(outDir, "final.txt"),
    briefPath: join(outDir, "brief.txt"),
    resultPath: join(outDir, "result.json"),
  };
  writeFileSync(run.briefPath, brief, "utf8");
  writeFileSync(run.eventsPath, "", "utf8");
  return run;
}

function printSummary(result, resultPath, backendLabel) {
  const lines = [];
  lines.push("");
  lines.push(`relay: ${result.status} (exit ${result.exitCode})  ·  ${backendLabel}  ·  ${result.model || "default"}`);
  const touched = result.touchedFiles;
  if (touched === null) {
    lines.push("touched files: git unavailable — inspect the working tree directly");
  } else {
    lines.push(`touched files: ${touched.length}`);
    for (const file of touched.slice(0, 40)) lines.push(`  ${file}`);
    if (touched.length > 40) lines.push(`  … and ${touched.length - 40} more`);
  }
  if (result.stderrTail && result.stderrTail.length) {
    lines.push("last stderr:");
    for (const line of result.stderrTail.slice(-8)) lines.push(`  ${line}`);
  }
  lines.push("");
  lines.push(`--- ${backendLabel} final report ---`);
  lines.push(result.finalMessage || "(no final message captured)");
  lines.push("--- end report ---");
  lines.push("");
  lines.push(`result: ${resultPath}`);
  lines.push("relay does not commit. Review the diff, re-run the project gates yourself, then commit from the orchestrator.");
  process.stdout.write(`${lines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------
// Backend: Codex
// ---------------------------------------------------------------------------

const codexBackend = {
  name: "codex",
  bin: "codex",
  schema: "delegate-team.codex.result.v1",
  defaultModel: null,

  extraOpts: {
    sandbox: "workspace-write",
    resumeLast: false,
    skipGitRepoCheck: false,
    account: null,          // manual account override: main | secondary
    skipRouter: false,      // bypass smart router
    resolvedCodexHome: null,// set by resolveRouting()
  },
  SANDBOX_MODES: new Set(["read-only", "workspace-write", "danger-full-access"]),

  parseExtraArgs(opts, arg, next) {
    switch (arg) {
      case "--sandbox": opts.sandbox = next(); return true;
      case "--resume-last": opts.resumeLast = true; return true;
      case "--skip-git-repo-check": opts.skipGitRepoCheck = true; return true;
      case "--account": opts.account = next(); return true;
      case "--skip-router": opts.skipRouter = true; return true;
      default: return false;
    }
  },

  validate(opts) {
    if (!this.SANDBOX_MODES.has(opts.sandbox)) {
      fail(`invalid --sandbox "${opts.sandbox}" (expected: ${[...this.SANDBOX_MODES].join(", ")})`);
    }
    if (opts.readOnly) opts.sandbox = "read-only";
  },

  getVersion() {
    try {
      return execFileSync("codex", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
    } catch { return null; }
  },

  // Called by dispatch() before buildEnv/buildArgv. Sets opts.resolvedCodexHome and
  // opts.model (if not already set by --model flag). Non-fatal on failure.
  resolveRouting(opts, brief) {
    const defaultHome = join(homedir(), ".codex-delegate");

    // Skip router: disabled, or resume-last (inherits previous session's model)
    if (opts.skipRouter || opts.resumeLast) {
      opts.resolvedCodexHome = defaultHome;
      return;
    }

    const routerPath = join(dirname(new URL(import.meta.url).pathname), "codex-router.mjs");
    if (!existsSync(routerPath)) {
      opts.resolvedCodexHome = defaultHome;
      return;
    }

    try {
      // Inject account override as a prefixed line the router reads before the brief
      const input = opts.account
        ? `__ACCOUNT_OVERRIDE__:${opts.account}\n${brief}`
        : brief;

      const raw = execFileSync(process.execPath, [routerPath, "route"], {
        input,
        encoding: "utf8",
        timeout: 8_000,
      });

      const decision = JSON.parse(raw.trim());

      // Only override model if not explicitly passed via --model
      if (!opts.model && decision.model) opts.model = decision.model;
      opts.resolvedCodexHome = decision.codexHome || defaultHome;

      process.stderr.write(`\nrouter → ${decision.reason}\n\n`);
    } catch (_err) {
      // Router failed (syntax error, timeout, etc.) — silently use defaults
      opts.resolvedCodexHome = defaultHome;
    }
  },

  buildEnv(opts) {
    const codexHome = opts.resolvedCodexHome || join(homedir(), ".codex-delegate");
    return existsSync(join(codexHome, "config.toml"))
      ? { ...process.env, CODEX_HOME: codexHome }
      : { ...process.env };
  },

  // Called after all retries are exhausted with a credit/quota failure.
  // Records the exhausted account, then re-resolves routing to get the other account.
  // Returns new opts for a one-shot retry on the fallback account, or null if no fallback.
  switchAccount(opts, stderrTail, brief) {
    const combined = stderrTail.join("\n");
    const isCredit  = CREDIT_EXHAUSTED_RE.test(combined);
    const isQuota   = RETRYABLE_RE.test(combined);
    if (!isCredit && !isQuota) return null;

    // Determine current account name from resolved codex home path
    const currentHome = opts.resolvedCodexHome || join(homedir(), ".codex-delegate");
    const currentAccount = currentHome.includes(".codex-delegate-2") ? "secondary" : "main";

    // Record credit exhaustion on router (20h TTL)
    const routerPath = join(dirname(new URL(import.meta.url).pathname), "codex-router.mjs");
    if (existsSync(routerPath)) {
      try {
        execFileSync(process.execPath, [routerPath, "record-rate-limit", currentAccount], {
          encoding: "utf8", timeout: 3_000,
        });
      } catch { /* non-fatal */ }
    }

    // Re-resolve routing — router will now skip the exhausted account
    const fallbackOpts = { ...opts, resolvedCodexHome: null, account: null };
    this.resolveRouting(fallbackOpts, brief);

    // If routing returned the same home, no real fallback found
    if (fallbackOpts.resolvedCodexHome === currentHome) return null;

    return fallbackOpts;
  },

  buildArgv(opts, run) {
    const argv = ["exec"];
    if (opts.resumeLast) argv.push("resume", "--last");
    argv.push("--json", "-o", run.finalPath);
    if (!opts.resumeLast) argv.push("-s", opts.sandbox);
    if (opts.model) argv.push("-m", opts.model);
    if (opts.skipGitRepoCheck) argv.push("--skip-git-repo-check");
    argv.push("-");
    return argv;
  },

  buildStdin(brief, opts) {
    return brief;
  },

  extractFinalMessage(raw, run) {
    return existsSync(run.finalPath) ? readFileSync(run.finalPath, "utf8").trim() : "";
  },

  extraResultFields(opts) {
    return {
      sandbox: opts.resumeLast ? "(inherited)" : opts.sandbox,
      resumeLast: opts.resumeLast,
    };
  },

  onStdoutLine(line) {
    try {
      const ev = JSON.parse(line);
      return ev.thread_id ?? ev.threadId ?? (ev.thread && (ev.thread.thread_id ?? ev.thread.id)) ?? null;
    } catch { return null; }
  },

  summaryLabel(version) { return `codex ${version ?? "?"}`; },
  unavailableStatus: "codex_unavailable",
  installHint: "Install: npm i -g @openai/codex && codex login",
};

// ---------------------------------------------------------------------------
// Backend: Gemini
// ---------------------------------------------------------------------------

const geminiBackend = {
  name: "gemini",
  bin: "gemini",
  schema: "delegate-team.gemini.result.v1",
  defaultModel: null,

  APPROVAL_MODES: new Set(["yolo", "auto_edit", "plan"]),
  extraOpts: {
    approvalMode: "yolo",
    geminiSandbox: false,
    include: [],
    resolvedAccount: null,  // set by resolveRouting()
    resolvedProject: null,  // set by resolveRouting()
  },

  parseExtraArgs(opts, arg, next) {
    switch (arg) {
      case "--approval-mode": opts.approvalMode = next(); return true;
      case "--sandbox": opts.geminiSandbox = true; return true;
      case "--include": opts.include = opts.include || []; opts.include.push(resolve(next())); return true;
      default: return false;
    }
  },

  validate(opts) {
    if (opts.readOnly) opts.approvalMode = "plan";
    if (!this.APPROVAL_MODES.has(opts.approvalMode)) {
      fail(`invalid --approval-mode "${opts.approvalMode}" (expected: ${[...this.APPROVAL_MODES].join(", ")})`);
    }
  },

  getVersion() {
    try {
      return execFileSync("gemini", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
    } catch { return null; }
  },

  // Called by dispatch() before buildArgv. Sets opts.model, opts.resolvedAccount,
  // opts.resolvedProject via the smart router. Non-fatal on failure.
  resolveRouting(opts, brief) {
    const routerPath = join(dirname(new URL(import.meta.url).pathname), "gemini-router.mjs");
    if (!existsSync(routerPath)) return;
    try {
      const input = opts._accountOverride
        ? `__ACCOUNT_OVERRIDE__:${opts._accountOverride}\n${brief}`
        : brief;
      const raw = execFileSync(process.execPath, [routerPath, "route"], {
        input,
        encoding: "utf8",
        timeout: 8_000,
      });
      const decision = JSON.parse(raw.trim());
      if (!opts.model && decision.model) opts.model = decision.model;
      opts.resolvedAccount = decision.account;
      opts.resolvedProject = decision.project;
      opts.resolvedGcloudAccount = decision.gcloudAccount;
      process.stderr.write(`\ngemini-router → ${decision.reason}\n\n`);
    } catch { /* non-fatal — fall back to .gemini/.env defaults */ }
  },

  buildEnv(opts) {
    const userEnv = loadDotenv(join(homedir(), ".gemini", ".env")) || {};
    const env = { ...userEnv, ...process.env, GEMINI_CLI_TRUST_WORKSPACE: "true" };
    // Override project + account if router resolved them
    if (opts.resolvedProject) env.GOOGLE_CLOUD_PROJECT = opts.resolvedProject;
    if (opts.resolvedGcloudAccount) env.CLOUDSDK_CORE_ACCOUNT = opts.resolvedGcloudAccount;
    return env;
  },

  // Called after all retries fail with quota error. Marks account exhausted,
  // re-resolves to get next account. Returns new opts or null if no fallback.
  switchAccount(opts, stderrTail, brief) {
    const combined = stderrTail.join("\n");
    if (!RETRYABLE_RE.test(combined) && !/RESOURCE_EXHAUSTED|resource.?exhausted/i.test(combined)) return null;

    const currentAccount = opts.resolvedAccount;
    if (!currentAccount) return null;

    const routerPath = join(dirname(new URL(import.meta.url).pathname), "gemini-router.mjs");
    if (!existsSync(routerPath)) return null;

    // Record exhaustion
    try {
      execFileSync(process.execPath, [routerPath, "record-rate-limit", currentAccount], {
        encoding: "utf8", timeout: 3_000,
      });
    } catch { /* non-fatal */ }

    // Re-resolve — router will skip the exhausted account
    const fallbackOpts = { ...opts, resolvedAccount: null, resolvedProject: null, resolvedGcloudAccount: null, _accountOverride: null };
    this.resolveRouting(fallbackOpts, brief);

    if (fallbackOpts.resolvedProject === opts.resolvedProject) return null; // no different account found

    process.stderr.write(`\ngemini-router: quota exhausted on ${currentAccount} → switching to ${fallbackOpts.resolvedAccount} [${fallbackOpts.resolvedProject}]\n`);
    return fallbackOpts;
  },

  buildArgv(opts, _run) {
    const argv = ["-p", STDIN_DIRECTIVE, "--approval-mode", opts.approvalMode, "-o", "json"];
    if (opts.model) argv.push("-m", opts.model);
    if (opts.geminiSandbox) argv.push("-s");
    for (const dir of (opts.include || [])) argv.push("--include-directories", dir);
    return argv;
  },

  buildStdin(brief, _opts) { return brief; },

  extractFinalMessage(raw, _run) {
    const text = raw.trim();
    if (!text) return "";
    try {
      const obj = JSON.parse(text);
      if (typeof obj.response === "string") return obj.response.trim();
      if (obj.error) return `(gemini error) ${JSON.stringify(obj.error)}`;
      return text;
    } catch { return text; }
  },

  extraResultFields(opts) {
    return {
      approvalMode: opts.approvalMode,
      geminiSandbox: opts.geminiSandbox,
      geminiAccount: opts.resolvedAccount ?? null,
      geminiProject: opts.resolvedProject ?? null,
    };
  },

  onStdoutLine() { return null; },
  summaryLabel(version) { return `gemini ${version ?? "?"}`; },
  unavailableStatus: "gemini_unavailable",
  installHint: "Install: npm i -g @google/gemini-cli",
};

// ---------------------------------------------------------------------------
// Backend: MiniMax
// ---------------------------------------------------------------------------

const minimaxBackend = {
  name: "minimax",
  bin: "claude",
  schema: "delegate-team.minimax.result.v1",
  defaultModel: "MiniMax-M3",

  PERMISSION_MODES: new Set(["bypassPermissions", "acceptEdits", "plan"]),
  extraOpts: { permissionMode: "bypassPermissions", envFile: join(homedir(), ".minimax", ".env") },

  parseExtraArgs(opts, arg, next) {
    switch (arg) {
      case "--permission-mode": opts.permissionMode = next(); return true;
      case "--env-file": opts.envFile = resolve(next()); return true;
      default: return false;
    }
  },

  validate(opts) {
    if (opts.readOnly) opts.permissionMode = "plan";
    if (!this.PERMISSION_MODES.has(opts.permissionMode)) {
      fail(`invalid --permission-mode "${opts.permissionMode}" (expected: ${[...this.PERMISSION_MODES].join(", ")})`);
    }
    if (!opts.model) opts.model = this.defaultModel;
  },

  getVersion() {
    try {
      return execFileSync("claude", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
    } catch { return null; }
  },

  buildEnv(opts) {
    const credPath = opts.envFile || join(homedir(), ".minimax", ".env");
    if (!existsSync(credPath)) {
      fail(`MiniMax credential file not found: ${credPath}\n` +
        `Create it with:\n  ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic\n  ANTHROPIC_API_KEY=<your MiniMax key>`);
    }
    const cred = loadDotenv(credPath) || {};
    if (!cred.ANTHROPIC_API_KEY) fail(`${credPath} has no ANTHROPIC_API_KEY`);
    if (!cred.ANTHROPIC_BASE_URL) cred.ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
    return { ...process.env, ...cred };
  },

  buildArgv(opts, _run) {
    return ["-p", "--bare", "--output-format", "json", "--permission-mode", opts.permissionMode, "--model", opts.model];
  },

  buildStdin(brief, _opts) { return brief + STDIN_DIRECTIVE; },

  extractFinalMessage(raw, _run) {
    const text = raw.trim();
    if (!text) return "";
    try {
      const obj = JSON.parse(text);
      if (typeof obj.result === "string") return obj.result.trim();
      if (obj.error) return `(claude error) ${JSON.stringify(obj.error)}`;
      return text;
    } catch { return text; }
  },

  extraResultFields(opts) {
    return { permissionMode: opts.permissionMode, backend: "minimax (anthropic-compatible)" };
  },

  onStdoutLine() { return null; },
  summaryLabel(version) { return `minimax · claude ${version ?? "?"}`; },
  unavailableStatus: "minimax_unavailable",
  installHint: "Install: npm i -g @anthropic-ai/claude-code",
};

// ---------------------------------------------------------------------------
// Backend: OpenRouter (via opencode)
// ---------------------------------------------------------------------------

const openrouterBackend = {
  name: "openrouter",
  bin: "opencode",
  schema: "delegate-team.openrouter.result.v1",
  defaultModel: "openrouter/anthropic/claude-sonnet-latest",

  extraOpts: {},

  parseExtraArgs() { return false; },

  validate(opts) {
    if (!opts.model) opts.model = this.defaultModel;
  },

  getVersion() {
    try {
      return execFileSync("opencode", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
    } catch { return null; }
  },

  buildEnv(opts) {
    const orEnv = loadDotenv(join(homedir(), ".openrouter", ".env")) || {};
    return { ...process.env, ...orEnv };
  },

  buildArgv(opts, _run) {
    const model = opts.model.includes("/") ? opts.model : `openrouter/${opts.model}`;
    return ["run", "--pure", "-m", model, "--format", "json"];
  },

  buildStdin(brief, opts) {
    return brief + (opts.readOnly ? READONLY_SUFFIX : STDIN_DIRECTIVE);
  },

  extractFinalMessage(raw, _run) {
    const text = raw.trim();
    if (!text) return "";
    let last = "";
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s.startsWith("{")) continue;
      try {
        const ev = JSON.parse(s);
        const part = ev.text ?? ev.content ?? (ev.part && ev.part.text) ?? (ev.message && ev.message.text);
        if (typeof part === "string" && part.trim()) last = part.trim();
      } catch { /* skip */ }
    }
    return last || text.slice(-4000);
  },

  extraResultFields(opts) {
    return { readOnly: opts.readOnly, backend: "openrouter (via opencode)" };
  },

  onStdoutLine() { return null; },
  summaryLabel(version) { return `openrouter · opencode ${version ?? "?"}`; },
  unavailableStatus: "opencode_unavailable",
  installHint: "Install: npm i -g opencode-ai",
};

// ---------------------------------------------------------------------------
// Backend: OpenCode-go (via opencode CLI, opencode-go/* models)
// ---------------------------------------------------------------------------

const opencodeBackend = {
  name: "opencode",
  bin: "opencode",
  schema: "delegate-team.opencode.result.v1",
  defaultModel: "opencode-go/deepseek-v4-pro",

  extraOpts: {},

  parseExtraArgs() { return false; },

  validate(_opts) {
    // model set by resolveRouting() — do NOT set defaultModel here or router is skipped
  },

  getVersion() {
    try {
      return execFileSync("opencode", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
    } catch { return null; }
  },

  // Called by dispatch() before buildArgv. Sets opts.model via smart router.
  // Note: validate() must NOT set defaultModel — let router decide, fall back here.
  resolveRouting(opts, brief) {
    // opts.model only set here if user passed explicit --model flag (contains "/" from argparse)
    if (opts.model && opts.model !== this.defaultModel) return;
    const routerPath = join(dirname(new URL(import.meta.url).pathname), "opencode-router.mjs");
    if (!existsSync(routerPath)) { opts.model = opts.model || this.defaultModel; return; }
    try {
      const raw = execFileSync(process.execPath, [routerPath, "route"], {
        input: brief,
        encoding: "utf8",
        timeout: 8_000,
      });
      const decision = JSON.parse(raw.trim());
      if (decision.model) opts.model = decision.model;
      process.stderr.write(`\nopencode-router → ${decision.reason}\n\n`);
    } catch { opts.model = opts.model || this.defaultModel; }
  },

  buildEnv(_opts) {
    // opencode reads auth from ~/.local/share/opencode/auth.json automatically
    return { ...process.env };
  },

  buildArgv(opts, _run) {
    const model = (opts.model || this.defaultModel).includes("/") ? (opts.model || this.defaultModel) : `opencode-go/${opts.model || this.defaultModel}`;
    return ["run", "--pure", "-m", model, "--format", "json"];
  },

  buildStdin(brief, opts) {
    return brief + (opts.readOnly ? READONLY_SUFFIX : STDIN_DIRECTIVE);
  },

  extractFinalMessage(raw, _run) {
    const text = raw.trim();
    if (!text) return "";
    let last = "";
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s.startsWith("{")) continue;
      try {
        const ev = JSON.parse(s);
        const part = ev.text ?? ev.content ?? (ev.part && ev.part.text) ?? (ev.message && ev.message.text);
        if (typeof part === "string" && part.trim()) last = part.trim();
      } catch { /* skip */ }
    }
    return last || text.slice(-4000);
  },

  extraResultFields(opts) {
    return { readOnly: opts.readOnly, backend: "opencode-go (via opencode)" };
  },

  onStdoutLine() { return null; },
  summaryLabel(version) { return `opencode-go · opencode ${version ?? "?"}`; },
  unavailableStatus: "opencode_unavailable",
  installHint: "Install: npm i -g opencode-ai",
};

// ---------------------------------------------------------------------------
// Backend: VertexCoder (Google Vertex AI interactive agent via Python SDK)
// ---------------------------------------------------------------------------

function getGlobalConfigProject() {
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  const configPath = join(homedir(), ".config", "dt", "config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.project_id) return config.project_id;
    } catch {
      // Ignore
    }
  }
  try {
    const proj = execFileSync("gcloud", ["config", "get-value", "project"], { encoding: "utf8" }).trim();
    if (proj && proj !== "(unset)") return proj;
  } catch {
    // Ignore
  }
  return "";
}

const vertexcoderBackend = {
  name: "vertexcoder",
  get bin() {
    // 1. Try local workspace path
    const workspaceRoot = dirname(dirname(dirname(new URL(import.meta.url).pathname)));
    const workspaceVenv = join(workspaceRoot, "vertex-coder", ".venv", "bin", "python3");
    if (existsSync(workspaceVenv)) return workspaceVenv;

    // 2. Try ~/.config/dt/config.json overrides
    const configPath = join(homedir(), ".config", "dt", "config.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf8"));
        if (config.python_bin && existsSync(config.python_bin)) return config.python_bin;
        if (config.vertex_coder_python && existsSync(config.vertex_coder_python)) return config.vertex_coder_python;
      } catch {
        // ignore
      }
    }

    // 3. Fallback to global skill path
    const globalVenv = join(homedir(), ".agents", "skills", "vertex-coder", ".venv", "bin", "python3");
    if (existsSync(globalVenv)) return globalVenv;

    // 4. Default to standard python3 on path
    return "python3";
  },
  schema: "delegate-team.vertexcoder.result.v1",
  defaultModel: "gemini-3.5-flash",

  extraOpts: {
    vertexProject: null, // Resolved dynamically at runtime
  },


  parseExtraArgs(opts, arg, next) {
    if (arg === "--vertex-project") { opts.vertexProject = next(); return true; }
    return false;
  },

  validate(opts) {
    if (!opts.model) opts.model = this.defaultModel;
  },

  getScriptPath() {
    // 1. Try local workspace path (direct connection in the current project)
    const workspacePath = join(dirname(dirname(dirname(new URL(import.meta.url).pathname))), "vertex-coder", "vertex_interactive_agent.py");
    if (existsSync(workspacePath)) return workspacePath;

    // 2. Try global skill path (with direct scripts)
    const globalPath = join(homedir(), ".agents", "skills", "vertex-coder", "vertex_interactive_agent.py");
    if (existsSync(globalPath)) return globalPath;

    // 3. Fallback to original scripts subfolder
    return join(homedir(), ".agents", "skills", "vertex-coder", "scripts", "vertex_interactive_agent.py");
  },

  getVersion() {
    const scriptPath = this.getScriptPath();
    if (!existsSync(scriptPath)) return null;
    try {
      return execFileSync(this.bin, ["--version"], { encoding: "utf8" }).trim();
    } catch { return null; }
  },

  // Uses opencode-router scoring engine (no account state) to pick model tier.
  // score > 5 → gemini-3.1-pro (deep reasoning), else → gemini-3.5-flash (fast)
  resolveRouting(opts, brief) {
    if (opts.model && opts.model !== this.defaultModel) return;
    const routerPath = join(dirname(new URL(import.meta.url).pathname), "opencode-router.mjs");
    if (!existsSync(routerPath)) { opts.model = opts.model || this.defaultModel; return; }
    try {
      const raw = execFileSync(process.execPath, [routerPath, "route"], {
        input: brief, encoding: "utf8", timeout: 8_000,
      });
      const decision = JSON.parse(raw.trim());
      opts.model = decision.score > 5 ? "gemini-3.1-pro" : "gemini-3.5-flash";
      process.stderr.write(`\nvertexcoder-router → score=${decision.score} → ${opts.model}\n\n`);
    } catch { opts.model = opts.model || this.defaultModel; }
  },

  buildEnv(opts) {
    return {
      ...process.env,
      VERTEX_CODER_PROJECT: opts.vertexProject || getGlobalConfigProject(),
      VERTEX_CODER_LOCATION: "global",
    };
  },

  buildArgv(opts, _run) {
    const scriptPath = this.getScriptPath();
    return [scriptPath, "-", opts.model || this.defaultModel];
  },

  buildStdin(brief, opts) {
    return brief + (opts.readOnly ? READONLY_SUFFIX : STDIN_DIRECTIVE);
  },

  extractFinalMessage(raw, _run) {
    const text = raw.trim();
    if (!text) return "";
    // Extract final agent response — appears after "Final Response from Agent:"
    const marker = "🤖 Final Response from Agent:";
    const idx = text.lastIndexOf(marker);
    if (idx !== -1) return text.slice(idx + marker.length).trim();
    return text.slice(-4000);
  },

  extraResultFields(opts) {
    return { vertexProject: opts.vertexProject, backend: "vertexcoder (Vertex AI Python SDK)" };
  },

  onStdoutLine(line) {
    // Echo tool execution lines to stderr for visibility
    if (line.startsWith("[Tool Execution]")) process.stderr.write(`  ${line}\n`);
    return null;
  },

  summaryLabel(version) { return `vertexcoder · ${version ?? "python?"}`; },
  unavailableStatus: "vertexcoder_unavailable",
  get installHint() {
    return `Requires: vertex-coder virtual environment (run \`dt setup\` to create) or python3 with google-genai, google-cloud-aiplatform, and google-genai[dialogflow] installed.`;
  },
};

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

const BACKENDS = {
  codex: codexBackend,
  gemini: geminiBackend,
  minimax: minimaxBackend,
  openrouter: openrouterBackend,
  opencode: opencodeBackend,
  vertexcoder: vertexcoderBackend,
};

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  // Early help check (before --backend is required)
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(headerComment());
    process.exit(0);
  }

  const opts = {
    backend: null,
    brief: null,
    cd: process.cwd(),
    model: null,
    readOnly: false,
    outDir: null,
    maxRetries: 4,
    retryBaseMs: 20000,
  };

  // First pass: find --backend to know which extra opts to merge
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--backend" && argv[i + 1]) {
      opts.backend = argv[i + 1];
      break;
    }
  }

  if (!opts.backend) {
    // Check if first positional arg is a backend name
    if (argv[0] && !argv[0].startsWith("-") && BACKENDS[argv[0]]) {
      opts.backend = argv[0];
      argv = argv.slice(1);
    }
  }

  if (!opts.backend) fail(`--backend required (${Object.keys(BACKENDS).join(", ")})`);
  const be = BACKENDS[opts.backend];
  if (!be) fail(`unknown backend "${opts.backend}" (expected: ${Object.keys(BACKENDS).join(", ")})`);

  // Merge backend's extra defaults
  Object.assign(opts, JSON.parse(JSON.stringify(be.extraOpts || {})));

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) fail(`${arg} requires a value`);
      i += 1;
      return v;
    };
    switch (arg) {
      case "--backend": next(); break; // already consumed
      case "--brief": opts.brief = next(); break;
      case "--cd": opts.cd = resolve(next()); break;
      case "--model": opts.model = next(); break;
      case "--read-only": opts.readOnly = true; break;
      case "--out-dir": opts.outDir = resolve(next()); break;
      case "--max-retries": {
        const n = parseInt(next(), 10);
        if (Number.isNaN(n) || n < 0) fail("--max-retries requires a non-negative integer");
        opts.maxRetries = n;
        break;
      }
      case "--retry-base-ms": {
        const n = parseInt(next(), 10);
        if (Number.isNaN(n) || n < 0) fail("--retry-base-ms requires a non-negative integer");
        opts.retryBaseMs = n;
        break;
      }
      default:
        if (!be.parseExtraArgs(opts, arg, next)) {
          fail(`unknown option: ${arg}`);
        }
    }
  }

  be.validate(opts);
  return opts;
}

function headerComment() {
  const src = readFileSync(new URL(import.meta.url), "utf8");
  const match = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!match) return "relay.mjs — unified multi-backend dispatch\n";
  return match[1].replace(/^\s*\* ?/gm, "").trim() + "\n";
}

// ---------------------------------------------------------------------------
// Unified dispatch
// ---------------------------------------------------------------------------

function runOnce(be, opts, stdinData, env, run) {
  return new Promise((resolveRun) => {
    const argv = be.buildArgv(opts, run);
    const child = spawn(be.bin, argv, {
      cwd: opts.cd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env,
    });

    let stdoutBuf = "";
    const stderrTail = [];
    let extra = {};

    let watchdogTimer = null;
    let silentCount = 0;

    const resetWatchdog = () => {
      silentCount = 0;
    };

    const clearWatchdog = () => {
      if (watchdogTimer) clearInterval(watchdogTimer);
    };

    watchdogTimer = setInterval(() => {
      silentCount++;
      if (silentCount >= 2) {
        process.stderr.write(`\\nrelay: watchdog triggered (120s silent). Killing process...\\n`);
        child.kill("SIGKILL");
        clearWatchdog();
      }
    }, 60000);

    child.stdout.on("data", (chunk) => {
      resetWatchdog();
      const text = chunk.toString();
      stdoutBuf += text;
      if (be.onStdoutLine) {
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          appendFileSync(run.eventsPath, `${line}\n`, "utf8");
          const tid = be.onStdoutLine(line);
          if (tid) extra.threadId = tid;
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      resetWatchdog();
      const text = chunk.toString();
      process.stderr.write(text);
      for (const line of text.split("\n")) {
        if (line.trim()) stderrTail.push(line.trimEnd());
      }
      while (stderrTail.length > 20) stderrTail.shift();
    });

    child.on("error", (err) => {
      clearWatchdog();
      resolveRun({ code: 1, stdoutBuf, stderrTail, extra, spawnError: String(err?.message ?? err) });
    });

    child.on("close", (code) => {
      clearWatchdog();
      resolveRun({ code: code === null ? 1 : code, stdoutBuf, stderrTail, extra });
    });

    child.stdin.on("error", () => {});
    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

async function dispatch(be, opts, brief, run) {
  // Resolve routing (model + account) before building env/argv
  if (be.resolveRouting) be.resolveRouting(opts, brief);

  const version = be.getVersion();

  const makeResult = (extra) => {
    const result = {
      schema: be.schema,
      backend: be.name,
      workdir: opts.cd,
      model: opts.model,
      cliVersion: version,
      startedAt: run.startedAt,
      finishedAt: new Date().toISOString(),
      briefPath: run.briefPath,
      eventsPath: run.eventsPath,
      finalPath: existsSync(run.finalPath) ? run.finalPath : null,
      ...be.extraResultFields(opts),
      ...extra,
    };
    writeFileSync(run.resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  };

  if (!version) {
    const result = makeResult({ status: be.unavailableStatus, exitCode: 127, finalMessage: "", touchedFiles: [] });
    printSummary(result, run.resultPath, be.summaryLabel(version));
    process.stderr.write(`relay: \`${be.bin}\` not found on PATH. ${be.installHint}\n`);
    process.exit(127);
  }

  const env = be.buildEnv(opts);
  const stdinData = be.buildStdin(brief, opts);
  const maxAttempts = Math.max(1, opts.maxRetries + 1);

  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await runOnce(be, opts, stdinData, env, run);

    if (last.spawnError) {
      const result = makeResult({ status: "failed", exitCode: 1, finalMessage: "", touchedFiles: gitTouchedFiles(opts.cd), error: last.spawnError, ...last.extra });
      printSummary(result, run.resultPath, be.summaryLabel(version));
      process.exit(1);
    }

    if (last.code === 0) break;

    if (attempt < maxAttempts && isRetryable(last.stdoutBuf, last.stderrTail)) {
      const waitMs = opts.retryBaseMs * 2 ** (attempt - 1);
      process.stderr.write(`\nrelay: ${be.name} hit transient 429/rate-limit. auto-retry ${attempt}/${maxAttempts - 1} in ${Math.round(waitMs / 1000)}s…\n`);
      await sleep(waitMs);
      continue;
    }
    break;
  }

  // ── Account auto-switch on credit exhaustion ─────────────────────────────
  // After all retries failed, check if the failure is due to credit/quota exhaustion.
  // If yes: record it, re-route to the fallback account, try one more time.
  if (last.code !== 0 && be.switchAccount && !opts._accountSwitched) {
    const fallbackOpts = be.switchAccount(opts, last.stderrTail, brief);
    if (fallbackOpts) {
      fallbackOpts._accountSwitched = true; // prevent infinite switch loop
      const fallbackEnv = be.buildEnv(fallbackOpts);
      const fallbackStdin = be.buildStdin(brief, fallbackOpts);
      const fallbackId = fallbackOpts.resolvedCodexHome ?? fallbackOpts.resolvedProject ?? fallbackOpts.resolvedAccount ?? "fallback";
      process.stderr.write(`\nrelay: account credit exhausted → switching to fallback account (${fallbackId})\n`);
      const switched = await runOnce(be, fallbackOpts, fallbackStdin, fallbackEnv, run);
      if (switched.code === 0) {
        last = switched;
        Object.assign(opts, fallbackOpts); // update opts so makeResult reflects new account
      }
    }
  }

  writeFileSync(run.finalPath, last.stdoutBuf, "utf8");
  if (!be.onStdoutLine) appendFileSync(run.eventsPath, last.stdoutBuf, "utf8");
  const finalMessage = be.extractFinalMessage(last.stdoutBuf, run);
  
  let touchedFiles = gitTouchedFiles(opts.cd);
  let status = last.code === 0 ? "completed" : "failed";
  if (last.code === 0 && touchedFiles && touchedFiles.length === 0) {
    status = "failed"; // Dud detection
    last.code = 1; // Make sure the script reflects the failure
  }

  const result = makeResult({
    status: status,
    exitCode: last.code,
    finalMessage,
    touchedFiles: touchedFiles,
    ...(last.code === 0 ? {} : { stderrTail: last.stderrTail.slice(-20) }),
    ...last.extra,
  });
  printSummary(result, run.resultPath, be.summaryLabel(version));
  process.exit(result.exitCode);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const be = BACKENDS[opts.backend];
  const brief = readBrief(opts);
  if (!brief.trim()) fail("empty brief (pass --brief <file> or pipe the brief on stdin)");

  const run = prepareRunDir(opts, brief, be.name);
  dispatch(be, opts, brief, run).catch((err) => {
    process.stderr.write(`relay: unexpected error — ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}

main();
