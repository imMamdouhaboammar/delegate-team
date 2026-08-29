import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const watchdog = readFileSync(join(process.cwd(), 'mmas', 'watchdog.sh'), 'utf8');

describe('MMAS watchdog completion authority', () => {
  it('does not mark a still-running stuck worker done merely because a summary exists', () => {
    expect(watchdog).not.toContain('stuck but has summary — marking done');
    expect(watchdog).not.toMatch(/if \[\[ -n "\$summary_file" && -f "\$summary_file" \]\]; then\s+log "Agent \$agent_name is stuck but has summary[^\n]*"\s+set_agent_status "\$agent_name" "done"/m);
  });

  it('requires process exit before summary presence can authorize done', () => {
    expect(watchdog).toMatch(/if ! is_pid_alive "\$pid"; then[\s\S]*-f "\$summary_file"[\s\S]*set_agent_status "\$agent_name" "done"/m);
  });
});
