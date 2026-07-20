export const ExitCode = {
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 64,
  CONFIG: 78,
  MISSING_DEPENDENCY: 127,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
