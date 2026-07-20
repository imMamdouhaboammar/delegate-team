const SENSITIVE_KEY = /token|secret|password|authorization|api.?key|cookie/i;

function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:api[_-]?key|proxy[_-]?token|access[_-]?token|authorization|password|secret)\s*[:=]\s*["']?)[^"',\s}]+/gi,
      '$1[REDACTED]',
    );
}

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitize(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? '[REDACTED]'
      : sanitize(entry, seen);
  }
  return result;
}

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.DT_DEBUG?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

export function redactSensitive(value: unknown): string {
  if (typeof value === 'string') return redactString(value);

  try {
    return JSON.stringify(sanitize(value, new WeakSet<object>()));
  } catch {
    return '[Unserializable diagnostic]';
  }
}

export function debugLog(
  scope: string,
  message: string,
  details?: unknown,
): void {
  if (!isDebugEnabled()) return;

  const prefix = `[DT_DEBUG][${scope}] ${redactString(message)}`;
  if (details === undefined) {
    console.error(prefix);
    return;
  }
  console.error(`${prefix} ${redactSensitive(details)}`);
}
