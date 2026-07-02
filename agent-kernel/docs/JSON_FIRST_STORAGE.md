# JSON-first Storage

Agent Kernel uses JSON for source memories because each memory is structured data with stable metadata, not just prose

## Why JSON

Each memory can carry:

```txt
id
type
scope
level
status
text
targets
tags
enforcement
source
approval
createdAt
updatedAt
version
```

That shape is easier to validate, diff, migrate, search, and compile when it is stored as JSON

## Why not only Markdown

Agents still receive Markdown because tools such as Codex, Claude Code, Cursor, Antigravity, and Gemini consume human-readable instruction files more naturally

The model is:

```txt
JSON source -> compiler -> generated Markdown + compiled policy.json
```

## Why JSONL for logs

Logs are append-only event streams. JSONL lets the kernel add one event per line without rewriting a large JSON file

## Buckets

```txt
rules.json          strict coding rules and policies
preferences.json    durable working preferences
workflows.json      process rules and memory protocol
project-notes.json  project-scoped durable facts
skills.json         skill index and triggers
```

## Backward compatibility

v0.0.3 can migrate older flat files from v0.0.1 using:

```bash
agent-kernel migrate json
```
