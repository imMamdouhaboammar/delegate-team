import { describe, expect, it } from 'vitest';
import {
  validateUserConfig,
  formatUserConfigIssues,
} from '../src/config/user-config.js';

describe('user config validation', () => {
  it('accepts a complete config and trims string fields', () => {
    const result = validateUserConfig({
      project_id: '  demo-project  ',
      location: ' us-central1 ',
      proxy_token: ' dt-local-secret ',
    });

    expect(result).toEqual({
      ok: true,
      config: {
        project_id: 'demo-project',
        location: 'us-central1',
        proxy_token: 'dt-local-secret',
      },
      issues: [],
    });
  });

  it('rejects malformed JSON-shaped values with actionable field issues', () => {
    const result = validateUserConfig({
      project_id: '',
      location: 42,
      proxy_token: null,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { field: 'project_id', message: 'must be a non-empty string' },
      { field: 'location', message: 'must be a non-empty string' },
      { field: 'proxy_token', message: 'must be a non-empty string' },
    ]);
    expect(formatUserConfigIssues(result.issues)).toContain('Re-run `dt setup` to repair');
  });

  it('rejects arrays and primitives instead of treating them as config objects', () => {
    expect(validateUserConfig([]).ok).toBe(false);
    expect(validateUserConfig('invalid').ok).toBe(false);
    expect(validateUserConfig(null).ok).toBe(false);
  });
});
