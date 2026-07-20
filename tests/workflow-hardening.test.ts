import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = (name: string) => readFileSync(
  join(ROOT, '.github', 'workflows', name),
  'utf8',
);

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
