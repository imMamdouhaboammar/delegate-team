import { describe, expect, it } from 'vitest';
import { parsePort } from '../src/utils/port.js';

describe('parsePort', () => {
  it('uses the default port when no value is provided', () => {
    expect(parsePort(undefined)).toBe(3000);
  });

  it('accepts an integer port inside the TCP range', () => {
    expect(parsePort('3210')).toBe(3210);
    expect(parsePort('65535')).toBe(65535);
  });

  it.each(['0', '65536', '-1', 'abc', '3000x', '1.5', ''])(
    'rejects invalid port value %j',
    (value) => {
      expect(() => parsePort(value)).toThrowError(/port.*1.*65535/i);
    },
  );
});
