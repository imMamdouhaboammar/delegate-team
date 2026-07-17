#!/usr/bin/env node
/**
 * test-guard-local.mjs
 * ──────────────────────────────────────────────────────────────────
 * Local runner for the test-guard review job.
 * Applies all 12 rules from test-guard skill on changed test files.
 *
 * Usage:
 *   AI_GATEWAY_KEY=ag-xxx node scripts/test-guard-local.mjs
 *   AI_GATEWAY_KEY=ag-xxx node scripts/test-guard-local.mjs --all   # audit all tests
 * ──────────────────────────────────────────────────────────────────
 */

import { execSync }                  from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname }             from 'path';
import { fileURLToPath }             from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');
const AUDIT_ALL = process.argv.includes('--all');

// ── ANSI colours ─────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', blue: '\x1b[34m', magenta: '\x1b[35m',
  bgRed: '\x1b[41m', bgYellow: '\x1b[43m', bgGreen: '\x1b[42m',
};

const header = (t) => {
  const line = '─'.repeat(62);
  console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${t}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${line}${C.reset}\n`);
};

// ── Config ────────────────────────────────────────────────────────
const GATEWAY_KEY = process.env.AI_GATEWAY_KEY;
const GATEWAY_URL = 'https://ai-gateway-1044452917221.us-central1.run.app/v1/chat/completions';
const MODEL       = 'gemini-3.5-flash';

if (!GATEWAY_KEY) {
  console.error(`${C.red}ERROR: AI_GATEWAY_KEY not set${C.reset}`);
  process.exit(1);
}

// ── Banner ────────────────────────────────────────────────────────
console.log(`\n${C.bold}${C.magenta}╔═════════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}${C.magenta}║   🧪  Test Guard — Local Review (12 Rules)         ║${C.reset}`);
console.log(`${C.bold}${C.magenta}╚═════════════════════════════════════════════════════╝${C.reset}`);
console.log(`${C.dim}  Mode : ${AUDIT_ALL ? 'Full audit (all tests)' : 'Changed tests only (git diff)'}${C.reset}`);
console.log(`${C.dim}  Model: ${MODEL}${C.reset}`);
console.log(`${C.dim}  Key  : ${GATEWAY_KEY.slice(0,8)}...${C.reset}`);

// ── Step 1: Collect test content ─────────────────────────────────
header('STEP 1 — Collecting Test Files');

let testContent = '';
let srcContext  = '';
let source      = '';

if (AUDIT_ALL) {
  // Audit all test files
  console.log(`  ${C.dim}Scanning all test files...${C.reset}`);
  try {
    const files = execSync('find tests/ -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null', {
      cwd: ROOT, encoding: 'utf8'
    }).trim().split('\n').filter(Boolean);

    console.log(`  Found ${files.length} test file(s):`);
    for (const f of files) {
      try {
        const content = readFileSync(join(ROOT, f), 'utf8');
        testContent += `\n\n// ═══ FILE: ${f} ═══\n${content}`;
        console.log(`  ${C.green}✓${C.reset} ${f} (${content.split('\n').length} lines)`);
      } catch (_) {}
    }
    source = 'full audit';
  } catch (e) {
    console.error(`  ${C.red}Failed to find test files: ${e.message}${C.reset}`);
  }
} else {
  // Get git diff of changed tests
  console.log(`  ${C.dim}Getting git diff of changed test files...${C.reset}`);
  try {
    const base = execSync('git merge-base origin/master HEAD 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || echo ""', {
      cwd: ROOT, encoding: 'utf8', shell: true
    }).trim();

    if (base) {
      testContent = execSync(`git diff "${base}"..HEAD -- 'tests/**' '*.test.ts' '*.spec.ts'`, {
        cwd: ROOT, encoding: 'utf8'
      });
      srcContext = execSync(`git diff "${base}"..HEAD -- 'src/**'`, {
        cwd: ROOT, encoding: 'utf8'
      }).slice(0, 2000);
      source = `diff vs ${base.slice(0, 8)}`;
      console.log(`  ${C.green}✓${C.reset} Test diff: ${testContent.split('\n').length} lines`);
      console.log(`  ${C.green}✓${C.reset} Src context: ${srcContext.split('\n').length} lines`);
    }
  } catch (_) {}

  // Fallback: if no diff (nothing changed), sample key files
  if (!testContent || testContent.trim() === '') {
    console.log(`  ${C.yellow}⚠${C.reset}  No test changes in diff — sampling key test files`);
    const keyFiles = ['tests/router.test.ts', 'tests/request-timeout.test.ts', 'tests/security.test.ts'];
    for (const f of keyFiles) {
      try {
        const content = readFileSync(join(ROOT, f), 'utf8');
        testContent += `\n\n// ═══ FILE: ${f} ═══\n${content}`;
        console.log(`  ${C.dim}  sampled ${f}${C.reset}`);
      } catch (_) {}
    }
    source = 'sampled key files (no diff)';
  }
}

