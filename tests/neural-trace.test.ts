import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { emitSynapse, recentEvents, eventsForTrace, NEURAL_TRACE_DIR } from '../src/neural/trace-bus.js';

describe('neural trace bus', () => {
  const traceId = `test-${process.pid}-${Date.now()}`;

  afterEach(() => {
    // Clean up events we created for this test run.
    if (existsSync(NEURAL_TRACE_DIR)) {
      for (const f of require('node:fs').readdirSync(NEURAL_TRACE_DIR)) {
        if (f.startsWith('syn-')) {
          try {
            require('node:fs').unlinkSync(join(NEURAL_TRACE_DIR, f));
          } catch {
            /* ignore */
          }
        }
      }
    }
  });

  it('emits a synapse event and persists it to disk', () => {
    const ev = emitSynapse('dt-cli', 'backend-vertex', 'ROUTES_TO', {
      signal: 'router score 9',
      traceId,
    });
    expect(ev.from).toBe('dt-cli');
    expect(ev.to).toBe('backend-vertex');
    expect(ev.type).toBe('ROUTES_TO');
    expect(ev.trace_id).toBe(traceId);
    expect(existsSync(join(NEURAL_TRACE_DIR, `${ev.event_id}.json`))).toBe(true);
  });

  it('records the event in recentEvents', () => {
    emitSynapse('orchestrator', 'delegate-grok', 'ROUTES_TO', { traceId });
    const events = recentEvents(100);
    expect(events.some((e) => e.from === 'orchestrator' && e.to === 'delegate-grok')).toBe(true);
  });

  it('filters events by trace id', () => {
    emitSynapse('a', 'b', 'EMITS_TO', { traceId });
    const scoped = eventsForTrace(traceId);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((e) => e.trace_id === traceId)).toBe(true);
  });
});
