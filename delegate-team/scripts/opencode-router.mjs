#!/usr/bin/env node
/**
 * opencode-router.mjs — Smart opencode-go model router
 *
 * Routing logic:
 *   score > 5   → opencode-go/kimi-k2.7-code    (complex coding / architecture)
 *   score 1–5   → opencode-go/qwen3.7-plus       (medium tasks)
 *   score ≤ 0   → opencode-go/deepseek-v4-flash  (quick tasks)
 *
 * CLI:
 *   node opencode-router.mjs status   # model config
 *   node opencode-router.mjs route    # stdin brief → routing JSON
 *   node opencode-router.mjs test     # run sample briefs
 *
 * Used by relay.mjs via execFileSync — pure Node built-ins, no deps.
 */

import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Model Tiers ─────────────────────────────────────────────────────────────
//
//  score > 10  → max      qwen3.7-max       (architecture, deep reasoning)
//  score 5–10  → complex  kimi-k2.7-code    (coding specialist)
//  score 0–4   → medium   deepseek-v4-pro   (balanced pro tasks)
//  score < 0   → quick    glm-5.2           (fast execution)

const TIERS = {
  max: {
    slug: "opencode-go/qwen3.7-max",
    label: "Qwen 3.7 Max — deep architecture + reasoning",
  },
  complex: {
    slug: "opencode-go/kimi-k2.7-code",
    label: "Kimi K2.7 Code — specialized coding",
  },
  medium: {
    slug: "opencode-go/deepseek-v4-pro",
    label: "DeepSeek V4 Pro — balanced pro tasks",
  },
  quick: {
    slug: "opencode-go/glm-5.1",
    label: "GLM 5.1 — fast execution",
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
  const fileLines = filesBlock.split("\n").filter(l => l.trim());
  const fileCount = fileLines.length;
  if      (fileCount >= 6) s += 4;
  else if (fileCount >= 4) s += 2;
  else if (fileCount >= 2) s += 1;
  else if (fileCount === 1) s -= 1;

  let fileScore = 0;
  for (const f of fileLines) {
    if (f.match(/\.(ts|js|py|go|rs|cpp|c|java|swift)$/i)) fileScore += 1;
    if (f.match(/\.(md|txt|csv|json|yml|yaml|toml|lock|log)$/i)) fileScore -= 1;
    if (f.match(/\/(tests|__tests__|test|specs)\//i)) fileScore += 1;
    if (f.match(/\/(docs|documentation)\//i)) fileScore -= 1;
  }
  s += fileScore;

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

export function routeTask(brief) {
  const { score, hits } = scoreTask(brief);
  const taskTier = score > 10 ? "max" : score > 5 ? "complex" : score >= 0 ? "medium" : "quick";
  const tier = TIERS[taskTier];

  return {
    taskTier,
    score,
    model: tier.slug,
    modelLabel: tier.label,
    reason: `score=${score} → ${taskTier} → ${tier.slug}`,
    hits: hits.filter(h => h.delta !== 0),
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  const [cmd] = process.argv.slice(2);

  if (cmd === "status") {
    process.stdout.write("\n=== OpenCode Router — Model Config ===\n");
    process.stdout.write("  score > 10 → max     → qwen3.7-max\n");
    process.stdout.write("  score 5–10 → complex → kimi-k2.7-code\n");
    process.stdout.write("  score 0–4  → medium  → deepseek-v4-pro\n");
    process.stdout.write("  score < 0  → quick   → glm-5.1\n\n");
    for (const [key, t] of Object.entries(TIERS)) {
      process.stdout.write(`  [${key.toUpperCase().padEnd(7)}] ${t.slug}\n`);
      process.stdout.write(`              ${t.label}\n\n`);
    }
    process.exit(0);
  }

  if (cmd === "route") {
    const brief = readFileSync(0, "utf8");
    const decision = routeTask(brief);
    process.stdout.write(JSON.stringify(decision));
    process.exit(0);
  }

  if (cmd === "test") {
    const cases = [
      { label: "complex: refactor auth",  text: "TASK refactor-auth: Refactor authentication system\nWHY: Security audit\nFILES:\n  src/auth/middleware.ts\n  src/auth/jwt.ts\n  src/auth/session.ts\n  src/auth/oauth.ts\nCHANGE:\n  Redesign token rotation, add PKCE flow\nGATES: jest --testPathPattern=auth; npm run build; npm run lint; npm run typecheck" },
      { label: "medium: add endpoint",    text: "TASK add-endpoint: Add GET /health endpoint\nFILES:\n  src/routes/health.ts\n  src/server.ts\nCHANGE:\n  Add health check route returning {status:ok}\nGATES: npm test; npm run build" },
      { label: "quick: fix typo",         text: "TASK fix-typo: fix typo in config\nFILES: src/config.ts\nCHANGE:\n  'databse' → 'database'\nGATES: tsc --noEmit" },
    ];
    process.stdout.write("\n=== OpenCode Router Test ===\n\n");
    for (const { label, text } of cases) {
      const { score, taskTier, model, reason } = routeTask(text);
      process.stdout.write(`  "${label}"\n  score=${score}  tier=${taskTier}  model=${model}\n  ${reason}\n\n`);
    }
    process.exit(0);
  }

  process.stderr.write("Usage: node opencode-router.mjs <status|route|test>\n");
  process.exit(1);
}
