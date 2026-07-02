# Episodic Memory

Agent Kernel separates durable rules from episodic recall.

Rules are compact policies that shape future behavior. Episodes are archived conversations, decisions, attempts, and lessons that help agents remember why prior choices were made.

## Commands

```bash
agent-kernel episode add --title "Decision title" --text "What happened and why it matters"
agent-kernel episode sync --agent claude --limit 50
agent-kernel episode search "query"
agent-kernel episode show <episode-id>
agent-kernel episode stats
agent-kernel episode reindex
```

## Storage

```txt
~/.agent-kernel/episodes/
  archive/
    episode_<hash>.json
  index.json
  sources.json
```

Each episode is a JSON document with `id`, `title`, `summary`, `agent`, `project`, `sourcePath`, `sourceHash`, `text`, `tags`, and timestamps.

## Sync sources

The default sync sources are:

```txt
~/.claude/projects/**/*.jsonl
~/.claude/transcripts/**/*.jsonl
~/.codex/sessions/**/*.jsonl
```

Missing folders are skipped. Sync is idempotent by source hash.

## Excluding sensitive conversations

Any transcript containing this marker is skipped:

```txt
<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>
```

## MCP tools

```txt
agent_kernel_search_episodes
agent_kernel_read_episode
agent_kernel_capture_episode
agent_kernel_sync_episodes
```

Agents should search episodes when the user references prior work, rejected approaches, repeated mistakes, or old decisions.
