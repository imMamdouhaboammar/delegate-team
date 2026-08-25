import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repoRoot = process.cwd();
const spawnTeamScript = path.join(repoRoot, 'mmas', 'spawn-team.py');

describe('MMAS agent config containment', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmas-agent-config-'));
  const agentsDir = path.join(tmpDir, 'agents');
  const outsideDir = path.join(tmpDir, 'outside');

  beforeAll(() => {
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'safe.yaml'), 'name: safe\nbackend: mock-backend\n');
    fs.writeFileSync(path.join(outsideDir, 'escaped.yaml'), 'name: escaped\nbackend: mock-backend\n');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const loadAgent = (agentName: string) => {
    const python = `
import importlib.util
import json

spec = importlib.util.spec_from_file_location("spawn_team", ${JSON.stringify(spawnTeamScript)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    result = module.load_agent(${JSON.stringify(agentName)})
    print(json.dumps({"ok": True, "name": result.get("name")}))
except Exception as exc:
    print(json.dumps({"ok": False, "type": type(exc).__name__, "message": str(exc)}))
`;
    return JSON.parse(execFileSync('python3', ['-c', python], {
      env: { ...process.env, MMAS_AGENTS_DIR: agentsDir },
      encoding: 'utf8',
    }).trim());
  };

  it('loads a normal direct-child agent config', () => {
    expect(loadAgent('safe')).toMatchObject({ ok: true, name: 'safe' });
  });

  it('rejects parent traversal outside MMAS_AGENTS_DIR', () => {
    const result = loadAgent('../outside/escaped');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/agent config|escape|invalid/i);
  });

  it('rejects nested path syntax instead of treating agent names as paths', () => {
    const nestedDir = path.join(agentsDir, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'hidden.yaml'), 'name: hidden\nbackend: mock-backend\n');

    const result = loadAgent('nested/hidden');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/agent config|invalid/i);
  });

  it('rejects an absolute agent path', () => {
    const absoluteName = path.join(outsideDir, 'escaped').replace(/\\/g, '/');
    const result = loadAgent(absoluteName);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/agent config|escape|invalid/i);
  });

  it('rejects a symlinked config even when the link itself is a direct child', () => {
    const link = path.join(agentsDir, 'linked.yaml');
    fs.symlinkSync(path.join(outsideDir, 'escaped.yaml'), link);

    const result = loadAgent('linked');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/agent config|escape|symlink|invalid/i);
  });
});
