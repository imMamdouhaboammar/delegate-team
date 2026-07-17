#!/usr/bin/env node
/**
 * test-ai-guardian-local.mjs
 * ──────────────────────────────────────────────────────────────────
 * Local test runner that simulates the full ai-guardian workflow:
 *   Phase 1 — Health Scan   (runs real checks on this repo)
 *   Phase 2 — AI Analysis   (calls the actual AI Gateway)
 *   Phase 3 — Report        (prints coloured terminal report)
 *   Phase 4 — Issue Preview (shows what Issues would be opened)
 *   Phase 5 — Autofix Check (shows what PRs would be opened)
 * ──────────────────────────────────────────────────────────────────
 * Usage:
 *   AI_GATEWAY_KEY=ag-xxx node scripts/test-ai-guardian-local.mjs
 * ──────────────────────────────────────────────────────────────────
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── ANSI colours ─────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
  bgRed:  '\x1b[41m',
  bgGreen:'\x1b[42m',
  bgYellow:'\x1b[43m',
};

const log    = (msg)        => console.log(msg);
const info   = (msg)        => console.log(`${C.cyan}  ℹ ${C.reset}${msg}`);
const ok     = (msg)        => console.log(`${C.green}  ✓ ${C.reset}${msg}`);
const warn   = (msg)        => console.log(`${C.yellow}  ⚠ ${C.reset}${msg}`);
const fail   = (msg)        => console.log(`${C.red}  ✗ ${C.reset}${msg}`);
const header = (title)      => {
  const line = '─'.repeat(60);
  console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${line}${C.reset}\n`);
};
const subheader = (title)   => console.log(`\n${C.bold}${C.white}  ▸ ${title}${C.reset}`);

// ── Config ────────────────────────────────────────────────────────
const GATEWAY_URL = 'https://ai-gateway-1044452917221.us-central1.run.app/v1/chat/completions';
const GATEWAY_KEY = process.env.AI_GATEWAY_KEY;
const MODEL       = 'gemini-3.5-flash';

// ── Helpers ───────────────────────────────────────────────────────
function runCheck(name, cmd, opts = {}) {
  const start = Date.now();
  process.stdout.write(`  ${C.dim}Running ${name}...${C.reset} `);
  try {
    const out = execSync(cmd, {
      cwd:      ROOT,
      timeout:  90_000,
      stdio:    ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      ...opts,
    });
    const ms = Date.now() - start;
    console.log(`${C.green}✓${C.reset} ${C.dim}(${ms}ms)${C.reset}`);
    return { ok: true, output: (out || '').slice(0, 800), ms, name };
  } catch (e) {
    const ms = Date.now() - start;
    console.log(`${C.red}✗${C.reset} ${C.dim}(${ms}ms)${C.reset}`);
    const errOut = ((e.stdout || '') + (e.stderr || '')).slice(0, 800);
    return { ok: false, output: errOut, ms, name, error: e.message };
  }
}

async function callGateway(systemPrompt, userContent, maxTokens = 4096) {
  if (!GATEWAY_KEY) throw new Error('AI_GATEWAY_KEY not set');
  const res = await fetch(GATEWAY_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'X-API-Key':     GATEWAY_KEY,
      'Authorization': `Bearer ${GATEWAY_KEY}`,
    },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  maxTokens,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent  },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

function parseJSON(text) {
  const cleaned = text.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  try { return JSON.parse(cleaned); } catch (_) { return null; }
}

function severityBadge(sev) {
  switch (sev) {
    case 'critical': return `${C.bgRed}${C.white} CRITICAL ${C.reset}`;
    case 'high':     return `${C.red} HIGH ${C.reset}`;
    case 'medium':   return `${C.yellow} MEDIUM ${C.reset}`;
    case 'low':      return `${C.dim} LOW ${C.reset}`;
    default:         return `${C.dim} ${sev} ${C.reset}`;
  }
}

function scoreBar(score) {
  const filled = Math.round(score / 5);
  const empty  = 20 - filled;
  const colour = score >= 80 ? C.green : score >= 50 ? C.yellow : C.red;
  return `${colour}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}${C.reset} ${C.bold}${score}/100${C.reset}`;
}

// ══════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════
console.log(`\n${C.bold}${C.magenta}╔═══════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}${C.magenta}║    🤖  AI Guardian — Local Test Runner           ║${C.reset}`);
console.log(`${C.bold}${C.magenta}╚═══════════════════════════════════════════════════╝${C.reset}`);
console.log(`${C.dim}  Repo : ${ROOT}${C.reset}`);
console.log(`${C.dim}  Model: ${MODEL}${C.reset}`);
console.log(`${C.dim}  Key  : ${GATEWAY_KEY ? GATEWAY_KEY.slice(0,8) + '...' : '⚠️  NOT SET'}${C.reset}`);
console.log(`${C.dim}  Time : ${new Date().toLocaleString()}${C.reset}`);

if (!GATEWAY_KEY) {
  console.log(`\n${C.red}${C.bold}  ERROR: AI_GATEWAY_KEY env var is not set.${C.reset}`);
  console.log(`  Run: ${C.cyan}AI_GATEWAY_KEY=ag-xxx node scripts/test-ai-guardian-local.mjs${C.reset}\n`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
// PHASE 1 — HEALTH SCAN
// ─────────────────────────────────────────────────────────────────
header('PHASE 1 — Health Scan');

subheader('TypeScript & Build');
const tsCheck  = runCheck('typecheck',    'npm run typecheck 2>&1');
const build    = runCheck('build',        'npm run build 2>&1');

subheader('Tests');
const tests    = runCheck('vitest',       'npx vitest run --reporter=verbose 2>&1');
const verCheck = runCheck('version sync', 'npm run version:check 2>&1');

subheader('Shell Scripts');
const shellFiles = [
  'install.sh',
  'orchestrator/scripts/orchestrate.sh',
  'mmas/watchdog.sh',
  'scaffolder/bin/apeiron-skill-scaffold',
  'agent-kernel/install.sh',
  'agent-kernel/wrapper.sh',
].filter(f => existsSync(join(ROOT, f)));

const shellCheck = runCheck('bash syntax',
  shellFiles.map(f => `bash -n "${f}"`).join(' && ') || 'echo "no shell files"'
);

subheader('Python');
const pyCheck = runCheck('python compile',
  `python3 -c "import py_compile, glob; [py_compile.compile(f) for p in ['vertex-coder/*.py','minimax-coder/*.py','mmas/spawn-team.py','mmas/hash-edit.py'] for f in glob.glob(p)]" 2>&1`
);

subheader('YAML / JSON Lint');
const lintCheck = runCheck('yaml+json lint',
  `python3 -c "
import yaml, json, glob, sys
errs = []
for f in glob.glob('mmas/agents/*.yaml'):
    try: yaml.safe_load(open(f))
    except Exception as e: errs.append(f'{f}: {e}')
for f in ['package.json','tsconfig.json','.claude-plugin/plugin.json','.claude-plugin/marketplace.json','skills.sh.json']:
    try: json.load(open(f))
    except Exception as e: errs.append(f'{f}: {e}')
[print(e) for e in errs]; sys.exit(len(errs))
" 2>&1`
);

subheader('SKILL.md Frontmatter');
const skillCheck = runCheck('skill.md check',
  `python3 -c "
import re, glob, sys
errors = []
for path in glob.glob('**/SKILL.md', recursive=True):
    text = open(path).read()
    m = re.match(r'---\\n(.*?)\\n---', text, re.DOTALL)
    if not m or 'name:' not in m.group(1) or 'description:' not in m.group(1):
        errors.append(path)
