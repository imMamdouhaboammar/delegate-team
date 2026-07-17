// mesh.ts — the neural mesh engine for the dt CLI.
//
// This module is the TypeScript half of the connective tissue. It loads the
// single-source-of-truth registry (neural-mesh.json), exposes the neurons and
// synapses, and answers the questions that used to be answered by hardcoded
// tables (ROLE_CAPABILITIES, FALLBACK_RING):
//
//   - which backends does a role prefer?        (synapses type=ROUTES_TO)
//   - what is the failover chain for a backend?  (synapses type=FALLBACKS_TO)
//   - which delegate skill should a verdict hit? (synapses type=ROUTES_TO
//                                                 from=orchestrator)
//
// The Python orchestrator/catalog read the SAME file, so editing neural-mesh.json
// rewires both halves of the system at once. That is the "single connected piece".

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { Synapse, SynapseType } from './synapse.js';

export interface Neuron {
  id: string;
  label: string;
  kind: string;
  layer: number;
  summary: string;
  runtime: string;
  entry: string;
}

export interface MeshDoc {
  name: string;
  version: string;
  description: string;
  neurons: Neuron[];
  synapses: Synapse[];
}

const here = dirname(fileURLToPath(import.meta.url));
// src/neural/mesh.ts → repo root is two levels up (TS source).
// dist/cli.js → repo root is one level up. Resolve robustly: try the
// module-relative path first, then a cwd-relative lookup, so the command
// works whether run from source, the built dist, or any cwd in the repo.
const MODULE_MESH_PATH = join(here, '..', '..', 'neural-mesh.json');
const DIST_MESH_PATH = join(here, '..', 'neural-mesh.json');

function resolveDefaultMeshPath(): string {
  if (existsSync(MODULE_MESH_PATH)) return MODULE_MESH_PATH;
  if (existsSync(DIST_MESH_PATH)) return DIST_MESH_PATH;
  const cwdMesh = join(process.cwd(), 'neural-mesh.json');
  if (existsSync(cwdMesh)) return cwdMesh;
  return MODULE_MESH_PATH; // fall back to the canonical location
}

const DEFAULT_MESH_PATH = resolveDefaultMeshPath();

/** Pure loader — given raw JSON text, return a validated MeshDoc. */
export function parseMesh(jsonText: string): MeshDoc {
  const doc = JSON.parse(jsonText) as Partial<MeshDoc>;
  if (!doc.neurons || !Array.isArray(doc.neurons)) {
    throw new Error('neural-mesh.json: missing or invalid "neurons" array');
  }
  if (!doc.synapses || !Array.isArray(doc.synapses)) {
    throw new Error('neural-mesh.json: missing or invalid "synapses" array');
  }
  return doc as MeshDoc;
}

/** Load the mesh from disk. Override the path (useful for tests). */
export function loadMesh(meshPath: string = DEFAULT_MESH_PATH): MeshDoc {
  if (!existsSync(meshPath)) {
    throw new Error(`neural mesh not found at ${meshPath}`);
  }
  return parseMesh(readFileSync(meshPath, 'utf8'));
}

export class NeuralMesh {
  readonly doc: MeshDoc;
  private neuronIndex: Map<string, Neuron>;

  constructor(doc: MeshDoc) {
    this.doc = doc;
    this.neuronIndex = new Map(doc.neurons.map((n) => [n.id, n]));
  }

  static fromPath(meshPath: string = DEFAULT_MESH_PATH): NeuralMesh {
    return new NeuralMesh(loadMesh(meshPath));
  }

  static fromText(jsonText: string): NeuralMesh {
    return new NeuralMesh(parseMesh(jsonText));
  }

  get neurons(): Neuron[] {
    return this.doc.neurons;
  }

  get synapses(): Synapse[] {
    return this.doc.synapses;
  }

  getNeuron(id: string): Neuron | undefined {
    return this.neuronIndex.get(id);
  }

  /** All synapses of a given type leaving a neuron (out-edges). */
  outgoing(from: string, type?: SynapseType): Synapse[] {
    return this.doc.synapses.filter(
      (s) => s.from === from && (type === undefined || s.type === type),
    );
  }

  /** All synapses of a given type entering a neuron (in-edges). */
  incoming(to: string, type?: SynapseType): Synapse[] {
    return this.doc.synapses.filter(
      (s) => s.to === to && (type === undefined || s.type === type),
    );
  }

  /**
   * Preferred backends for a role, derived from ROUTES_TO synapses that
   * originate at `role-router`. Replaces ROLE_CAPABILITIES.preferred_backends.
   */
  backendsForRole(role: string): string[] {
    const edges = this.outgoing('role-router', 'ROUTES_TO')
      .filter((s) => s.signal === `role==${role.toLowerCase()}`)
      .sort((a, b) => b.weight - a.weight);
    return edges.map((s) => s.to);
  }

  /**
   * Failover chain for a backend, derived from FALLBACKS_TO synapses.
   * Replaces the hardcoded FALLBACK_RING table.
   */
  fallbackChain(backend: string): string[] {
    return this.outgoing(backend, 'FALLBACKS_TO')
      .sort((a, b) => b.weight - a.weight)
      .map((s) => s.to);
  }

  /**
   * The delegate-skill neuron an orchestrator DELEGATE verdict should hit,
   * given the chosen CLI agent (grok/codex/opencode/kimi/agy).
   */
  delegateTargetFor(agent: string): string | undefined {
    const edge = this.outgoing('orchestrator', 'ROUTES_TO').find(
      (s) => s.signal === `verdict==DELEGATE && agent==${agent}`,
    );
    return edge?.to;
  }

  /**
   * Skills/integrations the catalog should surface for a task, derived from
   * DISCOVERS synapses. Pure keyword scoring, compatible with catalog.py's
   * match_skills_to_task. Returns neuron ids sorted by weight.
   */
  discoveriesFor(keyword: string): string[] {
    const k = keyword.toLowerCase();
    return this.outgoing('catalog', 'DISCOVERS')
      .filter((s) => s.signal?.toLowerCase().includes(k) || s.to.includes(k))
      .sort((a, b) => b.weight - a.weight)
      .map((s) => s.to);
  }

  /** Neighbors of a neuron across all synapse types (id set). */
  neighbors(id: string): string[] {
    const out = this.outgoing(id).map((s) => s.to);
    const inc = this.incoming(id).map((s) => s.from);
    return Array.from(new Set([...out, ...inc]));
  }
}
