import { vi } from 'vitest';

export type ConsoleCapture = {
  logs: string[];
  errors: string[];
};

function renderArgs(args: unknown[]): string {
  return args.map((value) => typeof value === 'string' ? value : String(value)).join(' ');
}

/**
 * Captures user-visible console output without coupling tests to mock call arrays.
 */
export function captureConsole(): ConsoleCapture {
  const logs: string[] = [];
  const errors: string[] = [];

  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(renderArgs(args));
  });

  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(renderArgs(args));
  });

  return { logs, errors };
}
