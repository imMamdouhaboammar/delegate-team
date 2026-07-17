import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseMesh, NeuralMesh, loadMesh } from '../src/neural/mesh.js';
import { isSynapseType, SYNAPSE_TYPES } from '../src/neural/synapse.js';

const MESH_PATH = join(process.cwd(), 'neural-mesh.json');

describe('neural mesh loader', () => {
  it('parses the repo neural-mesh.json into a valid doc', () => {
    const doc = loadMesh(MESH_PATH);
    expect(doc.neurons.length).toBeGreaterThan(10);
    expect(doc.synapses.length).toBeGreaterThan(10);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseMesh('{not json')).toThrow();
  });

  it('throws when neurons array is missing', () => {
    expect(() => parseMesh(JSON.stringify({ synapses: [] }))).toThrow(/neurons/);
  });
});

describe('NeuralMesh graph queries', () => {
  const mesh = NeuralMesh.fromPath(MESH_PATH);

  it('resolves preferred backend for a role from ROUTES_TO synapses', () => {
    expect(mesh.backendsForRole('coder')).toContain('backend-codex');
    expect(mesh.backendsForRole('architect')).toContain('backend-vertex');
    expect(mesh.backendsForRole('ui-implementer')).toContain('backend-minimax');
  });

  it('resolves the full failover chain from FALLBACKS_TO synapses', () => {
    const chain = mesh.fallbackChain('backend-codex');
    expect(chain[0]).toBe('backend-vertex'); // highest weight
    expect(chain).toEqual([
      'backend-vertex',
      'backend-minimax',
      'backend-opencode',
      'backend-gemini',
    ]);
  });

  it('maps a DELEGATE verdict to the right delegate-skill neuron', () => {
    expect(mesh.delegateTargetFor('grok')).toBe('delegate-grok');
    expect(mesh.delegateTargetFor('codex')).toBe('delegate-codex');
    expect(mesh.delegateTargetFor('opencode')).toBe('delegate-opencode');
    expect(mesh.delegateTargetFor('kimi')).toBe('delegate-kimi');
    expect(mesh.delegateTargetFor('agy')).toBe('delegate-agy');
  });

  it('finds catalog discoveries for a keyword', () => {
    const grok = mesh.discoveriesFor('grok');
    expect(grok).toContain('delegate-grok');
  });

  it('returns neighbors across all synapse types', () => {
    const neighbors = mesh.neighbors('backend-vertex');
    expect(neighbors).toContain('backend-codex'); // fallback ring
    expect(neighbors).toContain('role-router'); // routes_to
  });

  it('every synapse references existing neurons', () => {
    for (const s of mesh.synapses) {
      expect(mesh.getNeuron(s.from), `missing from=${s.from}`).toBeDefined();
      expect(mesh.getNeuron(s.to), `missing to=${s.to}`).toBeDefined();
    }
  });
});

describe('synapse vocabulary', () => {
  it('enumerates the eight edge types', () => {
    expect(SYNAPSE_TYPES).toEqual([
      'ROUTES_TO',
      'FALLBACKS_TO',
      'DISCOVERS',
      'MEMORY_OF',
      'COMPOSES',
      'GATE_BEFORE',
      'METHOD_BEFORE',
      'EMITS_TO',
    ]);
  });

  it('validates type strings', () => {
    expect(isSynapseType('ROUTES_TO')).toBe(true);
    expect(isSynapseType('NOPE')).toBe(false);
  });
});
