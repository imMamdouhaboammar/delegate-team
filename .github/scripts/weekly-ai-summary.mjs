import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const GATEWAY_URL = 'https://ai-gateway-1044452917221.us-central1.run.app/v1/chat/completions';

function chooseDelimiter(summary, randomId) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const delimiter = `WEEKLY_${randomId()}`;
    if (!summary.split(/\r?\n/).includes(delimiter)) return delimiter;
  }
  throw new Error('unable to choose weekly summary output delimiter');
}

function describeStats(stats) {
  return [
    `commit_count: ${stats.commit_count ?? 'unknown'}`,
    `open_ai_issues: ${stats.open_ai_issues ?? 'unknown'}`,
    `closed_ai_issues: ${stats.closed_ai_issues ?? 'unknown'}`,
    `week_start: ${stats.week_start ?? 'unknown'}`,
    `week_end: ${stats.week_end ?? 'unknown'}`,
  ].join('\n');
}

function buildRequestBody(prompt) {
  // nosemgrep: javascript.lang.correctness.no-stringify-keys.no-stringify-keys
  // This stringification only JSON-escapes a scalar prompt; no object-key ordering is consumed.
  return `{"model":"gemini-3.5-flash","max_tokens":1500,"temperature":0.4,"messages":[{"role":"user","content":${JSON.stringify(prompt)}}]}`;
}

export async function generateWeeklySummary({
  fetchImpl = globalThis.fetch,
  env = process.env,
  appendFile = appendFileSync,
  randomId = () => randomUUID().replaceAll('-', '_'),
} = {}) {
  let stats = {};

  try {
    stats = JSON.parse(env.STATS_JSON || '{}');
    const gatewayKey = env.AI_GATEWAY_KEY;
    if (!gatewayKey) throw new Error('AI_GATEWAY_KEY unavailable');

    const prompt = `Generate a concise weekly project health summary for a GitHub Issue.
Repository: delegate-team (Agentic Engineering Supersystem)
Week: ${stats.week_start} → ${stats.week_end}
Stats:
${describeStats(stats)}

Write in GitHub-flavored Markdown. Include:
- 📊 Weekly Snapshot table
- 🏥 Health Assessment (1-2 sentences)
- ✅ Wins this week
- 🔧 Areas to watch
- 📋 Recommended focus for next week
Keep it under 600 words, use emoji, be direct and actionable.`;

    const response = await fetchImpl(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': gatewayKey,
        Authorization: `Bearer ${gatewayKey}`,
      },
      body: buildRequestBody(prompt),
    });

    if (!response.ok) throw new Error(`weekly summary gateway returned ${response.status ?? 'non-success'}`);
    const json = await response.json();
    const summary = json.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error('weekly summary unavailable');

    const delimiter = chooseDelimiter(summary, randomId);
    appendFile(env.GITHUB_OUTPUT, 'publishable=true\n');
    appendFile(env.GITHUB_OUTPUT, `weekly_summary<<${delimiter}\n${summary}\n${delimiter}\n`);
    console.log('✓ AI weekly summary generated');
    return { publishable: true, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`AI weekly summary failed: ${message}`);
    appendFile(env.GITHUB_OUTPUT, 'publishable=false\n');
    appendFile(
      env.GITHUB_STEP_SUMMARY,
      `# 📅 Weekly AI Health Report\n\n⚠️ Summary generation failed, so no tracker Issue was created.\n\n**Stats**\n\n${describeStats(stats)}\n`,
    );
    return { publishable: false, error: message };
  }
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  await generateWeeklySummary();
}
