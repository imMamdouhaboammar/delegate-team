import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = (name: string) => readFileSync(
  join(ROOT, '.github', 'workflows', name),
  'utf8',
);

function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function checkoutCredentialSettings(source: string): boolean[] {
  const lines = source.split('\n');
  const settings: boolean[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes('uses: actions/checkout@')) continue;

    const usesIndent = indentation(line);
    const directListItem = /^\s*-\s*uses:/.test(line);
    const stepIndent = directListItem ? usesIndent : Math.max(0, usesIndent - 2);
    const propertyIndent = stepIndent + 2;
    let withIndent: number | null = null;
    let persistCredentialsDisabled = false;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (!nextLine.trim()) continue;

      const nextIndent = indentation(nextLine);
      if (nextIndent < stepIndent) break;
      if (nextIndent === stepIndent && /^\s*-\s+/.test(nextLine)) break;

      if (nextIndent === propertyIndent && nextLine.trim() === 'with:') {
        withIndent = nextIndent;
        continue;
      }

      if (withIndent !== null && nextIndent <= withIndent) {
        withIndent = null;
      }

      if (
        withIndent !== null
        && nextIndent === withIndent + 2
        && nextLine.trim() === 'persist-credentials: false'
      ) {
        persistCredentialsDisabled = true;
      }
    }

    settings.push(persistCredentialsDisabled);
  }

  return settings;
}

describe('GitHub workflow hardening', () => {
  it('keeps every workflow valid UTF-8 without a BOM', () => {
    for (const name of [
      'ai-autofix.yml', 'ai-guardian.yml', 'ai-issue-reporter.yml',
      'apisec-scan.yml', 'ci.yml', 'codeql.yml',
      'defender-for-devops.yml', 'dependency-review.yml', 'devskim.yml',
      'npm-pack-integrity.yml', 'quality-gate.yml', 'secret-scan.yml',
      'snyk-security.yml',
    ]) {
      const bytes = readFileSync(join(ROOT, '.github', 'workflows', name));
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).not.toThrow();
    }
  });

  it('does not restore the stalled Codacy workflow', () => {
    expect(existsSync(join(ROOT, '.github', 'workflows', 'codacy.yml'))).toBe(false);
  });

  it('uses explicit least-privilege permissions for CI security workflows', () => {
    expect(workflow('ci.yml')).toContain(
      'permissions:\n  contents: read\n\njobs:',
    );
    expect(workflow('ci.yml')).toContain(
      'python -m bandit -r vertex-coder minimax-coder aonios-agent mmas orchestrator/scripts -lll',
    );
    expect(workflow('defender-for-devops.yml')).toContain(
      'permissions:\n  actions: read\n  contents: read\n  security-events: write',
    );
    expect(workflow('devskim.yml')).toContain(
      'permissions:\n  contents: read\n\njobs:',
    );
  });

  it('only accepts the direct checkout persist-credentials input', () => {
    expect(checkoutCredentialSettings([
      'steps:',
      '  - uses: actions/checkout@v4',
      '    env:',
      '      persist-credentials: false',
    ].join('\n'))).toEqual([false]);

    expect(checkoutCredentialSettings([
      'steps:',
      '  - uses: actions/checkout@v4',
      '    with:',
      '      token:',
      '        persist-credentials: false',
    ].join('\n'))).toEqual([false]);

    expect(checkoutCredentialSettings([
      'jobs:',
      '  build:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '  later:',
      '    persist-credentials: false',
    ].join('\n'))).toEqual([false]);

    expect(checkoutCredentialSettings([
      'steps:',
      '  - name: Checkout',
      '    uses: actions/checkout@v4',
      '    with:',
      '      persist-credentials: false',
    ].join('\n'))).toEqual([true]);
  });

  it('does not persist checkout credentials in read-only PR validation workflows', () => {
    for (const name of [
      'ci.yml',
      'codeql.yml',
      'defender-for-devops.yml',
      'dependency-review.yml',
      'devskim.yml',
      'npm-pack-integrity.yml',
      'quality-gate.yml',
      'secret-scan.yml',
      'semgrep.yml',
      'snyk-security.yml',
    ]) {
      const settings = checkoutCredentialSettings(workflow(name));
      expect(settings.length, `${name} must contain a checkout step`).toBeGreaterThan(0);
      expect(settings, `${name} must disable persisted checkout credentials`).not.toContain(false);
    }
  });

  it('does not upload SARIF from untrusted fork pull requests', () => {
    expect(workflow('defender-for-devops.yml')).toContain(
      "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  it('passes AI reports through environment variables instead of source interpolation', () => {
    const guardian = workflow('ai-guardian.yml');
    expect(guardian).toContain(
      'CI_REPORT_JSON: ${{ needs.ai-analysis.outputs.ai_report }}',
    );
    expect(guardian).toContain(
      'TEST_GUARD_REPORT_JSON: ${{ needs.test-guard-review.outputs.test_guard_report }}',
    );
    expect(guardian).toContain(
      "JSON.parse(process.env.CI_REPORT_JSON || '{}')",
    );
    expect(guardian).toContain(
      "JSON.parse(process.env.TEST_GUARD_REPORT_JSON || '{}')",
    );
    expect(guardian).not.toContain('JSON.parse(`${{ needs.');
    expect(guardian).toContain('REPORT: ${{ steps.review.outputs.test_guard_report }}');
    expect(guardian).toContain('HAS_V: ${{ steps.review.outputs.has_violations }}');
    expect(guardian).toContain('MUST: ${{ steps.review.outputs.must_fix_count }}');
    expect(guardian).not.toContain("REPORT='${{ steps.review.outputs.test_guard_report }}'");
    expect(guardian).toContain('HEALTH_REPORT_JSON: ${{ needs.health-scan.outputs.report_json }}');
    expect(guardian).toContain("const scanData = env.HEALTH_REPORT_JSON || '{}'");
    expect(guardian).not.toContain("cat > /tmp/scan_data.json");
    expect(guardian).not.toContain('"ai_analysis": ${{ needs.ai-analysis.outputs.ai_report }}');
  });

  it('publishes weekly AI health issues only from substantive generated summaries', () => {
    const reporter = workflow('ai-issue-reporter.yml');
    expect(reporter).toContain("appendFileSync(process.env.GITHUB_OUTPUT, 'publishable=true\\n')");
    expect(reporter).toContain("appendFileSync(process.env.GITHUB_OUTPUT, 'publishable=false\\n')");
    expect(reporter).toContain("if: steps.weekly_ai.outputs.publishable == 'true'");
    expect(reporter).toContain("if (!res.ok || !summary) throw new Error('weekly summary unavailable')");
    expect(reporter).not.toContain('AI summary unavailable this week.');
  });

  it('keeps AI autofix issue classification internally consistent', () => {
    const autofix = workflow('ai-autofix.yml');
    expect(autofix).toContain('const fixableIssues = mechanicalFixes;');
    expect(autofix).toContain("node-version: '24.x'");
    expect(autofix).not.toContain("node-version: '22.x'");
  });

  it('keeps generated security scanner artifacts out of git', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.gdn\/$/m);
  });
});
