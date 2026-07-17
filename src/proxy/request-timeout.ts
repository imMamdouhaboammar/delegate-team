import https from 'node:https';

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

  const parsed = Number(envValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_BACKEND_TIMEOUT_MS;
  }

  return parsed;
}

let installedTimeoutMs: number | undefined;

function backendNameFromRequestArgs(args: unknown[]): string {
  const first = args[0];
  const rawUrl = typeof first === 'string'
    ? first
    : first instanceof URL
      ? first.toString()
      : undefined;

  if (!rawUrl) return 'upstream';

  try {
    return new URL(rawUrl).hostname || 'upstream';
  } catch {
    return 'upstream';
  }
}

export function installBackendRequestTimeout(timeoutMs = readBackendTimeoutMs(process.env.DT_PROXY_BACKEND_TIMEOUT_MS)): number {
  if (installedTimeoutMs !== undefined) return installedTimeoutMs;

  const originalRequest = https.request.bind(https);
  https.request = ((...args: Parameters<typeof https.request>) => {
    const request = originalRequest(...args);
    const backend = backendNameFromRequestArgs(args);

    request.setTimeout(timeoutMs, () => {
      request.destroy(new BackendTimeoutError(backend, timeoutMs));
    });

    return request;
  }) as typeof https.request;

  installedTimeoutMs = timeoutMs;
  return installedTimeoutMs;
}
