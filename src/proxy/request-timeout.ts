export const DEFAULT_BACKEND_TIMEOUT_MS = 30_000;

export class BackendTimeoutError extends Error {
  readonly status = 504;

  constructor(
    readonly backend: string,
    readonly timeoutMs: number,
  ) {
    super(`Backend ${backend} timed out after ${timeoutMs}ms`);
    this.name = 'BackendTimeoutError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      backend: this.backend,
      timeoutMs: this.timeoutMs,
      status: this.status,
    };
  }
}

export function createBackendTimeout(timeoutMs: number, backend: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new BackendTimeoutError(backend, timeoutMs)), timeoutMs);
  });
}

export function readBackendTimeoutMs(envValue: string | undefined): number {
  if (!envValue) return DEFAULT_BACKEND_TIMEOUT_MS;

  const parsed = Number.parseInt(envValue, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_BACKEND_TIMEOUT_MS;
  }

  return parsed;
}
