#!/usr/bin/env node
/**
 * gemini-router.mjs — Smart multi-account Gemini task router
 *
 * Routing logic:
 *   score > 0  → gemini-3.1-pro-preview-customtools  (complex / reasoning)
 *   score ≤ 0  → gemini-3.5-flash                    (quick tasks)
 *
 *   Account selection is sequential by quota availability:
 *     Walk accounts in order → first non-rate-limited wins
 *     On 429: mark account exhausted (20h TTL) → next dispatch uses next account
 *
 *   Switching is done via CLOUDSDK_CORE_ACCOUNT + GOOGLE_CLOUD_PROJECT env vars —
 *   no global gcloud config change, no re-auth needed.
 *
 * CLI:
 *   node gemini-router.mjs status                   # account health + dispatch stats
 *   node gemini-router.mjs route                    # stdin brief → routing JSON
 *   node gemini-router.mjs reset                    # reset counters + rate limits
 *   node gemini-router.mjs record-rate-limit <acc>  # mark account quota-exhausted
 *   node gemini-router.mjs record-success <acc>     # clear rate limit
 *   node gemini-router.mjs test                     # run sample briefs
 *
 * Used by relay.mjs via execFileSync — pure Node built-ins, no deps.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Account Registry ────────────────────────────────────────────────────────
// Order matters: index 0 = primary (lowest index = highest priority).
// Each account uses its own GCP project → independent quota pool.
// Auth via CLOUDSDK_CORE_ACCOUNT — no global gcloud switch needed.

const DEFAULT_ACCOUNTS = [];

function loadAccounts() {
  const configPath = join(homedir(), ".config", "dt", "config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.gemini_accounts && Array.isArray(config.gemini_accounts)) {
        return config.gemini_accounts;
      }
    } catch {
      // Ignore
    }
  }
  return DEFAULT_ACCOUNTS;
}

const ACCOUNTS = loadAccounts().length > 0 ? loadAccounts() : [
  {
    name: "default",
    email: "",
    project: "",
  }
];

// ─── Model Tiers ─────────────────────────────────────────────────────────────

const TIERS = {
  complex: {
    slug: "gemini-3.1-pro-preview-customtools",
    label: "Gemini 3.1 Pro Custom Tools — deep reasoning + custom tools",
  },
  quick: {
    slug: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash — fast execution",
  },
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
  if      (brief.length > 1500) s += 5;
  else if (brief.length >  800) s += 3;
  else if (brief.length >  400) s += 1;
  else if (brief.length <  200) s -= 3;
  else if (brief.length <  300) s -= 1;
  const filesBlock = brief.match(/^FILES:([\s\S]*?)(?=^[A-Z]+:|^$)/m)?.[1] ?? "";
  const fileCount = filesBlock.split("\n").filter(l => l.trim()).length;
  if      (fileCount >= 6) s += 4;
  else if (fileCount >= 4) s += 2;
  else if (fileCount >= 2) s += 1;
  else if (fileCount === 1) s -= 1;
  const verb = (brief.match(/^TASK\s+\S+:\s*(\w+)/mi)?.[1] ?? "").toLowerCase();
  if (["architect","implement","build","design","refactor","migrate","debug","investigate","optimize","audit","analyze"].some(v => verb.startsWith(v))) s += 3;
  if (["fix","update","add","remove","delete","change","rename","format","bump","patch"].some(v => verb.startsWith(v))) s -= 2;
  const gates = (brief.match(/^GATES:([\s\S]*?)(?=^[A-Z]+:|^$)/m)?.[1] ?? "").split(";").filter(g => g.trim()).length;
  if (gates >= 4) s += 3;
  else if (gates >= 2) s += 1;
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

const STATE_PATH = join(homedir(), ".gemini-delegate-router-state.json");
const QUOTA_TTL_MS = 20 * 3600 * 1000; // 20h

function makeInitialState() {
  return {
    version: 1,
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

function isRateLimited(account, state) {
  const until = state.accounts[account.name]?.rateLimitUntil;
  if (!until) return false;
  return Date.now() < new Date(until).getTime();
}

function selectAccount(state, accountOverride) {
  if (accountOverride) {
    return ACCOUNTS.find(a => a.name === accountOverride) ?? ACCOUNTS[0];
  }
  const ready = ACCOUNTS.find(a => !isRateLimited(a, state));
  return ready ?? ACCOUNTS[0]; // all exhausted → wrap around to primary
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
    modelLabel: tier.label,
    account: account.name,
    accountEmail: account.email,
    project: account.project,
    gcloudAccount: account.email,
    reason: `score=${score} → ${taskTier} → ${tier.slug} via ${account.name} [${account.project}]`,
    hits: hits.filter(h => h.delta !== 0),
  };
}

// ─── Rate limit / success recording ──────────────────────────────────────────

export function recordRateLimit(accountName) {
  const state = loadState();
  const s = state.accounts[accountName];
  if (s) {
    s.rateLimitUntil = new Date(Date.now() + QUOTA_TTL_MS).toISOString();
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
      project: a.project,
      dispatches: s.dispatches ?? 0,
      failures: s.failures ?? 0,
      lastUsedAt: s.lastUsedAt ?? null,
      rateLimited: rl,
      rateLimitUntil: rl ? s.rateLimitUntil : null,
    };
  });
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "status") {
    const rows = getRouterStatus();
    const available = rows.filter(r => !r.rateLimited).length;
    process.stdout.write(`\n=== Gemini Router — Account Status (${available}/${rows.length} available) ===\n`);
    process.stdout.write("  Walk order: index 0 → 7. First non-rate-limited wins.\n\n");
    for (const r of rows) {
      const rl = r.rateLimited ? ` ⚠ QUOTA EXHAUSTED until ${r.rateLimitUntil}` : " ✓ quota available";
      process.stdout.write(`  [${String(r.priority).padStart(2)}] ${r.name.padEnd(20)} <${r.email}>\n`);
      process.stdout.write(`       project: ${r.project}\n`);
      process.stdout.write(`       quota:  ${rl}\n`);
      process.stdout.write(`       dispatches: ${r.dispatches}  failures: ${r.failures}  last: ${r.lastUsedAt ?? "never"}\n\n`);
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
    process.stdout.write(`Recorded quota exhaustion for '${arg}'. Clears in 20h.\n`);
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
    process.stdout.write("Router state reset.\n");
    process.exit(0);
  }

  if (cmd === "test") {
    const cases = [
      { label: "complex: refactor auth",  text: "TASK refactor-auth: Refactor authentication system\nFILES:\n  src/auth/middleware.ts\n  src/auth/jwt.ts\n  src/auth/session.ts\nGATES: jest --testPathPattern=auth; npm run build" },
      { label: "quick: fix typo",         text: "TASK fix-typo: fix typo\nFILES: src/config.ts\nGATES: tsc --noEmit" },
    ];
    process.stdout.write("\n=== Gemini Router Test ===\n\n");
    for (const { label, text } of cases) {
      const { score, taskTier, model, account, project, reason } = routeTask(text, {});
      process.stdout.write(`  "${label}"\n  score=${score}  tier=${taskTier}  model=${model}\n  account=${account}  project=${project}\n  ${reason}\n\n`);
    }
    process.exit(0);
  }

  process.stderr.write("Usage: node gemini-router.mjs <status|route|reset|record-rate-limit|record-success|test>\n");
  process.exit(1);
}
