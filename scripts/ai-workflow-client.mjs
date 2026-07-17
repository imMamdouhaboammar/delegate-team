#!/usr/bin/env node
/**
 * ai-workflow-client.mjs
 * ─────────────────────────────────────────────────────────────────
 * Lightweight Node.js client for the custom OpenAI-compatible
 * AI Gateway used by the autonomous GitHub workflow system.
 *
 * Usage (CLI):
 *   node scripts/ai-workflow-client.mjs \
 *     --system "You are a code reviewer" \
 *     --user  "$(cat report.json)"
 *
 * Usage (import):
 *   import { askAI, buildCodeReviewPrompt } from './ai-workflow-client.mjs'
 * ─────────────────────────────────────────────────────────────────
 */

// ─── Config ──────────────────────────────────────────────────────
const GATEWAY_BASE_URL =
  process.env.AI_GATEWAY_BASE_URL ||
  'https://ai-gateway-1044452917221.us-central1.run.app/v1';

const GATEWAY_API_KEY = process.env.AI_GATEWAY_KEY;
const DEFAULT_MODEL   = process.env.AI_GATEWAY_MODEL || 'gemini-3.5-flash';

const MAX_RETRIES   = 3;
const RETRY_DELAY   = 2000; // ms
const TIMEOUT_MS    = 60_000; // 60 s

// ─── Helpers ─────────────────────────────────────────────────────

/** Sleep helper */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the AI Gateway with retry logic.
 * @param {string} systemPrompt
 * @param {string} userContent
 * @param {object} [opts]
 * @returns {Promise<string>} AI response text
 */
export async function askAI(systemPrompt, userContent, opts = {}) {
  if (!GATEWAY_API_KEY) {
    throw new Error(
      '[ai-workflow-client] AI_GATEWAY_KEY env var is not set. ' +
        'Add it as a GitHub Secret named AI_GATEWAY_KEY.'
    );
  }

  const model       = opts.model       || DEFAULT_MODEL;
  const maxTokens   = opts.maxTokens   || 4096;
  const temperature = opts.temperature ?? 0.2;

  const body = JSON.stringify({
    model,
    max_tokens:  maxTokens,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ],
  });

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key':    GATEWAY_API_KEY,
    // Also send as Bearer for OpenAI-SDK compat
    Authorization:  `Bearer ${GATEWAY_API_KEY}`,
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
        method:  'POST',
        headers,
        body,
        signal:  controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      lastError = err;
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[ai-workflow-client] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
      );
      if (!isLast) await sleep(RETRY_DELAY * attempt);
    }
  }

  throw lastError;
}

// ─── Prompt Builders ─────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  codeReviewer: `You are an expert code reviewer and software quality guardian.
Analyse the provided CI/test results, linter output, and code metrics.
Respond in structured JSON with this exact schema:
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
      "line": null,
      "description": "what is wrong",
      "suggestion": "how to fix",
      "auto_fixable": true/false
    }
  ],
  "positives": ["what is working well"],
  "recommended_actions": ["ordered list of next steps"]
}`,

  autoFixer: `You are an automated code repair bot.
Given a code issue description and the relevant file content, produce a minimal unified diff (git diff format) that fixes the problem.
Return ONLY a JSON object:
{
  "diff": "--- a/file\\n+++ b/file\\n...unified diff...",
  "explanation": "what was changed and why",
  "confidence": 0-100,
  "safe_to_apply": true/false
}
If you cannot safely produce a fix, return safe_to_apply: false with an explanation.`,

  reportGenerator: `You are a technical project health reporter.
Given aggregated CI metrics and issue data, write a concise GitHub-flavored Markdown report.
Include: executive summary, health score badge, issues table, trends, and action items.
Use emoji for visual clarity. Keep total length under 2000 characters.`,

  issueWriter: `You are a GitHub Issues writer for an automated quality system.
Given a detected problem, write a clear, actionable GitHub Issue.
Return JSON:
{
  "title": "concise issue title with emoji prefix",
  "body": "full GitHub-flavored markdown body with: problem description, context, reproduction steps if applicable, suggested fix, and severity label",
  "labels": ["array of label names from: bug, enhancement, documentation, ai-reported, high-priority, low-priority, technical-debt"],
  "priority": "low|medium|high|critical"
}`,
};

/**
 * Build a code-review user prompt from CI data.
 * @param {object} ciData - collected CI scan results
 */
export function buildCodeReviewPrompt(ciData) {
  return `## Repository: ${ciData.repo || 'delegate-team'}
## Branch: ${ciData.branch || 'main'}
## Commit: ${ciData.sha || 'unknown'}
## Timestamp: ${new Date().toISOString()}

## CI Results
\`\`\`json
${JSON.stringify(ciData, null, 2)}
\`\`\`

Analyse these results and return the JSON report as specified.`;
}

/**
 * Build an issue-creation prompt from a single detected issue.
 * @param {object} issue - one entry from the AI analysis issues array
 */
export function buildIssuePrompt(issue) {
  return `Create a GitHub Issue for this detected problem:
\`\`\`json
${JSON.stringify(issue, null, 2)}
\`\`\``;
}

// ─── CLI Entry Point ──────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('ai-workflow-client.mjs')) {
  const args = process.argv.slice(2);
  const get  = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  const systemPromptKey = get('--system-key') || 'codeReviewer';
  const systemPrompt    = SYSTEM_PROMPTS[systemPromptKey] || get('--system') || '';
  const userContent     = get('--user') || (await readStdin());

  if (!userContent) {
    console.error('Usage: node ai-workflow-client.mjs --system-key codeReviewer --user "<content>"');
    process.exit(1);
  }

  try {
    const response = await askAI(systemPrompt, userContent);
    process.stdout.write(response);
  } catch (err) {
    console.error(`[ai-workflow-client] Fatal: ${err.message}`);
    process.exit(1);
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
