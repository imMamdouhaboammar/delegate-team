import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

describe('manifest version sync', () => {
  it('all marketplace plugin entries match package.json version', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));

    expect(marketplace.version).toBe(pkg.version);
    expect(Array.isArray(marketplace.plugins)).toBe(true);
    expect(marketplace.plugins.length).toBeGreaterThan(0);

    for (const plugin of marketplace.plugins) {
      expect(plugin.version).toBe(pkg.version);
      expect(typeof plugin.name).toBe('string');
      expect(typeof plugin.source).toBe('string');
    }
  });
});
