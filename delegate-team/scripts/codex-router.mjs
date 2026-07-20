#!/usr/bin/env node
/**
 * codex-router.mjs — Smart multi-account Codex task router
 *
 * Routing logic:
 *   Both accounts handle ALL task types.
 *   Model is selected by task complexity (independent of account):
 *     score > 0  → gpt-5.5 · high  (complex / thinking tasks)
 *     score ≤ 0  → gpt-5.4 · high  (quick tasks)
 *
 *   Account selection is sequential by credit availability:
 *     Account 1 (primary)   → used by default
 *     Account 2 (secondary) → auto-switched when Account 1 exhausts daily credits
 *
 * CLI:
 *   node codex-router.mjs status                  # account health + dispatch stats
 *   node codex-router.mjs route                   # stdin brief → routing JSON
 *   node codex-router.mjs reset                   # reset counters + rate limits
 *   node codex-router.mjs record-rate-limit <acc> # mark account as credit-exhausted
 *   node codex-router.mjs record-success <acc>    # clear rate limit on account
 *   node codex-router.mjs login-guide             # 2nd account setup instructions
 *   node codex-router.mjs test                    # run sample briefs
 *
 * Used by relay.mjs via execFileSync — pure Node built-ins, no deps.
 */

import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// ─── Account Registry ────────────────────────────────────────────────────────
// Order matters: index 0 = primary, index 1 = fallback.
// Both accounts run any model — switching is purely credit-availability driven.

const DEFAULT_ACCOUNTS = [];

function loadAccounts() {
  const configPath = join(homedir(), ".config", "dt", "config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.codex_accounts && Array.isArray(config.codex_accounts)) {
        return config.codex_accounts;
      }
    } catch {
      // Ignore
    }
  }
  return DEFAULT_ACCOUNTS;
}

const ACCOUNTS = loadAccounts().length > 0 ? loadAccounts() : [
  {
    name: "main",
    email: "",
    codexHome: join(homedir(), ".codex-delegate"),
  }
];

// ─── Model Tiers (same for every account) ────────────────────────────────────

const TIERS = {
  complex: { slug: "gpt-5.5", reasoningEffort: "high", label: "GPT-5.5 · high — deep reasoning" },
  quick:   { slug: "gpt-5.4", reasoningEffort: "high", label: "GPT-5.4 · high — fast execution"  },
};

// ─── Complexity Signals ───────────────────────────────────────────────────────

const KEYWORD_SIGNALS = [
  // ── Complex (+) ──────────────────────────────────────────────────────────
  { re: /\b(architect|architecture|system design|design system|scalab)\b/i,           w:  4 },
  { re: /\b(analyze|analysis|investigate|diagnose|root cause|trace|profile)\b/i,      w:  3 },
  { re: /\b(refactor|redesign|migrate|migration|implement feature|build system)\b/i,  w:  3 },
  { re: /\b(security|audit|vulnerability|perf(ormance)?|optimiz|benchmark)\b/i,       w:  2 },
  { re: /\b(multi.step|comprehensive|end.to.end|pipeline|workflow|orchestrat)\b/i,    w:  2 },
  { re: /\b(research|strateg|evaluate|review|assess|plan)\b/i,                        w:  2 },
  { re: /\b(debug|root.cause|intermittent|flak|race condition|deadlock)\b/i,           w:  3 },
  // ── Quick (−) ────────────────────────────────────────────────────────────
  { re: /\b(typo|typos|hotfix|one.line|trivial|minor fix|quick fix)\b/i,              w: -4 },
  { re: /\b(bump version|version bump|rename|rename file|move file)\b/i,              w: -3 },
  { re: /\b(format|lint|prettier|eslint|clean.?up|whitespace|style fix)\b/i,          w: -3 },
  { re: /\b(add import|remove import|delete file|add constant|add comment)\b/i,       w: -2 },
  { re: /\b(patch|tweak|adjust|swap|replace string|update config)\b/i,                w: -2 },
];

