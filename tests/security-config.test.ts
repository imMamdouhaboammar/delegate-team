import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { ensurePrivateDir, writePrivateFile } from '../src/commands/setup.js';
import { resolveProxyMaxBodyBytes } from '../src/proxy/config.js';
import { runServe } from '../src/proxy/server.js';

const originalLimit = process.env.DT_PROXY_MAX_BODY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLimit === undefined) delete process.env.DT_PROXY_MAX_BODY;
  else process.env.DT_PROXY_MAX_BODY = originalLimit;
});

describe('private setup files', () => {
  it('hardens private directories and existing files', () => {
    const root = mkdtempSync(join(tmpdir(), 'dt-private-'));
    const privateDir = join(root, 'config');
    mkdirSync(privateDir, { mode: 0o777 });

    ensurePrivateDir(privateDir);
    expect(statSync(privateDir).mode & 0o777).toBe(0o700);

    const configPath = join(privateDir, 'config.json');
    writeFileSync(configPath, 'old', { mode: 0o666 });
    writePrivateFile(configPath, '{"proxy_token":"private-test-token"}');

    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(configPath, 'utf8')).toBe('{"proxy_token":"private-test-token"}');
  });

  it('does not print token-bearing file contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'dt-token-log-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    writePrivateFile(join(root, 'config.json'), '{"proxy_token":"never-print-me"}');

    expect(JSON.stringify(log.mock.calls)).not.toContain('never-print-me');
    expect(JSON.stringify(error.mock.calls)).not.toContain('never-print-me');
  });
});

describe('proxy security configuration', () => {
  it('resolves default, configured, and invalid body limits', () => {
    const warnings: string[] = [];
    expect(resolveProxyMaxBodyBytes(undefined, warnings.push.bind(warnings))).toBe(2 * 1024 * 1024);
    expect(resolveProxyMaxBodyBytes('4096', warnings.push.bind(warnings))).toBe(4096);
    expect(resolveProxyMaxBodyBytes('invalid', warnings.push.bind(warnings))).toBe(2 * 1024 * 1024);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DT_PROXY_MAX_BODY');
  });

  it('uses the environment limit and binds to loopback', async () => {
    process.env.DT_PROXY_MAX_BODY = '32';
    const server = runServe(0, { requiredToken: 'proxy-test-token' });
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing TCP address');

    expect(address.address).toBe('127.0.0.1');

    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer proxy-test-token',
      },
      body: JSON.stringify({ message: 'x'.repeat(64) }),
    });
    expect(response.status).toBe(413);

    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });
});
