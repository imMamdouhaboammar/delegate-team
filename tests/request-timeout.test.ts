import { describe, expect, it } from 'vitest';
import { BackendTimeoutError, createBackendTimeout } from '../src/proxy/request-timeout.js';

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
});
