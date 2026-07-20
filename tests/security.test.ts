import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import { runServe } from '../src/proxy/server';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';


describe('Delegate Team Security Behaviors', () => {

  describe('Proxy Server Security', () => {
    let server: http.Server;
    let proxyUrl: string;
    
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
      server = runServe(0);
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Proxy test server did not expose a TCP port');
      }
      proxyUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      if (!server?.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    });

    it('should reject requests without a valid token', async () => {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'hello' })
      });
      expect(response.status).toBe(401);
    });

    it('should apply CORS restrictively to valid tokens', async () => {
      const response = await fetch(proxyUrl, {
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
    }, 15000);

    it('should reject payloads larger than 2MB', async () => {
      // Create a 3MB string
      const largeBody = 'a'.repeat(3 * 1024 * 1024);
      const response = await fetch(proxyUrl, {
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

    it('should block absolute paths in git diff', () => {
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

res = run_command("git diff --no-index /etc/passwd /dev/null")
if "Security Error" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
      `;
      const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
      expect(out).toContain('BLOCKED');
    });
  });

  describe('TraceManager Security', () => {
    it('should prevent recursive MetaGPT execution by verifying depth bounds', async () => {
      // Simulate being inside a deep execution
      process.env.DT_EXECUTION_DEPTH = '2'; 
      const { TraceManager } = await import('../src/utils/tracer.js');
      const tracer = new TraceManager();
      const trace = tracer.createTrace();
      // current_depth should be 2 + 1 = 3, which is > max_depth (2)
      expect(trace.depth_control.current_depth).toBeGreaterThan(trace.depth_control.max_depth);
    });
  });

  describe('MetaGPT Adapter Security', () => {
    it('should not write dummy dt-proxy-token if real token exists', () => {
      const script = `
import sys
import os
import json

os.environ['PROXY_TOKEN'] = 'real-secure-token'
sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from dt_metagpt_adapter import get_proxy_token

token = get_proxy_token()
print(token)
      `;
      const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
      expect(out).toBe('real-secure-token');
    });
  });
});
