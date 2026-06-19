export const FALLBACK_RING: Record<string, string[]> = {
  codex: ["minimax", "opencode", "vertexcoder", "gemini"],
  minimax: ["codex", "opencode", "vertexcoder", "gemini"],
  opencode: ["codex", "minimax", "vertexcoder", "gemini"],
  vertexcoder: ["codex", "minimax", "opencode", "gemini"],
  gemini: ["vertexcoder", "codex", "minimax", "opencode"],
  openrouter: ["vertexcoder", "codex", "minimax", "opencode"]
};
