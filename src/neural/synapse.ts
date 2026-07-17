// synapse.ts — the vocabulary of the neural mesh.
//
// A synapse is a typed, weighted, intelligent connection between two neurons
// (components). The mesh uses these types to reason about how one part of the
// system can reach another. Keeping the vocabulary here means TS and Python
// agree on what a "ROUTES_TO" edge means.

export type SynapseType =
  | 'ROUTES_TO' // orchestrator/role-router deciding where a task goes
  | 'FALLBACKS_TO' // automatic failover ring edge
  | 'DISCOVERS' // catalog → skill/integration match
  | 'MEMORY_OF' // a component that reads/writes agent-kernel
  | 'COMPOSES' // a runtime that spawns another (MMAS → backend)
  | 'GATE_BEFORE' // a quality gate applied before an action
  | 'METHOD_BEFORE' // a methodology stage applied before an action
  | 'EMITS_TO'; // a neuron that writes to the trace bus

export interface Synapse {
  type: SynapseType;
  from: string; // neuron id
  to: string; // neuron id
  weight: number; // 0..1 — strength / confidence of the connection
  signal?: string; // human-readable trigger condition
}

export const SYNAPSE_TYPES: SynapseType[] = [
  'ROUTES_TO',
  'FALLBACKS_TO',
  'DISCOVERS',
  'MEMORY_OF',
  'COMPOSES',
  'GATE_BEFORE',
  'METHOD_BEFORE',
  'EMITS_TO',
];

export function isSynapseType(value: string): value is SynapseType {
  return (SYNAPSE_TYPES as string[]).includes(value);
}