if (!testContent.trim()) {
  console.log(`${C.yellow}  No test content to review.${C.reset}\n`);
  process.exit(0);
}

// ── Step 2: AI Review ─────────────────────────────────────────────
header('STEP 2 — AI Test-Guard Review (gemini-3.5-flash)');

const SYSTEM_PROMPT = `You are test-guard — an expert test code reviewer enforcing universal testing rules.
Review the provided test code against these 12 rules and return structured JSON.

THE 9 CORE RULES:
Rule 1 (Must Fix 🔴): Test behavior, not implementation. Never assert internal mock call args — assert return values and observable side effects.
Rule 2 (Must Fix 🔴): Mock only at system boundaries: network, LLM APIs, DB, filesystem, clock, third-party SDKs. Never mock internal helpers/utils to isolate a "unit".
Rule 3 (Should Fix 🟡): One scenario per test, data-driven for variants. If N tests share identical setup and differ only in input/output values, merge into test.each/parametrize.
Rule 4 (Should Fix 🟡): Every test must justify its existence. Delete tests that only verify trivial pass-through, default constructor values, or type-system guarantees.
Rule 5 (Should Fix 🟡): Name tests for the scenario: test_<scenario>_<expected_outcome>. Names must read like requirements, not echo function signatures.
Rule 6 (Sacred 🟢): Production regression tests referencing a real incident are always justified and exempt from Rule 4. Never flag them.
Rule 7 (Should Fix 🟡): No tests for framework guarantees. Don't test that the ORM commits, the router returns 404, or test framework fixtures work.
Rule 8 (Must Fix 🔴): State and value objects must be constructed real, never mocked. Mocking a data model hides field-name typos and validation errors.
Rule 9 (Worth Noting 🔵): Infrastructure under test (DB queries, schema behavior) needs real infrastructure, not mocked sessions.

3 EXTRA RULES FOR LLM/AGENT APPS:
Rule 10 (Should Fix 🟡): Prompt tests — test the contract, not the wording. Don't assert specific prompt strings; test template variable substitution and structural markers.
Rule 11 (Worth Noting 🔵): Observability is infrastructure. Never assert on mock tracer/telemetry call args. Mocking to prevent side effects is fine.
Rule 12 (Must Fix 🔴): Agent/flow tests must test state transitions (state in → state out). Not exact prompt strings, not LLM call counts.

SEVERITY GUIDE:
- must_fix (🔴): Rules 1, 2, 8, 12 — hide real bugs or make tests brittle
- should_fix (🟡): Rules 3, 4, 5, 7, 10 — cause bloat and maintenance drag
- worth_noting (🔵): Rules 9, 11 — flag but don't block
- sacred (🟢): Rule 6 — never delete regression tests

Return ONLY valid JSON, no markdown fences:
{
  "summary": "one sentence overall assessment",
  "has_violations": true,
  "must_fix_count": 0,
  "should_fix_count": 0,
  "worth_noting_count": 0,
  "violations": [
    {
      "rule": 1,
      "severity": "must_fix|should_fix|worth_noting",
      "location": "tests/filename.test.ts::test_name",
      "what": "one sentence describing the violation",
      "fix": "one sentence describing what to do instead",
      "code_example": "optional: short correct code snippet"
    }
  ],
  "good_practices": ["what the tests do well — be specific"],
  "recommended_new_tests": [
    {
      "scenario": "what to test",
      "justification": "what bug would this catch"
    }
  ]
}`;

const userContent = `## Test Code to Review (${source}):
\`\`\`typescript
${testContent.slice(0, 7000)}
\`\`\`

${srcContext ? `## Related Source Code Changes (context only):
\`\`\`diff
${srcContext}
\`\`\`` : ''}

