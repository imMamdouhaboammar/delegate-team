// trace-bus.ts — the unified neural trace bus.
//
// Previously, route traces lived in dt_traces/routing/ and delegation traces
// lived in ~/.config/dt/traces/. Two formats, two homes, no shared spine. The
// trace bus is the single coherent event log: every neuron that fires a synapse
// emits a SynapseEvent here, so the entire neural path of any task can be
// replayed as one connected record. This is what turns the system from a set
// of islands into a single connected piece.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SynapseEvent {
  event_id: string;
  ts: string; // ISO timestamp
  trace_id: string;
  from: string; // neuron id
  to: string; // neuron id
  type: string; // synapse type (ROUTES_TO, FALLBACKS_TO, ...)
  signal?: string;
  weight?: number;
  meta?: Record<string, unknown>;
}

const TRACE_DIR = join(homedir(), '.config', 'dt', 'neural');
const SESSION_TRACE_ID = `neural-${new Date().toISOString().split('T')[0]}-${process.pid}`;

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let counter = 0;

/** Emit a synapse event. Returns the written event (also persisted to disk). */
export function emitSynapse(
  from: string,
  to: string,
  type: string,
  opts: { signal?: string; weight?: number; traceId?: string; meta?: Record<string, unknown> } = {},
): SynapseEvent {
  const event: SynapseEvent = {
    event_id: `syn-${Date.now()}-${counter++}`,
    ts: new Date().toISOString(),
    trace_id: opts.traceId ?? SESSION_TRACE_ID,
    from,
    to,
    type,
    signal: opts.signal,
    weight: opts.weight,
    meta: opts.meta,
  };

  ensureDir(TRACE_DIR);
  const file = join(TRACE_DIR, `${event.event_id}.json`);
  writeFileSync(file, JSON.stringify(event, null, 2), 'utf8');
  return event;
}

/** Read the most recent synapse events (newest first), capped at `limit`. */
export function recentEvents(limit = 50): SynapseEvent[] {
  if (!existsSync(TRACE_DIR)) return [];
  const files = readdirSync(TRACE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const p = join(TRACE_DIR, f);
      return { f, p, mtimeMs: statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);

  return files.map((x) => JSON.parse(readFileSync(x.p, 'utf8')) as SynapseEvent);
}

/** All events for a given trace_id (chronological). */
export function eventsForTrace(traceId: string): SynapseEvent[] {
  return recentEvents(10000).filter((e) => e.trace_id === traceId);
}

export const NEURAL_TRACE_DIR = TRACE_DIR;
export const CURRENT_TRACE_ID = SESSION_TRACE_ID;