function structuralScore(brief) {
  let s = 0;
  // Length
  if      (brief.length > 1500) s += 5;
  else if (brief.length >  800) s += 3;
  else if (brief.length >  400) s += 1;
  else if (brief.length <  200) s -= 3;
  else if (brief.length <  300) s -= 1;
  // File count
  const filesBlock = brief.match(/^FILES:([\s\S]*?)(?=^[A-Z]+:|^$)/m)?.[1] ?? "";
  const fileCount = filesBlock.split("\n").filter(l => l.trim()).length;
  if      (fileCount >= 6) s += 4;
  else if (fileCount >= 4) s += 2;
  else if (fileCount >= 2) s += 1;
  else if (fileCount === 1) s -= 1;
  // TASK verb
  const verb = (brief.match(/^TASK\s+\S+:\s*(\w+)/mi)?.[1] ?? "").toLowerCase();
  if (["architect","implement","build","design","refactor","migrate","debug","investigate","optimize","audit","analyze"].some(v => verb.startsWith(v))) s += 3;
  if (["fix","update","add","remove","delete","change","rename","format","bump","patch"].some(v => verb.startsWith(v))) s -= 2;
  // Gate count
  const gates = (brief.match(/^GATES:([\s\S]*?)(?=^[A-Z]+:|^$)/m)?.[1] ?? "").split(";").filter(g => g.trim()).length;
  if (gates >= 4) s += 3;
  else if (gates >= 2) s += 1;
  // CHANGE density
  const changeLines = (brief.match(/^CHANGE:([\s\S]*?)(?=^[A-Z]+:|^$)/m)?.[1] ?? "").split("\n").filter(l => l.trim()).length;
  if (changeLines > 15) s += 2;
  else if (changeLines > 8) s += 1;
  return s;
}

export function scoreTask(brief) {
  let score = 0;
  const hits = [];
  for (const { re, w } of KEYWORD_SIGNALS) {
    const count = (brief.match(new RegExp(re.source, re.flags + "g")) ?? []).length;
    if (count > 0) { score += count * w; hits.push({ signal: re.source.slice(0,40), count, delta: count * w }); }
  }
  const structDelta = structuralScore(brief);
  score += structDelta;
  hits.push({ signal: "structural", count: 1, delta: structDelta });
  return { score, hits };
}

// ─── State ────────────────────────────────────────────────────────────────────

const STATE_PATH = join(homedir(), ".codex-delegate-router-state.json");

function makeInitialState() {
  return {
    version: 2,
    accounts: Object.fromEntries(ACCOUNTS.map(a => [
      a.name,
      { dispatches: 0, lastUsedAt: null, failures: 0, rateLimitUntil: null }
    ])),
  };
}

function loadState() {
  if (!existsSync(STATE_PATH)) return makeInitialState();
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); }
  catch { return makeInitialState(); }
}

