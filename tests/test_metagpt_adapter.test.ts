import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('MetaGPT Adapter & Guardrails', () => {

  it('should block write_file when DT_PLAN_ONLY is true', () => {
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

os.environ['DT_PLAN_ONLY'] = 'true'
sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import write_file

res = write_file("test.txt", "hello")
if "Blocked by guardrail" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
    `;
    const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
    expect(out).toContain('BLOCKED');
  });

  it('should block line_replace when DT_DRY_RUN is true', () => {
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

os.environ['DT_DRY_RUN'] = 'true'
sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import line_replace

res = line_replace("test.txt", 1, 1, "a", "b")
if "Blocked by guardrail" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
    `;
    const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
    expect(out).toContain('BLOCKED');
  });

  it('should block write_file when DT_APPROVE_WRITE is true and DT_WRITE_APPROVED is missing', () => {
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

os.environ['DT_APPROVE_WRITE'] = 'true'
sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import write_file

res = write_file("test.txt", "hello")
if "Human approval is required" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
    `;
    const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
    expect(out).toContain('BLOCKED');
  });

  it('should allow write_file when DT_APPROVE_WRITE is true but DT_WRITE_APPROVED is true', () => {
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

os.environ['DT_APPROVE_WRITE'] = 'true'
os.environ['DT_WRITE_APPROVED'] = 'true'
sys.path.append(os.path.join(os.getcwd(), 'vertex-coder'))
from tools_registry import write_file

# Write to a temp file to test the allow logic
test_file = os.path.join(os.getcwd(), "tests", ".temp_test_write.txt")
res = write_file(test_file, "hello")
if "Human approval is required" in res:
    print("BLOCKED")
else:
    print("ALLOWED")
if os.path.exists(test_file):
    os.remove(test_file)
    `;
    const out = execSync(`python3`, { input: script, encoding: 'utf8' }).trim();
    expect(out).toContain('ALLOWED');
  });

});