[print(f'bad frontmatter: {e}') for e in errors]; sys.exit(len(errors))
" 2>&1`
);

// Collect results
const checks = [tsCheck, build, tests, verCheck, shellCheck, pyCheck, lintCheck, skillCheck];
const failures = checks.filter(c => !c.ok);
const passed   = checks.filter(c =>  c.ok);

log(`\n  ${C.bold}Scan complete:${C.reset} ${C.green}${passed.length} passed${C.reset} | ${failures.length > 0 ? C.red : C.dim}${failures.length} failed${C.reset}`);

const scanData = {
  repo:           'delegate-team',
  branch:         execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
  sha:            execSync('git rev-parse --short HEAD',       { cwd: ROOT, encoding: 'utf8' }).trim(),
  timestamp:      new Date().toISOString(),
  total_failures: failures.length,
  checks: Object.fromEntries(checks.map(c => [c.name, {
    exit_code: c.ok ? 0 : 1,
    log:       c.output,
  }])),
};

// ─────────────────────────────────────────────────────────────────
// PHASE 2 — AI ANALYSIS
// ─────────────────────────────────────────────────────────────────
header('PHASE 2 — AI Analysis (gemini-3.5-flash)');
info(`Sending scan results to ${GATEWAY_URL.split('/')[2]}...`);