Apply all 12 rules. Be specific about locations (file::test_name). Focus on violations that hide real bugs or cause maintenance problems.`;

process.stdout.write(`  ${C.dim}Calling AI gateway...${C.reset} `);

let report;
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
      max_tokens:  4000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent   },
      ],
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json    = await res.json();
  const rawText = json.choices?.[0]?.message?.content ?? '{}';
  const cleaned = rawText.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  report = JSON.parse(cleaned);
  console.log(`${C.green}✓${C.reset}`);
} catch (e) {
  console.log(`${C.red}✗${C.reset}`);
  console.error(`  ${C.red}AI call failed: ${e.message}${C.reset}`);
  process.exit(1);
}

// ── Step 3: Print Report ──────────────────────────────────────────
header('STEP 3 — Test Guard Report');

console.log(`  ${C.bold}Summary:${C.reset}  ${report.summary}`);
console.log(`  ${C.bold}Violations:${C.reset} ${C.red}🔴 Must Fix: ${report.must_fix_count}${C.reset}  ${C.yellow}🟡 Should Fix: ${report.should_fix_count ?? 0}${C.reset}  ${C.blue}🔵 Worth Noting: ${report.worth_noting_count ?? 0}${C.reset}`);

if (!report.violations?.length) {
  console.log(`\n  ${C.green}${C.bold}✅ No violations found!${C.reset}`);
} else {
  console.log(`\n  ${C.bold}Violations (${report.violations.length}):${C.reset}`);
  for (const v of report.violations) {
    const icon  = v.severity === 'must_fix' ? `${C.red}🔴` : v.severity === 'should_fix' ? `${C.yellow}🟡` : `${C.blue}🔵`;
    const label = v.severity === 'must_fix' ? 'MUST FIX' : v.severity === 'should_fix' ? 'SHOULD FIX' : 'WORTH NOTING';
    console.log(`\n  ${icon} Rule ${v.rule} [${label}]${C.reset}`);
    console.log(`  ${C.dim}Location:${C.reset} ${C.cyan}${v.location}${C.reset}`);
    console.log(`  ${C.dim}What:${C.reset}     ${v.what}`);
    console.log(`  ${C.dim}Fix:${C.reset}      ${C.green}${v.fix}${C.reset}`);
    if (v.code_example) {
      console.log(`  ${C.dim}Example:${C.reset}`);
      v.code_example.split('\n').forEach(l => console.log(`    ${C.dim}${l}${C.reset}`));
    }
  }
}

if (report.good_practices?.length) {
  console.log(`\n  ${C.bold}${C.green}✅ Good Practices:${C.reset}`);
  report.good_practices.forEach(g => console.log(`     • ${g}`));
}

if (report.recommended_new_tests?.length) {
  console.log(`\n  ${C.bold}${C.blue}💡 Missing Coverage (recommended tests):${C.reset}`);
  report.recommended_new_tests.forEach(t => {
    if (typeof t === 'string') {
      console.log(`     • ${t}`);
    } else {
      console.log(`     • ${C.bold}${t.scenario}${C.reset}`);
      console.log(`       ${C.dim}Why: ${t.justification}${C.reset}`);
    }
  });
}

// ── Step 4: Save report ───────────────────────────────────────────
const outPath = join(ROOT, 'workspace', `test-guard-report-${Date.now()}.json`);
try {
  writeFileSync(outPath, JSON.stringify({ source, report }, null, 2));
  console.log(`\n  ${C.dim}Full report saved: ${outPath}${C.reset}`);
} catch (_) {}

// ── Summary ───────────────────────────────────────────────────────
header('SUMMARY');

const mustFix  = report.must_fix_count   ?? 0;
const shldFix  = report.should_fix_count ?? 0;

if (mustFix > 0) {
  console.log(`  ${C.red}${C.bold}🚨 ${mustFix} Must-Fix violation(s) — address before merging!${C.reset}`);
  process.exitCode = 1;
} else if (shldFix > 0) {
  console.log(`  ${C.yellow}${C.bold}⚠️  ${shldFix} Should-Fix violation(s) — review recommended.${C.reset}`);
} else {
  console.log(`  ${C.green}${C.bold}🎉 All tests pass test-guard review!${C.reset}`);
}
console.log();
