import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { runServe } from '../src/proxy/server';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

const PROXY_PORT = 3215; // use different port for tests
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;

describe('Delegate Team Security Behaviors', () => {

  describe('Proxy Server Security', () => {
    let serverProcess: any;
    
    beforeAll(async () => {
      // Create dummy proxy config
      const configDir = path.join(os.homedir(), '.config', 'dt');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.json');
      
      let config = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      config['proxy_token'] = 'test-security-token';
      fs.writeFileSync(configPath, JSON.stringify(config));

      // We run the server inline
      runServe(PROXY_PORT);
      // Wait a bit for server to listen
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should reject requests without a valid token', async () => {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'hello' })
      });
      expect(response.status).toBe(401);
    });

    it('should apply CORS restrictively to valid tokens', async () => {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-security-token',
          'Origin': 'http://malicious-site.com'
        },
        body: JSON.stringify({ message: 'hello' })
      });
      // The proxy shouldn't echo back the malicious origin
      const corsHeader = response.headers.get('access-control-allow-origin');
      expect(corsHeader).not.toBe('http://malicious-site.com');
      // Origin is invalid, but standard fetches from node might just get 400 Bad Request since it doesn't match standard payload
    });

    it('should reject payloads larger than 2MB', async () => {
      // Create a 3MB string
      const largeBody = 'a'.repeat(3 * 1024 * 1024);
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-security-token'
        },
        body: largeBody
      });
      expect(response.status).toBe(413);
    });
  });

  describe('Agent Tools Security (Vertex Coder)', () => {
    const toolsRegistryPath = path.join(process.cwd(), 'vertex-coder', 'tools_registry.py');

    it('should block unsafe commands in run_command by default', () => {
      const script = `
import sys
import os
import types

class MockGenAI:
    class types:
        class FunctionDeclaration:
            def __init__(self, **kwargs): pass
        class Tool:
            def __init__(self, **kwargs): pass
        class HttpOptions:
            def __init__(self, **kwargs): pass
        class GenerateContentConfig:
            def __init__(self, **kwargs): pass

mock_google = types.ModuleType('google')
mock_google.genai = MockGenAI
sys.modules['google'] = mock_google
sys.modules['google.genai'] = MockGenAI

sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import run_command

res = run_command("rm -rf /")
if "rejected by hard denylist" in res or "Security Error" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
      `;
      const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
      expect(out).toContain('BLOCKED');
    });

    it('should block escaping workspace in file tools', () => {
      const script = `
import sys
import os
import types

class MockGenAI:
    class types:
        class FunctionDeclaration:
            def __init__(self, **kwargs): pass
        class Tool:
            def __init__(self, **kwargs): pass
        class HttpOptions:
            def __init__(self, **kwargs): pass
        class GenerateContentConfig:
            def __init__(self, **kwargs): pass

mock_google = types.ModuleType('google')
mock_google.genai = MockGenAI
sys.modules['google'] = mock_google
sys.modules['google.genai'] = MockGenAI

os.environ['DT_WORKSPACE_ROOT'] = os.getcwd()
sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import read_file

res = read_file("../../../../../etc/passwd")
if "Security Error" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
      `;
      const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
      expect(out).toContain('BLOCKED');
    });

    it('should block add_dependency without explicit approval', () => {
      const script = `
import sys
import os
import types

class MockGenAI:
    class types:
        class FunctionDeclaration:
            def __init__(self, **kwargs): pass
        class Tool:
            def __init__(self, **kwargs): pass
        class HttpOptions:
            def __init__(self, **kwargs): pass
        class GenerateContentConfig:
            def __init__(self, **kwargs): pass

mock_google = types.ModuleType('google')
mock_google.genai = MockGenAI
sys.modules['google'] = mock_google
sys.modules['google.genai'] = MockGenAI

sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import add_dependency

res = add_dependency("malicious-pkg")
if "Security Error" in res and "explicit approval" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
      `;
      const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
      expect(out).toContain('BLOCKED');
    });
  });
});
