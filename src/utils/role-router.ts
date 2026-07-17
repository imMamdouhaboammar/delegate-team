// role-router.ts — now mesh-driven.
//
// The role→backend preference table used to live here as a hardcoded constant.
// It now consults the NeuralMesh (neural-mesh.json), so editing the mesh
// rewires routing for both the TS CLI and the Python orchestrator.

import { NeuralMesh } from '../neural/mesh.js';

export interface RoleCapability {
  role: string;
  needs: string[];
  preferred_backends: string[];
}

// Capability metadata kept local (needs are descriptive, not in the mesh).
const ROLE_NEEDS: Record<string, string[]> = {
  architect: ['reasoning', 'system-design'],
  coder: ['repo-editing', 'patch-generation'],
  'ui-implementer': ['frontend', 'visual-code'],
  reviewer: ['diff-review', 'security', 'tests'],
};

let mesh: NeuralMesh | null = null;

function getMesh(): NeuralMesh | null {
  if (mesh) return mesh;
  try {
    mesh = NeuralMesh.fromPath();
  } catch {
    mesh = null;
  }
  return mesh;
}

export class RoleRouter {
  /** Preferred backend for a role, resolved from the neural mesh. */
  public static selectBackendForRole(roleName: string): string {
    const role = roleName.toLowerCase();
    const m = getMesh();
    if (m) {
      const backends = m.backendsForRole(role);
      if (backends.length > 0) return backends[0];
    }
    // Fallback if mesh is unavailable or the role is undefined.
    const fallback: Record<string, string> = {
      architect: 'vertex-coder',
      coder: 'codex',
      'ui-implementer': 'minimax',
      reviewer: 'claude-code',
    };
    return fallback[role] ?? 'vertex-coder';
  }

  /** The full capability record for a role (mesh-resolved backends). */
  public static capabilityForRole(roleName: string): RoleCapability {
    const role = roleName.toLowerCase();
    const m = getMesh();
    const preferred = m ? m.backendsForRole(role) : [];
    return {
      role,
      needs: ROLE_NEEDS[role] ?? [],
      preferred_backends:
        preferred.length > 0
          ? preferred
          : [RoleRouter.selectBackendForRole(role)],
    };
  }
}
