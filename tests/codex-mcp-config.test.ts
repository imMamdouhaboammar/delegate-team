import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = readFileSync(join(ROOT, '.codex', 'config.toml'), 'utf8');

function npxPackageSpecs(source: string): string[] {
  const lines = source.split('\n');
  const specs: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== 'command = "npx"') continue;
    const args = lines[index + 1]?.match(/^args = \[(.*)\]$/)?.[1] ?? '';
    const values = [...args.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const packageSpec = values.find((value) => value.startsWith('@'));
    if (packageSpec) specs.push(packageSpec);
  }

  return specs;
}

describe('Codex MCP configuration', () => {
  it('uses GitHub supported read-only remote MCP instead of the deprecated npm server', () => {
    expect(config).not.toContain('@modelcontextprotocol/server-github');
    expect(config).toContain('url = "https://api.githubcopilot.com/mcp/readonly"');
  });

  it('pins every locally executed npm MCP package to an exact reviewed version', () => {
    const specs = npxPackageSpecs(config);
    expect(specs.length).toBeGreaterThan(0);

    for (const spec of specs) {
      expect(spec).not.toContain('@latest');
      expect(spec).toMatch(/^@[^/]+\/[^@]+@\d+(?:\.\d+){2}$/);
    }
  });
});
