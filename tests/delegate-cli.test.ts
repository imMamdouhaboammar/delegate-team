import { describe, expect, it } from 'vitest';
import { buildDelegateArgs, DELEGATE_AGENTS, resolveRelayPath } from '../src/commands/delegate.js';

const REPO_ROOT = process.cwd();

describe('dt delegate — agent validation', () => {
  it('accepts the five known delegate agents', () => {
    expect(DELEGATE_AGENTS).toEqual(
      expect.arrayContaining(['agy', 'codex', 'grok', 'kimi', 'opencode']),
    );
  });

  it('rejects an unknown agent with a clear error', () => {
    expect(() => buildDelegateArgs('nope', {})).toThrowError(/unknown delegate agent/i);
  });
});

describe('dt delegate — relay resolution', () => {
  it('resolves the relay script inside the matching skill dir', () => {
    const relay = resolveRelayPath('grok', REPO_ROOT);
    expect(relay).toContain('delegate-skills');
    expect(relay).toContain('grok-delegate');
    expect(relay.endsWith('scripts/relay.mjs')).toBe(true);
  });
});

describe('dt delegate — argv building', () => {
  it('builds the baseline node relay argv with --brief', () => {
    const args = buildDelegateArgs('grok', { brief: 'x.txt' }, REPO_ROOT);
    expect(args[0]).toBe('node');
    expect(args[args.length - 2]).toBe('--brief');
    expect(args[args.length - 1]).toBe('x.txt');
    // relay path is the argument right before --brief
    expect(args[args.length - 3]).toContain('grok-delegate/scripts/relay.mjs');
  });

  it('defaults autonomy to workspace-write (no extra flag)', () => {
    const args = buildDelegateArgs('grok', { brief: 'x.txt' }, REPO_ROOT);
    expect(args).not.toContain('--read-only');
    expect(args).not.toContain('--full-access');
  });

  it('maps --read-only to the relay --read-only flag', () => {
    const args = buildDelegateArgs('codex', { brief: 'b.txt', readOnly: true }, REPO_ROOT);
    expect(args).toContain('--read-only');
  });

  it('maps --full-access to the relay --full-access flag', () => {
    const args = buildDelegateArgs('opencode', { brief: 'b.txt', fullAccess: true }, REPO_ROOT);
    expect(args).toContain('--full-access');
  });

  it('passes --model through', () => {
    const args = buildDelegateArgs('grok', { brief: 'b.txt', model: 'grok-4.5' }, REPO_ROOT);
    const i = args.indexOf('--model');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('grok-4.5');
  });

  it('passes --cd through', () => {
    const args = buildDelegateArgs('grok', { brief: 'b.txt', cd: '/tmp/repo' }, REPO_ROOT);
    const i = args.indexOf('--cd');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('/tmp/repo');
  });

  it('passes --max-turns through', () => {
    const args = buildDelegateArgs('grok', { brief: 'b.txt', maxTurns: 12 }, REPO_ROOT);
    const i = args.indexOf('--max-turns');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('12');
  });
});
