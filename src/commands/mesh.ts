// mesh.ts — the `dt mesh` command.
//
// User-facing window into the neural mesh: see the system as one connected
// piece. Lists neurons, lists synapses, prints a graphviz-style view, and
// replays the live neural trace bus.

import { NeuralMesh } from '../neural/mesh.js';
import { recentEvents, NEURAL_TRACE_DIR } from '../neural/trace-bus.js';
import { existsSync } from 'node:fs';

export type MeshFormat = 'human' | 'json' | 'graph';

export function runMesh(options: {
  format?: MeshFormat;
  last?: boolean;
  neurons?: boolean;
  synapses?: boolean;
  trace?: boolean;
}): number {
  const format = options.format ?? 'human';

  let mesh: NeuralMesh;
  try {
    mesh = NeuralMesh.fromPath();
  } catch (err) {
    console.error(`\n❌ Could not load neural mesh: ${(err as Error).message}`);
    return 2;
  }

  // Trace-only mode: print recent synapse events from the bus.
  if (options.trace || options.last) {
    const events = recentEvents(options.last ? 1 : 50);
    if (format === 'json') {
      process.stdout.write(JSON.stringify(events, null, 2) + '\n');
      return 0;
    }
    if (events.length === 0) {
      console.log(`No neural events recorded yet in ${NEURAL_TRACE_DIR}`);
      return 0;
    }
    for (const e of events) {
      console.log(`${e.ts}  ${e.from} --[${e.type}]--> ${e.to}  (${e.signal ?? ''})`);
    }
    return 0;
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(mesh.doc, null, 2) + '\n');
    return 0;
  }

  if (format === 'graph') {
    // DOT graph — pipe to `dot -Tsvg` for a picture of the connected system.
    console.log('digraph neural_mesh {');
    console.log('  rankdir=LR;');
    for (const n of mesh.neurons) {
      console.log(`  "${n.id}" [label="${n.label}\\n(L${n.layer})"];`);
    }
    for (const s of mesh.synapses) {
      console.log(`  "${s.from}" -> "${s.to}" [label="${s.type}", weight="${s.weight}"];`);
    }
    console.log('}');
    return 0;
  }

  // Human-readable summary.
  console.log(`\n🧠 Neural Mesh — ${mesh.doc.neurons.length} neurons, ${mesh.doc.synapses.length} synapses\n`);

  if (options.neurons !== false) {
    console.log(`${'NEURON'.padEnd(22)}${'LAYER'.padEnd(6)}KIND`);
    console.log('-'.repeat(48));
    for (const n of mesh.neurons.slice().sort((a, b) => a.layer - b.layer)) {
      console.log(`${n.id.padEnd(22)}${String(n.layer).padEnd(6)}${n.kind}`);
    }
    console.log('');
  }

  if (options.synapses !== false) {
    console.log(`${'FROM'.padEnd(20)}${'→'.padEnd(4)}${'TO'.padEnd(22)}TYPE`);
    console.log('-'.repeat(52));
    for (const s of mesh.synapses) {
      console.log(`${s.from.padEnd(20)}${'→'.padEnd(4)}${s.to.padEnd(22)}${s.type}`);
    }
    console.log('');
  }

  console.log(`Neural trace bus: ${existsSync(NEURAL_TRACE_DIR) ? NEURAL_TRACE_DIR : '(no events yet)'}`);
  console.log(`Run 'dt mesh --trace' to replay live synapse events.\n`);
  return 0;
}
