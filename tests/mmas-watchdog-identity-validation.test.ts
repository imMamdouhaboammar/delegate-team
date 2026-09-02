import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const watchdogSource = readFileSync(join(process.cwd(), 'mmas', 'watchdog.sh'), 'utf8');

describe('MMAS watchdog worker identity verification', () => {
  it('preserves PID-only compatibility only when started_at evidence is absent', () => {
    expect(watchdogSource).toMatch(
      /if \[\[ -z "\$expected_started_at" \|\| "\$expected_started_at" == "null" \]\]; then\s+return 0\s+fi/m,
    );
  });

  it('fails closed when a present started_at value cannot be parsed', () => {
    expect(watchdogSource).toMatch(
      /if ! expected_epoch=\$\(iso_timestamp_epoch "\$expected_started_at"\); then[\s\S]*return 1[\s\S]*fi/m,
    );
    expect(watchdogSource).not.toContain(
      'expected_epoch=$(iso_timestamp_epoch "$expected_started_at") || return 0',
    );
  });

  it('fails closed when the OS process start time cannot be resolved', () => {
    expect(watchdogSource).toMatch(
      /if ! actual_epoch=\$\(process_started_epoch "\$pid"\); then[\s\S]*return 1[\s\S]*fi/m,
    );
    expect(watchdogSource).not.toContain(
      'actual_epoch=$(process_started_epoch "$pid") || return 0',
    );
  });

  it('records why present identity evidence was rejected', () => {
    expect(watchdogSource).toContain('malformed started_at identity evidence');
    expect(watchdogSource).toContain('cannot resolve process start time');
    expect(watchdogSource).toContain('treating PID as unverifiable');
  });
});
