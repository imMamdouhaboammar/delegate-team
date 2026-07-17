#!/usr/bin/env node
/**
 * test-autofix-local.mjs
 * ──────────────────────────────────────────────────────────────────
 * End-to-end local test of the AI auto-fixer.
 * Takes a REAL violation (from test-guard output), asks the AI to
 * produce a patch, applies it to a COPY of the file, runs the
 * tests on the patched copy, and reports the result.
 *
 * Usage:
 *   AI_GATEWAY_KEY=ag-xxx node scripts/test-autofix-local.mjs
 * ──────────────────────────────────────────────────────────────────
 */

import { execSync }                                    from 'child_process';
import { readFileSync, writeFileSync, copyFileSync,
         existsSync, mkdirSync, rmSync }               from 'fs';
import { join, dirname, basename }                     from 'path';
import { fileURLToPath }                               from 'url';
import { tmpdir }                                      from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── ANSI ────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  cyan:'\x1b[36m', magenta:'\x1b[35m', blue:'\x1b[34m',
};
const header = t => {
  const line = '─'.repeat(62);
  console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${t}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${line}${C.reset}\n`);
};
const ok   = m => console.log(`  ${C.green}✓${C.reset} ${m}`);
const fail = m => console.log(`  ${C.red}✗${C.reset} ${m}`);
const info = m => console.log(`  ${C.cyan}ℹ${C.reset} ${m}`);
const warn = m => console.log(`  ${C.yellow}⚠${C.reset} ${m}`);

// ── Config ───────────────────────────────────────────────────────
const GATEWAY_KEY = process.env.AI_GATEWAY_KEY;
const GATEWAY_URL = 'https://ai-gateway-1044452917221.us-central1.run.app/v1/chat/completions';
const MODEL       = 'gemini-3.5-flash';

if (!GATEWAY_KEY) {
  console.error(`${C.red}ERROR: AI_GATEWAY_KEY not set${C.reset}`);
  process.exit(1);
}

// ── Banner ───────────────────────────────────────────────────────
console.log(`\n${C.bold}${C.magenta}╔═════════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}${C.magenta}║   🔧  AI Auto-Fixer — End-to-End Local Test        ║${C.reset}`);
console.log(`${C.bold}${C.magenta}╚═════════════════════════════════════════════════════╝${C.reset}`);

// ── The violations we know about (from test-guard run) ──────────
// In CI, these come from the ai_report input. Locally we hardcode
// the ones test-guard found to do a real end-to-end test.
const KNOWN_VIOLATIONS = [
  {
    id:           'rule1-fallback-impl-detail',
    title:        'Rule 1: Tests implementation detail (spawnSync call args)',
    severity:     'high',
    file:         'tests/fallback.test.ts',
    description:  `Test "should route to fallback backend if first backend fails" asserts on spawnSync mock call arguments (relayCalls[0][1] contains 'opencode', etc.) instead of the observable outcome. This tests implementation detail — the test breaks if the internals are refactored even if behavior is preserved.`,
    suggestion:   `Assert the observable behavior: did runDispatch succeed? Did it eventually call a backend that succeeded? Use process.exitCode or a side-effect assertion. Alternatively, use test.each for the routing table and assert the final dispatch result.`,
    rule:         1,
    auto_fixable: true,
    source:       'test-guard',
  },
  {
    id:           'rule3-router-test-each',
    title:        'Rule 3: 4 near-identical router tests should be test.each',
    severity:     'medium',
    file:         'tests/router.test.ts',
    description:  `Four tests in router.test.ts share identical setup (setupFsChildMocks, spawnSync mock returning a score) and differ only in the score value (8,6,3,0) and expected backend (mmas, vertexcoder, opencode, minimax). This is a textbook test.each case.`,
    suggestion:   `Merge into one test.each([ [8,'mmas'], [6,'vertexcoder'], [3,'opencode'], [0,'minimax'] ]) test that asserts the relay call contains the correct backend name.`,
    rule:         3,
    auto_fixable: true,
    source:       'test-guard',
  },
];

const results = [];

// ═══════════════════════════════════════════════════════════════
// PHASE 1 — Show what violations we're fixing
// ═══════════════════════════════════════════════════════════════
header('PHASE 1 — Violations to Fix');
info(`${KNOWN_VIOLATIONS.length} violations queued for auto-fix attempt:`);
for (const v of KNOWN_VIOLATIONS) {
  const sev = v.severity === 'high' ? `${C.red}HIGH${C.reset}` : `${C.yellow}MEDIUM${C.reset}`;
  console.log(`\n  [${sev}] Rule ${v.rule} — ${v.id}`);
  console.log(`  ${C.dim}File: ${v.file}${C.reset}`);
  console.log(`  ${C.dim}Problem: ${v.description.slice(0, 120)}...${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2 — AI generates patches
// ═══════════════════════════════════════════════════════════════
header('PHASE 2 — AI Generates Patches');

const FIXER_SYSTEM = `You are an expert automated test code repair bot following test-guard rules.
Given a test file and a specific violation, produce SEARCH-REPLACE patches.

Rules you enforce:
- Rule 1: Assert observable outcomes (return values, side effects), NOT internal mock call args
- Rule 3: Merge near-identical tests into test.each/parametrize

Return ONLY valid JSON (no markdown fences, NO full file content):
{
  "confidence": 0-100,
  "safe_to_apply": true,
  "test_still_meaningful": true,
  "explanation": "what changed and why (bullet points)",
  "replacements": [
    {
      "search": "exact verbatim string to find in the file",
      "replace": "replacement string"
    }
  ]
}
Keep each replacement minimal. If you cannot safely fix, set safe_to_apply: false.`;

const patches = [];

for (const violation of KNOWN_VIOLATIONS) {
  process.stdout.write(`  ${C.dim}Generating patch for ${violation.id}...${C.reset} `);

  const filePath = join(ROOT, violation.file);
  if (!existsSync(filePath)) {
    console.log(`${C.yellow}⚠ file not found${C.reset}`);
    continue;
  }

  const originalContent = readFileSync(filePath, 'utf8');

  // Send line-numbered content to help AI find exact strings
  const numberedContent = originalContent
    .split('\n')
    .map((l, i) => `${i+1}: ${l}`)
    .join('\n')
    .slice(0, 2500);

  const prompt = `Fix this test-guard violation with search-replace patches:

VIOLATION:
${JSON.stringify({ id: violation.id, rule: violation.rule, description: violation.description, suggestion: violation.suggestion }, null, 2)}

FILE (${violation.file}) — line-numbered:
${numberedContent}

Produce minimal search-replace blocks that:
1. Fix the specific violation described
2. Keep all other tests intact
3. Do NOT remove meaningful test coverage`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-Key':     GATEWAY_KEY,
        'Authorization': `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  4096,
        temperature: 0.1,
        messages: [
          { role: 'system', content: FIXER_SYSTEM },
          { role: 'user',   content: prompt        },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Gateway ${res.status}`);
    const json    = await res.json();
    const rawText = json.choices?.[0]?.message?.content ?? '{}';
    const cleaned = rawText.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    const patch   = JSON.parse(cleaned);

    if (patch.safe_to_apply && patch.confidence >= 65 && patch.fixed_content) {
      console.log(`${C.green}✓${C.reset} (confidence: ${patch.confidence}%)`);
      patches.push({ violation, patch, originalContent, filePath });
    } else {
      console.log(`${C.yellow}⚠${C.reset} AI declined (safe=${patch.safe_to_apply}, confidence=${patch.confidence}%)`);
      info(`Reason: ${patch.explanation || 'no explanation'}`);
    }
  } catch (e) {
    console.log(`${C.red}✗${C.reset}`);
    fail(`AI patch failed: ${e.message}`);
  }

  await new Promise(r => setTimeout(r, 800));
}

