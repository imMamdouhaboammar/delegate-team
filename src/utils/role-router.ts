export interface RoleCapability {
  role: string;
  needs: string[];
  preferred_backends: string[];
}

export const ROLE_CAPABILITIES: RoleCapability[] = [
  {
    role: "architect",
    needs: ["reasoning", "system-design"],
    preferred_backends: ["claude", "gpt", "gemini-pro"]
  },
  {
    role: "coder",
    needs: ["repo-editing", "patch-generation"],
    preferred_backends: ["codex", "vertex-coder"]
  },
  {
    role: "ui-implementer",
    needs: ["frontend", "visual-code"],
    preferred_backends: ["minimax", "codex"]
  },
  {
    role: "reviewer",
    needs: ["diff-review", "security", "tests"],
    preferred_backends: ["claude-code", "gpt-high-reasoning"]
  }
];

export class RoleRouter {
  public static selectBackendForRole(roleName: string): string {
    const roleDef = ROLE_CAPABILITIES.find(r => r.role === roleName.toLowerCase());
    if (roleDef && roleDef.preferred_backends.length > 0) {
      // In a real scenario, this might check active backends or health.
      // For now, return the primary preferred backend.
      return roleDef.preferred_backends[0];
    }
    // Fallback if role is not strictly defined
    return "vertex-coder";
  }
}
