import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  debugLog,
  isDebugEnabled,
  redactSensitive,
} from '../src/utils/debug.js';

const originalDebug = process.env.DT_DEBUG;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDebug === undefined) delete process.env.DT_DEBUG;
  else process.env.DT_DEBUG = originalDebug;
});

describe('safe debug diagnostics', () => {
  it('enables debug mode only for explicit true values', () => {
    expect(isDebugEnabled({})).toBe(false);
    expect(isDebugEnabled({ DT_DEBUG: '0' })).toBe(false);
    expect(isDebugEnabled({ DT_DEBUG: '1' })).toBe(true);
    expect(isDebugEnabled({ DT_DEBUG: 'true' })).toBe(true);
    expect(isDebugEnabled({ DT_DEBUG: 'TRUE' })).toBe(true);
  });

  it('redacts secret strings and nested credential fields', () => {
    const redacted = redactSensitive({
      authorization: 'Bearer secret-bearer-value',
      proxy_token: 'proxy-secret-value',
      nested: {
        apiKey: 'api-secret-value',
        message: 'api_key=inline-secret and normal diagnostic',
      },
      path: '/tmp/project',
    });

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).toContain('normal diagnostic');
    expect(redacted).toContain('/tmp/project');
    expect(redacted).not.toContain('secret-bearer-value');
    expect(redacted).not.toContain('proxy-secret-value');
    expect(redacted).not.toContain('api-secret-value');
    expect(redacted).not.toContain('inline-secret');
  });

  it('prints nothing unless DT_DEBUG is enabled', () => {
    delete process.env.DT_DEBUG;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    debugLog('router', 'fallback selected', { status: 1 });

    expect(error).not.toHaveBeenCalled();
  });

  it('prints a stable redacted diagnostic when enabled', () => {
    process.env.DT_DEBUG = '1';
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    debugLog('router', 'fallback selected', {
      status: 1,
      stderr: 'Authorization: Bearer do-not-print-this',
    });

    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain('[DT_DEBUG][router] fallback selected');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('do-not-print-this');
  });
});