function saveState(state) {
  try { writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8"); }
  catch { /* non-fatal */ }
}

// ─── Account helpers ──────────────────────────────────────────────────────────

const CREDIT_EXHAUSTION_TTL_MS = 20 * 3600 * 1000; // 20h — reset well before next day

function isRateLimited(account, state) {
  const until = state.accounts[account.name]?.rateLimitUntil;
  if (!until) return false;
  return Date.now() < new Date(until).getTime();
}

function isAuthenticated(account) {
  return existsSync(join(account.codexHome, "auth.json"));
}

function isConfigured(account) {
  return existsSync(join(account.codexHome, "config.toml"));
}

function isReady(account, state) {
  return isConfigured(account) && isAuthenticated(account) && !isRateLimited(account, state);
}

// ─── Account selection — sequential, credit-driven ───────────────────────────
// Walk accounts in order (primary first). Use first ready account.
// Falls back to any configured account if all rate-limited.

function selectAccount(state, accountOverride) {
  if (accountOverride) {
    return ACCOUNTS.find(a => a.name === accountOverride) ?? ACCOUNTS[0];
  }
  // First ready account (respects primary → secondary order)
  const ready = ACCOUNTS.find(a => isReady(a, state));
  if (ready) return ready;
  // All rate-limited — try any configured + authenticated account
  const fallback = ACCOUNTS.find(a => isConfigured(a) && isAuthenticated(a));
  return fallback ?? ACCOUNTS[0];
}

// ─── Main route function ──────────────────────────────────────────────────────

export function routeTask(brief, opts = {}) {
  const state = loadState();
  const { score, hits } = scoreTask(brief);
  const taskTier = score > 0 ? "complex" : "quick";
  const tier = TIERS[taskTier];
  const account = selectAccount(state, opts.account ?? null);

  // Record dispatch
  const s = state.accounts[account.name];
  if (s) { s.dispatches = (s.dispatches ?? 0) + 1; s.lastUsedAt = new Date().toISOString(); }
  saveState(state);

  return {
    taskTier,
    score,
    model: tier.slug,
    reasoningEffort: tier.reasoningEffort,
    modelLabel: tier.label,
    account: account.name,
    accountEmail: account.email,
    codexHome: account.codexHome,
    reason: `score=${score} → ${taskTier} → ${tier.slug} · high via ${account.name} (${account.email})`,
    hits: hits.filter(h => h.delta !== 0),
  };
}

// ─── Rate limit / success recording ──────────────────────────────────────────

export function recordRateLimit(accountName) {
  const state = loadState();
  const s = state.accounts[accountName];
  if (s) {
    s.rateLimitUntil = new Date(Date.now() + CREDIT_EXHAUSTION_TTL_MS).toISOString();
    s.failures = (s.failures ?? 0) + 1;
    saveState(state);
  }
}

export function recordSuccess(accountName) {
  const state = loadState();
  const s = state.accounts[accountName];
  if (s) { s.rateLimitUntil = null; saveState(state); }
}

// ─── Status report ────────────────────────────────────────────────────────────

export function getRouterStatus() {
  const state = loadState();
  return ACCOUNTS.map((a, idx) => {
    const s = state.accounts[a.name] ?? {};
    const rl = isRateLimited(a, state);
    return {
      priority: idx + 1,
      name: a.name,
      email: a.email,
      codexHome: a.codexHome,
      configured: isConfigured(a),
      authenticated: isAuthenticated(a),
      dispatches: s.dispatches ?? 0,
      failures: s.failures ?? 0,
      lastUsedAt: s.lastUsedAt ?? null,
      rateLimited: rl,
      rateLimitUntil: rl ? s.rateLimitUntil : null,
    };
  });
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "status") {
    const rows = getRouterStatus();
    process.stdout.write("\n=== Codex Router — Account Status ===\n");
    process.stdout.write("  Both accounts handle ALL tasks. Model picked by complexity.\n");
    process.stdout.write("  gpt-5.5·high = complex   gpt-5.4·high = quick\n\n");
    for (const r of rows) {
      const role    = r.priority === 1 ? "PRIMARY  " : "FALLBACK ";
      const auth    = r.authenticated ? "✓ auth" : "✗ NOT logged in";
      const cfg     = r.configured    ? "✓ config" : "✗ no config";
      const rl      = r.rateLimited   ? ` ⚠ CREDIT EXHAUSTED until ${r.rateLimitUntil}` : " ✓ credits available";
      process.stdout.write(`  [${role}] ${r.name}  <${r.email}>\n`);
      process.stdout.write(`    auth:       ${auth}\n`);
      process.stdout.write(`    config:     ${cfg}\n`);
      process.stdout.write(`    credits:   ${rl}\n`);
      process.stdout.write(`    dispatches: ${r.dispatches}  failures: ${r.failures}\n`);
      process.stdout.write(`    last used:  ${r.lastUsedAt ?? "never"}\n`);
      if (!r.authenticated) {
        process.stdout.write(`    → CODEX_HOME=${r.codexHome} codex login\n`);
      }
      process.stdout.write("\n");
    }
    process.exit(0);
  }

  if (cmd === "route") {
    let brief = readFileSync(0, "utf8");
    let accountOverride = null;
    if (brief.startsWith("__ACCOUNT_OVERRIDE__:")) {
      const nl = brief.indexOf("\n");
      accountOverride = brief.slice("__ACCOUNT_OVERRIDE__:".length, nl).trim();
      brief = brief.slice(nl + 1);
    }
    const decision = routeTask(brief, { account: accountOverride });
    process.stdout.write(JSON.stringify(decision));
    process.exit(0);
  }

  if (cmd === "record-rate-limit") {
    if (!arg) { process.stderr.write("Usage: record-rate-limit <account-name>\n"); process.exit(1); }
    recordRateLimit(arg);
    process.stdout.write(`Recorded credit exhaustion for '${arg}'. Auto-clears in 20h.\n`);
    process.exit(0);
  }

  if (cmd === "record-success") {
    if (!arg) { process.stderr.write("Usage: record-success <account-name>\n"); process.exit(1); }
    recordSuccess(arg);
    process.stdout.write(`Cleared rate limit for '${arg}'.\n`);
    process.exit(0);
  }

  if (cmd === "reset") {
    writeFileSync(STATE_PATH, JSON.stringify(makeInitialState(), null, 2), "utf8");
    process.stdout.write("Router state reset (counters + rate limits cleared).\n");
    process.exit(0);
  }

  if (cmd === "login-guide") {
    const secondary = ACCOUNTS[1];
    process.stdout.write(`
=== Second Account Login ===

Account: ${secondary.email}
Config:  ${secondary.codexHome}

Steps (in an INTERACTIVE terminal):
  1.  mkdir -p ${secondary.codexHome}
  2.  CODEX_HOME=${secondary.codexHome} codex login
  3.  Browser opens → sign in with ${secondary.email} via Google OAuth
  4.  Verify: CODEX_HOME=${secondary.codexHome} codex --version
  5.  Check:  node ${process.argv[1]} status

Router auto-switches to this account when Account 1 exhausts daily credits.
`);
    process.exit(0);
  }

  if (cmd === "test") {
    const cases = [
      { label: "complex: refactor auth",  text: "TASK refactor-auth: Refactor authentication system\nWHY: Security audit found JWT issues\nFILES:\n  src/auth/middleware.ts\n  src/auth/jwt.ts\n  src/auth/session.ts\n  src/auth/oauth.ts\n  src/auth/guards.ts\n  tests/auth.test.ts\nCHANGE:\n  Redesign token rotation, add PKCE flow, migrate to httpOnly cookies, add refresh logic\nGATES: jest --testPathPattern=auth; npm run build; npm run lint" },
      { label: "quick: fix typo",         text: "TASK fix-typo: fix typo in config\nFILES: src/config.ts\nCHANGE:\n  'databse' → 'database'\nGATES: tsc --noEmit" },
      { label: "medium: add endpoint",    text: "TASK add-endpoint: Add GET /health endpoint\nFILES:\n  src/routes/health.ts\n  src/server.ts\nCHANGE:\n  Add health check route returning {status:ok}\nGATES: npm test; npm run build" },
    ];
    process.stdout.write("\n=== Router Test (model routing, same account logic) ===\n\n");
    for (const { label, text } of cases) {
      const { score, taskTier, model, account, reason } = routeTask(text, {});
      process.stdout.write(`  "${label}"\n  score=${score}  tier=${taskTier}  model=${model}  account=${account}\n  ${reason}\n\n`);
    }
    process.exit(0);
  }

  process.stderr.write("Usage: node codex-router.mjs <status|route|reset|record-rate-limit|record-success|login-guide|test>\n");
  process.exit(1);
}
