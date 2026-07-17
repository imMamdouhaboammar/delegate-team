import { describe, expect, it } from 'vitest';
import {
  BackendTimeoutError,
  DEFAULT_BACKEND_TIMEOUT_MS,
  createBackendTimeout,
  readBackendTimeoutMs,
} from '../src/proxy/request-timeout.js';

describe('backend request timeout', () => {
  it('rejects with a typed timeout error after the configured delay', async () => {
    await expect(createBackendTimeout(5, 'openai')).rejects.toEqual(
      expect.objectContaining({
        name: 'BackendTimeoutError',
        backend: 'openai',
        timeoutMs: 5,
        status: 504,
      }),
    );
  });

  it('exposes a stable user-facing message without credentials', () => {
    const error = new BackendTimeoutError('gemini', 2500);

    expect(error.message).toBe('Backend gemini timed out after 2500ms');
    expect(JSON.stringify(error)).not.toContain('token');
  });

  it('accepts a positive integer timeout override', () => {
    expect(readBackendTimeoutMs('45000')).toBe(45_000);
  });

  it.each(['0', '-1', 'abc', '1.5', String(Number.MAX_SAFE_INTEGER + 1)])(
    'falls back for invalid timeout value %s',
    (value) => {
      expect(readBackendTimeoutMs(value)).toBe(DEFAULT_BACKEND_TIMEOUT_MS);
    },
  );
});
