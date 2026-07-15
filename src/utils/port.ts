const MIN_PORT = 1;
const MAX_PORT = 65_535;
const DEFAULT_PORT = 3_000;

export function parsePort(
  value: string | undefined,
  fallback = DEFAULT_PORT,
): number {
  if (value === undefined) return fallback;

  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid port "${value}". Expected an integer from ${MIN_PORT} to ${MAX_PORT}.`,
    );
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid port "${value}". Expected an integer from ${MIN_PORT} to ${MAX_PORT}.`,
    );
  }

  return port;
}