if (patches.length === 0) {
  warn('No patches generated. Nothing to test.');
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3 — Show diffs
// ═══════════════════════════════════════════════════════════════
header('PHASE 3 — Patch Diffs');

for (const { violation, patch, originalContent } of patches) {
  console.log(`\n  ${C.bold}Patch for: ${violation.id}${C.reset}`);
  console.log(`  Confidence: ${patch.confidence}%`);
  console.log(`  Changes:`);
  // Print explanation bullets
  const explanation = patch.explanation || '';
  explanation.split('\n').filter(Boolean).forEach(l =>
    console.log(`    ${C.dim}${l.slice(0, 120)}${C.reset}`)
  );

  // Show search-replace blocks
  const repls = patch.replacements ?? [];
  console.log(`  Replacements: ${repls.length} block(s)`);
  for (const r of repls) {
    console.log(`\n  ${C.bold}Preview:${C.reset}`);
    (r.search  || '').split('\n').slice(0, 5).forEach(l =>
      console.log(`  ${C.red}-${C.reset} ${C.dim}${l.slice(0, 100)}${C.reset}`));
    (r.replace || '').split('\n').slice(0, 5).forEach(l =>
      console.log(`  ${C.green}+${C.reset} ${l.slice(0, 100)}`));
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4 — Apply patches to temp copies and run tests
// ═══════════════════════════════════════════════════════════════
header('PHASE 4 — Apply & Test (on temp copies)');

for (const { violation, patch, originalContent, filePath } of patches) {
  console.log(`\n  ${C.bold}Testing fix for: ${violation.id}${C.reset}`);

  // Backup original
  const backupPath = filePath + '.autofix-backup';
  copyFileSync(filePath, backupPath);

  let testPassed  = false;
  let testOutput  = '';

  try {
    // Apply search-replace patches to the file
    let patched = originalContent;
    let appliedCount = 0;
    for (const { search, replace } of (patch.replacements ?? [])) {
      if (patched.includes(search)) {
        patched = patched.replace(search, replace);
        appliedCount++;
      } else {
        warn(`Search string not found in ${violation.file}: "${search.slice(0,60)}..."`);
      }
    }
    if (appliedCount === 0) {
      warn(`No replacements matched — skipping test for ${violation.id}`);
      results.push({ violation_id: violation.id, file: violation.file, rule: violation.rule,
        confidence: patch.confidence, tests_pass: false, explanation: 'No replacements matched' });
      copyFileSync(backupPath, filePath);
      rmSync(backupPath, { force: true });
      continue;
    }
    writeFileSync(filePath, patched);
    ok(`Applied ${appliedCount} replacement(s) to ${violation.file}`);

    // Run only the affected test file
    process.stdout.write(`  ${C.dim}Running tests for ${violation.file}...${C.reset} `);
    try {
      testOutput = execSync(
        `npx vitest run "${violation.file}" --reporter=verbose 2>&1`,
        { cwd: ROOT, encoding: 'utf8', timeout: 60_000 }
      );
      console.log(`${C.green}✓ PASSED${C.reset}`);
      testPassed = true;

      // Count tests
      const passMatch = testOutput.match(/(\d+) passed/);
      const failMatch = testOutput.match(/(\d+) failed/);
      if (passMatch) info(`Tests: ${passMatch[1]} passed${failMatch ? `, ${failMatch[1]} failed` : ''}`);

    } catch (e) {
      console.log(`${C.red}✗ FAILED${C.reset}`);
      testOutput = ((e.stdout || '') + (e.stderr || '')).slice(0, 600);
      // Show first error
      const errorLine = testOutput.split('\n').find(l => l.includes('Error') || l.includes('FAIL'));
      if (errorLine) fail(errorLine.trim());
    }

    results.push({
      violation_id: violation.id,
      file:         violation.file,
      rule:         violation.rule,
      confidence:   patch.confidence,
      tests_pass:   testPassed,
      explanation:  patch.explanation,
    });

  } finally {
    // Always restore original (we don't apply to real files in local test)
    copyFileSync(backupPath, filePath);
    rmSync(backupPath, { force: true });
    info(`Restored original ${violation.file}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 5 — Would-be PR preview
// ═══════════════════════════════════════════════════════════════
header('PHASE 5 — PR Preview (what CI would open)');

const safeToMerge = results.filter(r => r.tests_pass);
const risky       = results.filter(r => !r.tests_pass);

if (safeToMerge.length > 0) {
  console.log(`  ${C.bold}${C.green}✅ Would open 1 Draft PR with ${safeToMerge.length} safe fix(es):${C.reset}`);
  console.log(`\n  ${C.bold}Title:${C.reset} 🔧 AI Auto-Fix: test-guard violations [ai-autofix]`);
  console.log(`  ${C.bold}Labels:${C.reset} ai-reported, auto-scan`);
  console.log(`  ${C.bold}Status:${C.reset} Draft (human review required before merge)`);
  console.log(`\n  ${C.bold}Fixes included:${C.reset}`);
  safeToMerge.forEach(r => {
    console.log(`    ✓ Rule ${r.rule} — ${r.violation_id} (confidence: ${r.confidence}%)`);
  });
}

if (risky.length > 0) {
  console.log(`\n  ${C.bold}${C.yellow}⚠️  ${risky.length} fix(es) skipped (tests failed after applying):${C.reset}`);
  risky.forEach(r => {
    console.log(`    ✗ ${r.violation_id} — would NOT be included in PR`);
  });
  info('These would be included in the Issue report instead, with manual fix required.');
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
header('SUMMARY');

console.log(`  ${C.bold}Violations tested  :${C.reset} ${results.length}`);
console.log(`  ${C.bold}Patches generated  :${C.reset} ${patches.length}`);
console.log(`  ${C.bold}Tests pass after fix:${C.reset} ${safeToMerge.length}`);
console.log(`  ${C.bold}Tests fail after fix:${C.reset} ${risky.length}`);

console.log();
if (safeToMerge.length === patches.length && patches.length > 0) {
  console.log(`  ${C.green}${C.bold}🎉 All patches safe — autofix is working correctly!${C.reset}`);
} else if (safeToMerge.length > 0) {
  console.log(`  ${C.yellow}${C.bold}⚠️  Partial success — some patches need manual review.${C.reset}`);
} else if (patches.length > 0) {
  console.log(`  ${C.red}${C.bold}🚨 Patches generated but tests fail — autofix needs improvement.${C.reset}`);
} else {
  console.log(`  ${C.yellow}${C.bold}ℹ️  AI declined all patches — violations need manual fixes.${C.reset}`);
}

// Save full results
try {
  mkdirSync(join(ROOT, 'workspace'), { recursive: true });
  writeFileSync(
    join(ROOT, 'workspace', `autofix-test-${Date.now()}.json`),
    JSON.stringify({ violations: KNOWN_VIOLATIONS, patches: patches.map(p => ({
      violation_id: p.violation.id,
      confidence:   p.patch.confidence,
      explanation:  p.patch.explanation,
    })), results }, null, 2)
  );
} catch (_) {}

console.log();