const SYSTEM_PROMPT = `You are an expert code reviewer and software quality guardian.
Analyse the provided CI/test results and return a structured JSON report with this exact schema:
{
  "summary": "one-line overall health status",
  "score": 0-100,
  "severity": "ok|warning|critical",
  "issues": [
    {
      "id": "unique-slug",
      "title": "short title",
      "severity": "low|medium|high|critical",
      "file": "path/to/file or null",
      "description": "what is wrong",
      "suggestion": "how to fix it",
      "auto_fixable": true
    }
  ],
  "positives": ["what is working well"],
  "recommended_actions": ["ordered list of next steps"]
}
Return ONLY valid JSON, no markdown fences.`;

let aiReport = null;
try {
  process.stdout.write(`  ${C.dim}Calling AI gateway...${C.reset} `);
  const raw = await callGateway(SYSTEM_PROMPT, `Analyse this CI scan:\n${JSON.stringify(scanData, null, 2)}`);
  console.log(`${C.green}✓${C.reset}`);
  aiReport = parseJSON(raw);
  if (!aiReport) {
    warn('Could not parse AI response as JSON — raw response:');
    console.log(C.dim + raw.slice(0, 500) + C.reset);
  }
} catch (e) {
  console.log(`${C.red}✗${C.reset}`);
  fail(`AI Gateway error: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────
// PHASE 3 — REPORT
// ─────────────────────────────────────────────────────────────────
header('PHASE 3 — AI Guardian Report');

if (aiReport) {
  const sev    = aiReport.severity || 'unknown';
  const score  = aiReport.score    || 0;
  const sevCol = sev === 'ok' ? C.green : sev === 'warning' ? C.yellow : C.red;

  log(`  ${C.bold}Summary:${C.reset}  ${aiReport.summary}`);
  log(`  ${C.bold}Score:${C.reset}    ${scoreBar(score)}`);
  log(`  ${C.bold}Severity:${C.reset} ${sevCol}${C.bold}${sev.toUpperCase()}${C.reset}`);

  if (aiReport.positives?.length) {
    log(`\n  ${C.bold}${C.green}✅ Positives:${C.reset}`);
    aiReport.positives.forEach(p => log(`     • ${p}`));
  }

  if (aiReport.issues?.length) {
    log(`\n  ${C.bold}${C.red}🐛 Issues Found (${aiReport.issues.length}):${C.reset}`);
    aiReport.issues.forEach((issue, i) => {
      log(`\n  ${C.bold}[${i+1}] ${issue.title}${C.reset}`);
      log(`       Severity : ${severityBadge(issue.severity)}`);
      log(`       File     : ${issue.file ? C.cyan + issue.file + C.reset : C.dim + 'n/a' + C.reset}`);
      log(`       Problem  : ${issue.description}`);
      log(`       Fix      : ${C.green}${issue.suggestion}${C.reset}`);
      log(`       Auto-fix : ${issue.auto_fixable ? C.green + '✓ Yes' : C.red + '✗ No'}${C.reset}`);
    });
  } else {
    ok('No issues detected by AI!');
  }

  if (aiReport.recommended_actions?.length) {
    log(`\n  ${C.bold}📋 Recommended Actions:${C.reset}`);
    aiReport.recommended_actions.forEach((a, i) => log(`     ${i+1}. ${a}`));
  }
} else {
  warn('AI report unavailable — showing raw scan summary:');
  log(`  Failed checks: ${failures.map(f => f.name).join(', ') || 'none'}`);
}

// ─────────────────────────────────────────────────────────────────
// PHASE 4 — ISSUE PREVIEW
// ─────────────────────────────────────────────────────────────────
header('PHASE 4 — GitHub Issues Preview');

const highIssues = (aiReport?.issues || []).filter(i =>
  i.severity === 'critical' || i.severity === 'high'
);

if (highIssues.length === 0) {
  ok('No high/critical issues — no GitHub Issues would be opened.');
} else {
  info(`${highIssues.length} Issue(s) would be opened on GitHub:`);
  for (const issue of highIssues) {
    subheader(`Generating Issue body for: ${issue.title}`);
    process.stdout.write(`  ${C.dim}Calling AI for issue body...${C.reset} `);
    try {
      const issueBody = await callGateway(
        'You are a GitHub Issues writer. Return only valid JSON (no markdown fences): {"title":"...","body":"...","labels":[...]}',
        `Write a GitHub Issue for:\n${JSON.stringify(issue, null, 2)}`,
        1500
      );
      console.log(`${C.green}✓${C.reset}`);
      const issueData = parseJSON(issueBody);
      if (issueData) {
        log(`\n  ${C.bold}📌 Issue Title:${C.reset} ${issueData.title || issue.title}`);
        log(`  ${C.bold}🏷️  Labels:${C.reset}  ${(issueData.labels || []).join(', ')}, ai-reported, auto-scan`);
        log(`  ${C.bold}📝 Body preview:${C.reset}`);
        const bodyPreview = (issueData.body || issue.description).slice(0, 400);
        bodyPreview.split('\n').slice(0, 10).forEach(l => log(`     ${C.dim}${l}${C.reset}`));
        log(`     ${C.dim}...${C.reset}`);
      }
    } catch (e) {
      console.log(`${C.yellow}⚠${C.reset}`);
      warn(`Could not generate issue body: ${e.message}`);
      log(`  ${C.dim}Would open issue: "${issue.title}" [${issue.severity}]${C.reset}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
}

// ─────────────────────────────────────────────────────────────────
// PHASE 5 — AUTOFIX PREVIEW
// ─────────────────────────────────────────────────────────────────
header('PHASE 5 — Auto-Fix Preview');

const autoFixable = (aiReport?.issues || []).filter(i => i.auto_fixable);
if (autoFixable.length === 0) {
  ok('No auto-fixable issues detected — no PR would be opened.');
} else {
  info(`${autoFixable.length} issue(s) are marked auto-fixable:`);
  autoFixable.forEach(i => {
    log(`  ${C.green}→${C.reset} ${i.id}: ${i.title} (${i.file || 'no file'})`);
  });
  log(`\n  ${C.dim}In CI: ai-autofix.yml would open a Draft PR with these fixes.${C.reset}`);
  if (aiReport?.severity === 'critical') {
    warn('Severity is CRITICAL → autofix.yml would be auto-triggered by guardian');
  }
}

// ─────────────────────────────────────────────────────────────────
// SAVE REPORT
// ─────────────────────────────────────────────────────────────────
const reportPath = join(ROOT, 'workspace', `ai-local-report-${Date.now()}.json`);
try {
  const reportData = { scan: scanData, ai_analysis: aiReport, timestamp: new Date().toISOString() };
  if (!existsSync(join(ROOT, 'workspace'))) {
    execSync('mkdir -p workspace', { cwd: ROOT });
  }
  writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  log(`\n  ${C.dim}Full report saved: ${reportPath}${C.reset}`);
} catch (_) {}

// ─────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────
header('SUMMARY');
const finalSev = aiReport?.severity || (failures.length > 0 ? 'warning' : 'ok');
const finalScore = aiReport?.score ?? (failures.length === 0 ? 95 : 100 - failures.length * 12);
const sevCol = finalSev === 'ok' ? C.green : finalSev === 'warning' ? C.yellow : C.red;

log(`  ${C.bold}Health Score : ${C.reset}${scoreBar(finalScore)}`);
log(`  ${C.bold}Severity     : ${C.reset}${sevCol}${C.bold}${finalSev.toUpperCase()}${C.reset}`);
log(`  ${C.bold}Checks       : ${C.reset}${C.green}${passed.length} ✓${C.reset}  ${failures.length > 0 ? C.red : C.dim}${failures.length} ✗${C.reset}`);
log(`  ${C.bold}Issues found : ${C.reset}${aiReport?.issues?.length ?? 0}`);
log(`  ${C.bold}Would open   : ${C.reset}${highIssues.length} GitHub Issue(s)`);
log(`  ${C.bold}Would fix    : ${C.reset}${autoFixable.length} auto-fixable`);

if (finalSev === 'ok') {
  log(`\n  ${C.green}${C.bold}🎉 All good! No action needed.${C.reset}\n`);
} else if (finalSev === 'warning') {
  log(`\n  ${C.yellow}${C.bold}⚠️  Some issues found — review recommended.${C.reset}\n`);
} else {
  log(`\n  ${C.red}${C.bold}🚨 Critical issues detected — action required!${C.reset}\n`);
}
