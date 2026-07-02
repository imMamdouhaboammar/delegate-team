# MCP Server

Agent Kernel v0.0.3 includes a local MCP server named `agent-kernel-memory`.

The server exposes the shared JSON memories and proposal workflow to coding agents without asking the agent to edit generated files directly.

## Start the server

```bash
agent-kernel mcp serve
```

It uses stdio transport and speaks JSON-RPC. It is local-first and reads from `AGENT_KERNEL_HOME` or `~/.agent-kernel`.

## Install for Claude Code

```bash
agent-kernel mcp install claude
```

This writes an `mcpServers.agent-kernel-memory` entry to:

```txt
~/.claude/settings.json
```

You can print the JSON config without writing anything:

```bash
agent-kernel mcp config claude
```

## Tools

```txt
agent_kernel_get_status
agent_kernel_search_memory
agent_kernel_get_constitution
agent_kernel_propose_memory
agent_kernel_list_pending
agent_kernel_approve_memory
agent_kernel_guard_command
```

Approval through MCP is disabled by default. This is intentional. Agents should propose memories, while the user approves them from the terminal:

```bash
agent-kernel approve <proposal-id> --publish
```

To allow MCP approval intentionally:

```bash
AGENT_KERNEL_MCP_ALLOW_APPROVE=1 agent-kernel mcp serve
```

## Resources

```txt
agent-kernel://constitution
agent-kernel://policy
agent-kernel://memories/rules
agent-kernel://inbox/pending
```

## Recommended agent behavior

When the user says any durable instruction like `remember this`, `خلي دي rule`, or `احفظها لباقي agents`, the agent should call `agent_kernel_propose_memory`.

The agent must not edit these files directly:

```txt
~/.agent-kernel/dist/AGENTS.md
~/.agent-kernel/dist/CLAUDE.md
~/.agent-kernel/source/memories/*.json
```

The source memory changes only through `remember`, `propose`, `approve`, `reject`, and `publish`.
