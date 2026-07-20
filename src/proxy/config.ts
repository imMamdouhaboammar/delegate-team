export const DEFAULT_PROXY_MAX_BODY_BYTES = 2 * 1024 * 1024;

export function resolveProxyMaxBodyBytes(
  raw: string | undefined,
  warn: (message: string) => void = console.warn,
): number {
  if (!raw) return DEFAULT_PROXY_MAX_BODY_BYTES;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    warn(
      `[PROXY] Ignoring invalid DT_PROXY_MAX_BODY=${JSON.stringify(raw)}. ` +
      `Using ${DEFAULT_PROXY_MAX_BODY_BYTES}.`,
    );
    return DEFAULT_PROXY_MAX_BODY_BYTES;
  }

  return parsed;
}
