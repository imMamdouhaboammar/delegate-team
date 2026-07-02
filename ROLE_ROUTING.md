# Role Routing

In the `dt` nested orchestration architecture, the Team Orchestrator (MetaGPT) breaks tasks down into specialized roles. To ensure optimal performance and cost efficiency, `dt` maps these roles dynamically to specific model backends based on **capability tags** rather than hardcoded names.

## Model Selection Strategy

Each role is defined by the capabilities it requires. The policy gateway matches the role's needs to the preferred backend.

### Architect
The architect is responsible for system design and planning.
- **Needs**: High reasoning, system design, architectural foresight.
- **Preferred Backends**: `claude`, `gpt`, `gemini-pro`
```json
{
  "role": "architect",
  "needs": ["reasoning", "system-design"],
  "preferred_backends": ["claude", "gpt", "gemini-pro"]
}
```

### Implementer / Coder
The implementer is responsible for modifying the codebase.
- **Needs**: Repository editing, patch generation, precise file modifications.
- **Preferred Backends**: `codex`, `vertex-coder`
```json
{
  "role": "coder",
  "needs": ["repo-editing", "patch-generation"],
  "preferred_backends": ["codex", "vertex-coder"]
}
```

### UI Implementer
Responsible for frontend visual code and component styling.
- **Needs**: Frontend frameworks, visual code generation.
- **Preferred Backends**: `minimax`, `codex`
```json
{
  "role": "ui-implementer",
  "needs": ["frontend", "visual-code"],
  "preferred_backends": ["minimax", "codex"]
}
```

### Reviewer
Responsible for analyzing diffs, catching security flaws, and ensuring test coverage.
- **Needs**: Diff review, security auditing, test validation.
- **Preferred Backends**: `claude-code`, `gpt-high-reasoning`
```json
{
  "role": "reviewer",
  "needs": ["diff-review", "security", "tests"],
  "preferred_backends": ["claude-code", "gpt-high-reasoning"]
}
```

### Tester & Docs
- **Tester**: Executes local command runners against an allowlist to verify build and test success.
- **Docs**: Can be mapped to a cheaper, faster writing model for generating documentation and docstrings.

By utilizing capability tags, the orchestration runtime can gracefully fall back to alternative models if the primary model fails or is rate-limited, without losing the specific traits required for the role.
