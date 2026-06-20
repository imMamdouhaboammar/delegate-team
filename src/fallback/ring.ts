// VertexCoder (gemini-3.1-pro-custom-tools) is the PREFERRED fallback everywhere;
// the gemini CLI is 429-prone, so it is the ABSOLUTE LAST resort in every ring.
export const FALLBACK_RING: Record<string, string[]> = {
  codex: ["vertexcoder", "minimax", "opencode", "gemini"],
  minimax: ["vertexcoder", "codex", "opencode", "gemini"],
  opencode: ["vertexcoder", "codex", "minimax", "gemini"],
  vertexcoder: ["codex", "minimax", "opencode", "gemini"],
  gemini: ["vertexcoder", "codex", "minimax", "opencode"],
  openrouter: ["vertexcoder", "codex", "minimax", "opencode", "gemini"]
};
