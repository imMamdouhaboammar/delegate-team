# Memory Protocol

Agent Kernel v0.0.3 stores approved memories as JSON, proposals as one JSON file per pending item, and logs as JSONL

The workflow is:

```txt
Propose -> Review -> Approve -> Publish -> Sync
```

## Source of truth

```txt
source/memories/rules.json
source/memories/preferences.json
source/memories/workflows.json
source/memories/project-notes.json
source/memories/skills.json
source/policies/policies.json
source/schemas/memory.schema.json
source/schemas/proposal.schema.json
source/schemas/policy.schema.json
```

Generated files in `dist/` are disposable outputs. Do not edit them directly

## Manual memory

```bash
agent-kernel remember "Use pnpm in TypeScript CLI projects." --type rule --level standard --publish
```

## Agent-proposed memory

Agents must not edit source JSON files or generated markdown files directly

They should run:

```bash
agent-kernel propose \
  --from claude \
  --type rule \
  --scope global \
  --level standard \
  --targets all \
  --text "The exact rule" \
  --reason "Why this should become shared memory"
```

The proposal lands in:

```txt
inbox/pending/<proposal-id>.json
```

## Review

```bash
agent-kernel inbox
agent-kernel memory search supabase
agent-kernel memory show <memory-id>
```

## Approve and publish

```bash
agent-kernel approve <proposal-id> --publish
```

## Reject

```bash
agent-kernel reject <proposal-id>
```

## Validate

```bash
agent-kernel validate
```

Validation checks shape, duplicate IDs, required fields, supported values, likely secret leakage, and policy pack arrays

## Trigger phrases

The Claude `UserPromptSubmit` hook watches for prompts containing:

```txt
AK remember:
AK rule:
remember this
save this
خلي دي rule
احفظ دي
احفظها لباقي agents
```

When matched, it creates a pending proposal and blocks the original prompt with instructions for approval
