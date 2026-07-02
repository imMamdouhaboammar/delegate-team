#!/usr/bin/env python3
"""catalog.py — the dynamic integrations arsenal.

The 31-repo registry the Mavis (main agent / staff engineer / orchestrator)
queries when it needs to load a skill, an agent, or a tool on demand.

Architecture:
  * `INTEGRATIONS` is the static catalog — what each entry is, where it
    lives, and how to install it.
  * `detect_all()` runs at startup, walks the disk + PATH, and tags every
    entry as `installed: bool` plus which skills / binaries are present.
  * **Mandatory global-skills pre-search**: `discover_global_skills()` walks
    `~/.claude/skills/` and reads every SKILL.md frontmatter, building an
    index the Mavis (and `--prewarm`) uses to find skills that match the
    task keywords. Runs AUTOMATICALLY — the Mavis does not need to opt in.
  * `match_skills_to_task(task, top_n)` scores each global skill against
    the task description (keyword overlap + name match + description
    match) and returns the top N matches.
  * Query functions: `list_installed()`, `list_available()`, `find_by_kind()`,
    `info(name)`, `install_hint(name)`.
  * Mavis is the decision authority: it sees the auto-discovered matches
    and decides which to actually call `skill` tool on.

Lazy-load contract:
  * The 35 catalog entries are RECOMMENDATIONS (some installed, some not).
  * The auto-discovered global skills are RECOMMENDATIONS based on task
    keywords — the Mavis still decides what to actually load.
  * Sub-agents inherit the Mavis's choice (or get their own subset via
    delegation briefs).
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

@dataclass
class Integration:
    id: str
    name: str
    repo: str
    kind: str             # skills-collection | agent | orchestrator | cli |
                          # search | memory | graph | codex | claude |
                          # ui-taste | design-md | methodology |
                          # performance | code-review | knowledge-graph |
                          # skills-registry | react
    role: str             # one-line "what it does"
    summary: str          # longer description
    install_cmd: str      # one-liner install (or "" for "manual")
    detect_paths: List[str] = field(default_factory=list)
    detect_bins: List[str] = field(default_factory=list)
    detect_skill_names: List[str] = field(default_factory=list)  # names under ~/.claude/skills/
    detect_command_names: List[str] = field(default_factory=list)  # ~/.claude/commands/
    installed: bool = False
    detected_artifacts: List[str] = field(default_factory=list)
    homepage: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "repo": self.repo,
            "kind": self.kind,
            "role": self.role,
            "summary": self.summary,
            "installed": self.installed,
            "homepage": self.homepage,
            "install_cmd": self.install_cmd,
            "detected_artifacts": self.detected_artifacts,
            "detect_paths": self.detect_paths,
            "detect_bins": self.detect_bins,
            "detect_skill_names": self.detect_skill_names,
            "detect_command_names": self.detect_command_names,
        }


# ---------------------------------------------------------------------------
# The arsenal — 31 entries
# ---------------------------------------------------------------------------

INTEGRATIONS: List[Integration] = [
    Integration(
        id="superpowers",
        name="superpowers",
        repo="https://github.com/obra/superpowers",
        kind="methodology",
        role="Hard-gate methodology: brainstorm → plan → TDD → review → ship",
        summary="14 narrow skills (brainstorming, writing-plans, TDD, systematic-debugging, "
                "verification-before-completion, dispatching-parallel-agents, executing-plans, "
                "subagent-driven-development, using-git-worktrees, requesting/receiving code review, "
                "finishing-a-development-branch, writing-skills, using-superpowers). Encodes the "
                "brainstorm-first hard gate so agents don't dive into code without a design.",
        install_cmd=(
            "git clone --depth 1 https://github.com/obra/superpowers /tmp/sp && "
            "cp -r /tmp/sp/skills/* ~/.claude/skills/"
        ),
        detect_skill_names=[
            "brainstorming", "writing-plans", "test-driven-development",
            "systematic-debugging", "verification-before-completion",
            "dispatching-parallel-agents", "executing-plans",
            "subagent-driven-development", "using-git-worktrees",
            "requesting-code-review", "receiving-code-review",
            "finishing-a-development-branch", "writing-skills",
            "using-superpowers",
        ],
    ),
    Integration(
        id="hermes-agent",
        name="hermes-agent",
        repo="https://github.com/NousResearch/hermes-agent",
        kind="agent",
        role="Nous Research's agent runtime",
        summary="Hermes Agent — open-source agent framework from Nous Research. "
                "Provides an alternative agent runtime that may compose with "
                "the delegate-team supersystem for specialized tasks.",
        install_cmd=(
            "git clone --depth 1 https://github.com/NousResearch/hermes-agent ~/hermes-agent && "
            "cd ~/hermes-agent && pip install -e ."
        ),
        detect_paths=["~/hermes-agent"],
    ),
    Integration(
        id="karpathy-skills",
        name="karpathy-skills",
        repo="https://github.com/multica-ai/andrej-karpathy-skills",
        kind="skills-collection",
        role="Karpathy's principles (4-rules, vibe-coding guardrails)",
        summary="Skills distilled from Andrej Karpathy's lectures and tweets: "
                "the 4-rule engineering principle, vibe-coding guardrails, "
                "the 'have a goal, a metric, and a loop' autoresearch mindset.",
        install_cmd=(
            "git clone --depth 1 https://github.com/multica-ai/andrej-karpathy-skills "
            "/tmp/karpathy && cp -r /tmp/karpathy/skills/* ~/.claude/skills/"
        ),
        detect_skill_names=["karpathy-guidelines", "vibe-coding-standards-skill"],
    ),
    Integration(
        id="ui-ux-pro-max",
        name="ui-ux-pro-max-skill",
        repo="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
        kind="skills-collection",
        role="UI/UX design intelligence (97 palettes, 57 font pairings, 99 UX guidelines)",
        summary="Awwwards-level UI design. 50+ design styles, 97 color palettes, "
                "57 font pairings, 99 UX guidelines, 25 chart types. Covers React, "
                "Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui.",
        install_cmd=(
            "git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill "
            "/tmp/uiux && cp -r /tmp/uiux/skills/* ~/.claude/skills/"
        ),
        detect_skill_names=["ui-ux-pro-max"],
    ),
    Integration(
        id="awesome-design-md",
        name="awesome-design-md",
        repo="https://github.com/VoltAgent/awesome-design-md",
        kind="design-md",
        role="Curated design system MD specs (VoltAgent-curated)",
        summary="A curated list of design system markdown specs, tasteful "
                "design references, and component-level design documentation "
                "for high-end product UI.",
        install_cmd=(
            "git clone --depth 1 https://github.com/VoltAgent/awesome-design-md "
            "/tmp/awesome-design-md && ln -sf /tmp/awesome-design-md/specs ~/.design-specs"
        ),
        detect_paths=["~/.design-specs", "/tmp/awesome-design-md"],
    ),
    Integration(
        id="caveman",
        name="caveman",
        repo="https://github.com/JuliusBrussee/caveman",
        kind="cli",
        role="One-shot coding style — minimal deps, just commit",
        summary="A code-review / commit helper that enforces short, direct "
                "diffs. Useful as a 'no-bloat' coding style for the Mavis "
                "supervisor to apply on sub-agents.",
        install_cmd=(
            "git clone --depth 1 https://github.com/JuliusBrussee/caveman "
            "/tmp/caveman && cd /tmp/caveman && pip install -e ."
        ),
        detect_paths=["~/caveman", "/tmp/caveman"],
        detect_bins=["caveman-commit", "caveman-review", "caveman-compress"],
    ),
    Integration(
        id="graphify",
        name="graphify",
        repo="https://github.com/safishamsi/graphify",
        kind="graph",
        role="Graph-based code navigation (alternative to build-graph)",
        summary="Code-review-graph companion. Builds a call graph from the "
                "codebase, then exposes semantic search, callers_of, callees_of "
                "for fast token-efficient code navigation.",
        install_cmd=(
            "git clone --depth 1 https://github.com/safishamsi/graphify "
            "/tmp/graphify && cd /tmp/graphify && npm install -g"
        ),
        detect_paths=["/tmp/graphify", "~/graphify"],
        detect_bins=["graphify"],
    ),
    Integration(
        id="addyosmani-skills",
        name="addyosmani/agent-skills",
        repo="https://github.com/addyosmani/agent-skills",
        kind="performance",
        role="Addy Osmani's performance-focused engineering skills",
        summary="Performance engineering skills from Addy Osmani (Chrome team). "
                "Covers Core Web Vitals, RAIL model, performance budgets, "
                "Lighthouse-based audits.",
        install_cmd=(
            "git clone --depth 1 https://github.com/addyosmani/agent-skills "
            "/tmp/addyosmani && cp -r /tmp/addyosmani/skills/* ~/.claude/skills/"
        ),
        detect_skill_names=["web-performance-optimization", "performance-optimization"],
    ),
    Integration(
        id="ruflo",
        name="ruflo",
        repo="https://github.com/ruvnet/ruflo",
        kind="orchestrator",
        role="Multi-agent orchestration runtime (ruvnet)",
        summary="Alternative multi-agent orchestrator with adaptive swarm "
                "routing. Composes with delegate-team/MMAS for fan-out tasks.",
        install_cmd=(
            "git clone --depth 1 https://github.com/ruvnet/ruflo ~/ruflo && "
            "cd ~/ruflo && npm install && npm link"
        ),
        detect_paths=["~/ruflo", "~/projects/ruflo"],
        detect_bins=["ruflo"],
    ),
    Integration(
        id="taste-skill",
        name="taste-skill",
        repo="https://github.com/Leonxlnx/taste-skill",
        kind="ui-taste",
        role="UI taste calibration (front-end design taste heuristics)",
        summary="A taste skill that front-loads design judgment — covers "
                "typography pairings, color theory, motion intensity, density, "
                "and what 'designed' looks like vs. default. Pairs with unslop "
                "for spec-time taste calibration.",
        install_cmd=(
            "git clone --depth 1 https://github.com/Leonxlnx/taste-skill "
            "/tmp/taste && cp -r /tmp/taste/skills/* ~/.claude/skills/"
        ),
        detect_skill_names=["taste", "design-taste-frontend"],
    ),
    Integration(
        id="impeccable",
        name="impeccable",
        repo="https://github.com/pbakaus/impeccable",
        kind="ui-taste",
        role="Front-end craft rules (pbakaus)",
        summary="Przemek Bąkaus's (pbakaus) front-end craft rules — typography, "
                "spacing, color, motion, accessibility, content. The 'impeccable' "
                "subset is a curated baseline for any UI skill to load alongside.",
        install_cmd=(
            "git clone --depth 1 https://github.com/pbakaus/impeccable "
            "/tmp/impeccable && cp -r /tmp/impeccable/skills/* ~/.claude/skills/"
        ),
        detect_skill_names=["impeccable", "responsive-craft", "teach-impeccable"],
    ),
    Integration(
        id="antigravity-skills",
        name="antigravity-awesome-skills",
        repo="https://github.com/sickn33/antigravity-awesome-skills",
        kind="skills-registry",
        role="Antigravity IDE skills aggregator",
        summary="A curated list of skills for the Antigravity IDE. Useful as "
                "a reference when adopting new skills; not a single installable.",
        install_cmd="(reference only — no install)",
        detect_paths=[],
    ),
    Integration(
        id="wshobson-agents",
        name="wshobson/agents",
        repo="https://github.com/wshobson/agents",
        kind="skills-collection",
        role="Production-engineering skills (Wshobson)",
        summary="Production-engineering skills covering Kubernetes, Terraform, "
                "GitHub Actions, observability, and cloud-native patterns.",
        install_cmd=(
            "git clone --depth 1 https://github.com/wshobson/agents "
            "/tmp/wshobson && cp -r /tmp/wshobson/plugins/*/skills/* ~/.claude/skills/ 2>/dev/null || true"
        ),
        detect_skill_names=[
            "kubernetes", "terraform", "k8s-manifest-generator",
            "github-actions-templates", "grafana-dashboards",
            "prometheus-configuration",
        ],
    ),
    Integration(
        id="graphrag",
        name="graphrag",
        repo="https://github.com/microsoft/graphrag",
        kind="knowledge-graph",
        role="Microsoft GraphRAG — knowledge graph over private data",
        summary="Microsoft's GraphRAG. Builds a knowledge graph from your "
                "documents, then answers queries using graph-walk retrieval. "
                "Heavy infra (Python, Neo4j or similar) — install only when "
                "you actually need private-data RAG.",
        install_cmd=(
            "git clone --depth 1 https://github.com/microsoft/graphrag "
            "/tmp/graphrag && cd /tmp/graphrag && pip install -e ."
        ),
        detect_paths=["~/graphrag", "/tmp/graphrag"],
    ),
    Integration(
        id="searxng",
        name="searxng",
        repo="https://github.com/searxng/searxng",
        kind="search",
        role="Self-hosted meta-search engine",
        summary="Privacy-respecting meta-search engine. Useful as a local "
                "search backend if you don't want to depend on Google/Bing "
                "for the agent's web search.",
        install_cmd=(
            "git clone --depth 1 https://github.com/searxng/searxng ~/searxng && "
            "cd ~/searxng && docker compose up -d"
        ),
        detect_paths=["~/searxng", "/etc/searxng"],
        detect_bins=["searxng-cli"],
    ),
    Integration(
        id="oh-my-codex",
        name="oh-my-codex",
        repo="https://github.com/Yeachan-Heo/oh-my-codex",
        kind="codex",
        role="Codex CLI enhancements and presets",
        summary="A wrapper around the OpenAI Codex CLI that adds sensible "
                "presets, plan/exec modes, and session persistence. "
                "Pairs with `codex` (already in ~/delegate-team/bin).",
        install_cmd=(
            "git clone --depth 1 https://github.com/Yeachan-Heo/oh-my-codex "
            "~/oh-my-codex && cd ~/oh-my-codex && npm install -g ."
        ),
        detect_paths=["~/oh-my-codex"],
        detect_bins=["oh-my-codex"],
    ),
    Integration(
        id="graphiti",
        name="graphiti",
        repo="https://github.com/getzep/graphiti",
        kind="memory",
        role="Temporal knowledge graph for agent memory (Zep's Graphiti)",
        summary="Builds a temporal knowledge graph of facts/relationships. "
                "Used for long-running agent memory that survives sessions. "
                "Pairs with or replaces agent-kernel for episodic recall.",
        install_cmd=(
            "git clone --depth 1 https://github.com/getzep/graphiti ~/graphiti && "
            "cd ~/graphiti && pip install -e ."
        ),
        detect_paths=["~/graphiti", "/tmp/graphiti"],
    ),
    Integration(
        id="vercel-agent-skills",
        name="vercel-labs/agent-skills",
        repo="https://github.com/vercel-labs/agent-skills",
        kind="skills-collection",
        role="Vercel's agent skills (Next.js, React, deployment)",
        summary="Vercel-curated agent skills for Next.js, React, deployment, "
                "composable patterns, microfrontends.",
        install_cmd=(
            "git clone --depth 1 https://github.com/vercel-labs/agent-skills "
            "/tmp/vercel-skills && cp -r /tmp/vercel-skills/skills/* ~/.claude/skills/ 2>/dev/null || true"
        ),
        detect_skill_names=[
            "vercel-react-best-practices", "vercel-composition-patterns",
            "vercel-microfrontends", "vercel-development", "vercel-deployment",
        ],
    ),
    Integration(
        id="serena",
        name="serena",
        repo="https://github.com/oraios/serena",
        kind="graph",
        role="Semantic code search (LSP-powered)",
        summary="Semantic code search using language servers. Useful for "
                "token-efficient code navigation across large codebases. "
                "Pairs with build-graph + graphify as the navigation trio.",
        install_cmd=(
            "git clone --depth 1 https://github.com/oraios/serena ~/serena && "
            "cd ~/serena && pip install -e ."
        ),
        detect_paths=["~/serena", "/tmp/serena"],
    ),
    Integration(
        id="planning-with-files",
        name="planning-with-files",
        repo="https://github.com/OthmanAdi/planning-with-files",
        kind="methodology",
        role="Plan-with-files methodology (OthmanAdi)",
        summary="A methodology skill that uses the filesystem as the agent's "
                "working memory: tasks.md, plan.md, notes.md. Pairs with "
                "superpowers:writing-plans for planning chains.",
        install_cmd=(
            "git clone --depth 1 https://github.com/OthmanAdi/planning-with-files "
            "/tmp/pwf && cp -r /tmp/pwf/skills/* ~/.claude/skills/ 2>/dev/null || true"
        ),
        detect_skill_names=["planning-with-files", "plan-writing"],
    ),
    Integration(
        id="anysearch",
        name="anysearch-skill",
        repo="https://github.com/anysearch-ai/anysearch-skill",
        kind="search",
        role="Multi-provider unified web search skill",
        summary="Single interface to multiple search providers (Google, "
                "Bing, Brave, DuckDuckGo). Useful as a backend for the agent's "
                "web search instead of relying on a single provider.",
        install_cmd=(
            "git clone --depth 1 https://github.com/anysearch-ai/anysearch-skill "
            "/tmp/anysearch && cp -r /tmp/anysearch/skills/* ~/.claude/skills/ 2>/dev/null || true"
        ),
        detect_skill_names=["anysearch", "web-search"],
    ),
    Integration(
        id="autoresearch",
        name="autoresearch",
        repo="https://github.com/uditgoenka/autoresearch",
        kind="methodology",
        role="Metric-driven iteration loop (Karpathy-style autoresearch)",
        summary="14 slash commands implementing Karpathy's autoresearch "
                "pattern: have a goal, a metric, a loop, and never quit. "
                "Composable with /mavis-ship for PERFORMANCE paths.",
        install_cmd=(
            "git clone --depth 1 https://github.com/uditgoenka/autoresearch "
            "/tmp/autoresearch && "
            "cp -r /tmp/autoresearch/skills/autoresearch ~/.claude/skills/ && "
            "cp /tmp/autoresearch/commands/*.md ~/.claude/commands/"
        ),
        detect_skill_names=["autoresearch"],
        detect_command_names=["autoresearch", "autoresearch:plan", "autoresearch:debug"],
    ),
    Integration(
        id="awesome-codex-subagents",
        name="awesome-codex-subagents",
        repo="https://github.com/VoltAgent/awesome-codex-subagents",
        kind="codex",
        role="Codex sub-agent templates (VoltAgent)",
        summary="A curated set of Codex sub-agent templates and presets for "
                "specialized coding roles (frontend, backend, test, security).",
        install_cmd=(
            "git clone --depth 1 https://github.com/VoltAgent/awesome-codex-subagents "
            "/tmp/codex-subagents && cp -r /tmp/codex-subagents/subagents/* ~/.codex/subagents/ 2>/dev/null || true"
        ),
        detect_paths=["~/.codex/subagents", "/tmp/codex-subagents"],
    ),
    Integration(
        id="revfactory-harness",
        name="revfactory/harness",
        repo="https://github.com/revfactory/harness",
        kind="orchestrator",
        role="Multi-agent orchestration harness (revfactory)",
        summary="An orchestration harness with patterns: Pipeline, Fan-out/"
                "Fan-in, Expert Pool, Producer-Reviewer, Supervisor, Hierarchical. "
                "Reference for team-architect decisions.",
        install_cmd=(
            "git clone --depth 1 https://github.com/revfactory/harness ~/harness && "
            "cd ~/harness && npm install"
        ),
        detect_paths=["~/harness", "~/projects/harness"],
    ),
    Integration(
        id="reviewdog",
        name="reviewdog",
        repo="https://github.com/reviewdog/reviewdog",
        kind="code-review",
        role="Automated code review (any linter → PR comment)",
        summary="Code review automation that posts linter output to PRs. "
                "Useful for adding `/check` (Waza) or `quality-guard` "
                "feedback to GitHub PRs as inline comments.",
        install_cmd="brew install reviewdog",
        detect_bins=["reviewdog"],
    ),
    Integration(
        id="react-doctor",
        name="react-doctor",
        repo="https://github.com/millionco/react-doctor",
        kind="react",
        role="React performance auditor",
        summary="Diagnoses React performance issues (re-renders, missing "
                "memo, props equality, bundle weight). Runs against a codebase "
                "and emits a report.",
        install_cmd="npm install -g @millionco/react-doctor",
        detect_bins=["react-doctor"],
    ),
    Integration(
        id="code-review-graph",
        name="code-review-graph",
        repo="https://github.com/tirth8205/code-review-graph",
        kind="graph",
        role="Code-review graph (alternative to build-graph)",
        summary="Builds a graph of the repo for impact-radius detection on "
                "PRs. Pairs with review-delta and code-review-2 for delta-only "
                "review.",
        install_cmd=(
            "git clone --depth 1 https://github.com/tirth8205/code-review-graph "
            "/tmp/crg && cd /tmp/crg && pip install -e ."
        ),
        detect_paths=["~/code-review-graph", "/tmp/crg"],
    ),
    Integration(
        id="alirezarezvani-claude-skills",
        name="alirezarezvani/claude-skills",
        repo="https://github.com/alirezarezvani/claude-skills",
        kind="skills-collection",
        role="Curated Claude skills collection (alirezarezvani)",
        summary="A curated collection of Claude Code skills covering dev "
                "workflow, code review, debugging, and architectural patterns.",
        install_cmd=(
            "git clone --depth 1 https://github.com/alirezarezvani/claude-skills "
            "/tmp/arezvani && cp -r /tmp/arezvani/skills/* ~/.claude/skills/ 2>/dev/null || true"
        ),
        detect_skill_names=[
            "clean-code", "code-review-checklist", "concise-planning",
            "codebase-design", "architecture-decision-records",
        ],
    ),
    Integration(
        id="react-fix-it",
        name="react-fix-it",
        repo="https://github.com/MicheleBertoli/react-fix-it",
        kind="react",
        role="Automated React fix suggestions",
        summary="Scans a React codebase for common issues (missing keys, "
                "missing prop types, accessibility) and emits suggested "
                "patches. Pairs with react-doctor for diagnosis.",
        install_cmd=(
            "git clone --depth 1 https://github.com/MicheleBertoli/react-fix-it "
            "/tmp/react-fix-it && cd /tmp/react-fix-it && npm install -g ."
        ),
        detect_paths=["~/react-fix-it", "/tmp/react-fix-it"],
    ),
    Integration(
        id="guard-skills",
        name="guard-skills",
        repo="https://github.com/amElnagdy/guard-skills",
        kind="code-review",
        role="Pre-commit guard skills",
        summary="A collection of guard skills that intercept risky actions "
                "before commit. Pairs with quality-guard for pre-delivery "
                "checks.",
        install_cmd=(
            "git clone --depth 1 https://github.com/amElnagdy/guard-skills "
            "/tmp/guard && cp -r /tmp/guard/skills/* ~/.claude/skills/ 2>/dev/null || true"
        ),
        detect_skill_names=["clean-code-guard", "test-guard", "docs-guard", "block-no-verify-hook"],
    ),
    Integration(
        id="memorix",
        name="memorix",
        repo="https://github.com/AVIDS2/memorix",
        kind="memory",
        role="Memory layer for AI agents (AVIDS2)",
        summary="Memory layer for AI agents. Provides persistent memory, "
                "context recall, and pattern recognition across sessions. "
                "Alternative or complement to agent-kernel / graphiti.",
        install_cmd=(
            "git clone --depth 1 https://github.com/AVIDS2/memorix ~/memorix && "
            "cd ~/memorix && pip install -e ."
        ),
        detect_paths=["~/memorix", "/tmp/memorix"],
    ),
    Integration(
        id="waza",
        name="waza",
        repo="https://github.com/tw93/Waza",
        kind="skills-collection",
        role="8 entry-point habits-engineering skills (tw93/Waza)",
        summary="8 skills mapped to natural-language vocabulary: "
                "/think (plan), /ui (build UI), /check (review), "
                "/hunt (debug), /write (polish), /learn (research), "
                "/read (fetch), /health (audit).",
        install_cmd="npx -y skills add tw93/Waza -a claude-code -g -y",
        detect_skill_names=["think", "ui", "check", "hunt", "write", "learn", "read", "health"],
    ),
    Integration(
        id="unslop-preflight",
        name="unslop-preflight",
        repo="https://github.com/imMamdouhaboammar/unslop-preflight",
        kind="ui-taste",
        role="UI quality gate (BLOCKING, score ≥ 70)",
        summary="23 reasoning gates that block generic AI-generated UI "
                "slop at the artifact layer. Mandatory before any UI work. "
                "Pairs with taste-skill + impeccable for spec-time taste.",
        install_cmd=(
            "git clone --depth 1 https://github.com/imMamdouhaboammar/unslop-preflight "
            "/tmp/unslop && npm install -g /tmp/unslop && "
            "cp -r /tmp/unslop/SKILL.md ~/.claude/skills/unslop/SKILL.md"
        ),
        detect_skill_names=["unslop"],
        detect_bins=["unslop"],
    ),
    Integration(
        id="agent-kernel",
        name="agent-kernel",
        repo="https://github.com/imMamdouhaboammar/agent-kernel",
        kind="memory",
        role="Local-first memory + governance layer (bundled with delegate-team)",
        summary="Memory + governance layer. Local-first shared memory, "
                "episodic recall, approval inbox for new rules, and "
                "deterministic policy guard. Bundled with delegate-team "
                "v2.5+ at ~/delegate-team/agent-kernel/.",
        install_cmd="./delegate-team/install.sh --kernel",
        detect_paths=["~/delegate-team/agent-kernel", "~/agent-kernel"],
        detect_bins=["agent-kernel", "ak"],
    ),
    Integration(
        id="delegate-team",
        name="delegate-team",
        repo="https://github.com/imMamdouhaboammar/delegate-team",
        kind="orchestrator",
        role="The supersystem itself (this project)",
        summary="The `dt` CLI + `/mavis-ship` orchestrator. The multi-agent "
                "supersystem that mavis-ship is a thin front for. Already "
                "installed at ~/delegate-team/.",
        install_cmd="(already installed at ~/delegate-team)",
        detect_paths=["~/delegate-team"],
        detect_bins=["dt"],
    ),
    Integration(
        id="big-boss",
        name="big-boss",
        repo="https://github.com/imMamdouhaboammar/mavis-ship",
        kind="persona",
        role="Mavis staff-engineer persona: full agency, terminal mastery, sub-agent delegation, skill loading, rigor",
        summary="The Big Boss persona skill. Loaded by the Mavis session whenever "
                "the user asks for a non-trivial coding task. Enforces 6 laws: "
                "(1) use the right tool for the job, (2) delegate aggressively, "
                "(3) load skills on demand, (4) verify with terminal, "
                "(5) be rigorous (tests, type checks, lint), (6) show your work. "
                "Pairs with: mavis-ship, mavis-team, expert-engineer, mini-coder-max.",
        install_cmd="(Mavis local skill — installed at ~/.mavis/skills/big-boss/)",
        detect_paths=["~/.mavis/skills/big-boss"],
        detect_skill_names=["big-boss"],
    ),
    Integration(
        id="autopilot",
        name="autopilot",
        repo="https://github.com/imMamdouhaboammar/mavis-ship",
        kind="god-command",
        role="The GOD command: prewarm → brainstorm → plan → execute → review → quality-guard → report",
        summary="The autopilot runner. The user invokes it, walks away, "
                "and comes back to a finished module. The 7 stages run "
                "end-to-end without Mavis supervision. The brainstorming "
                "stage uses the superpowers+codex gpt-5.5-high mix for "
                "highest-quality ideation. The execution stage hands off to "
                "delegate-team (or any chosen backend) via dt. The review "
                "and quality-guard stages produce the final report. "
                "Use --background to detach and return a PID + log path, "
                "or --dry-run to see the plan without executing.",
        install_cmd="(Mavis local — installed at ~/delegate-team/bin/autopilot.sh)",
        detect_paths=["~/delegate-team/bin/autopilot.sh"],
        detect_bins=["autopilot"],
    ),
    Integration(
        id="mavis-ship-uni",
        name="mavis-ship-uni",
        repo="https://github.com/imMamdouhaboammar/mavis-ship",
        kind="god-command",
        role="Smart universal wrapper: detects calling runtime (Mavis / codex / claude / gemini / opencode / mmx / shell) and dispatches to the right flow",
        summary="The smart universal wrapper. Detects the calling runtime "
                "via env vars (MAVIS_SESSION_ID, CODEX_HOME, CLAUDECODE, "
                "GEMINI_CLI, OPENCODE_CONFIG_DIR, MMX_HOME) + parent "
                "process argv0 fallback, then dispatches: Mavis session → "
                "orchestrate --prewarm (Mavis decides + loads skills); "
                "codex/claude/gemini/opencode/mmx → autopilot --background "
                "(so the agent returns immediately while the chain runs); "
                "plain shell → autopilot foreground (you watch the log). "
                "Use this from any agent or shell — it's the single entry "
                "point that picks the right flow automatically.",
        install_cmd="(Mavis local — installed at ~/delegate-team/bin/mavis-ship-uni)",
        detect_paths=["~/delegate-team/bin/mavis-ship-uni"],
        detect_bins=["mavis-ship-uni"],
    ),
]


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

CLAUDE_SKILLS_DIR = Path(os.path.expanduser("~/.claude/skills"))
CLAUDE_COMMANDS_DIR = Path(os.path.expanduser("~/.claude/commands"))
AGENTS_SKILLS_DIR = Path(os.path.expanduser("~/.agents/skills"))
MAVIS_SKILLS_DIR = Path(os.path.expanduser("~/.mavis/skills"))

# Priority order for dedupe when the same skill name appears in multiple sources.
# Earlier wins. mavis/agents is the broadest; claude is the most canonical.
SKILL_SOURCES: List[Tuple[Path, str]] = [
    (MAVIS_SKILLS_DIR, "mavis"),
    (AGENTS_SKILLS_DIR, "agents"),
    (CLAUDE_SKILLS_DIR, "claude"),
]


def _expand(p: str) -> str:
    return os.path.expanduser(p)


def _detect_one(integration: Integration) -> Integration:
    """Tag a single integration as installed or not, and record artifacts."""
    found: List[str] = []

    for p in integration.detect_paths:
        full = _expand(p)
        if os.path.isdir(full) or os.path.isfile(full):
            found.append(f"path:{p}")

    for b in integration.detect_bins:
        if shutil.which(b):
            found.append(f"bin:{b}")

    if CLAUDE_SKILLS_DIR.is_dir():
        for s in integration.detect_skill_names:
            if (CLAUDE_SKILLS_DIR / s).is_dir():
                found.append(f"skill:{s}")

    if CLAUDE_COMMANDS_DIR.is_dir():
        for c in integration.detect_command_names:
            if (CLAUDE_COMMANDS_DIR / c).is_file() or (CLAUDE_COMMANDS_DIR / c).is_dir():
                found.append(f"cmd:{c}")

    integration.detected_artifacts = found
    integration.installed = bool(found)
    return integration


def detect_all() -> List[Integration]:
    """Detect all integrations (mutates the global list)."""
    for i in INTEGRATIONS:
        _detect_one(i)
    return INTEGRATIONS


# ---------------------------------------------------------------------------
# Query API
# ---------------------------------------------------------------------------

def find(id_or_name: str) -> Optional[Integration]:
    for i in INTEGRATIONS:
        if i.id == id_or_name or i.name == id_or_name:
            return i
    return None


def list_installed() -> List[Integration]:
    return [i for i in INTEGRATIONS if i.installed]


def list_available() -> List[Integration]:
    """Integrations we know about but are not yet installed."""
    return [i for i in INTEGRATIONS if not i.installed]


def find_by_kind(kind: str) -> List[Integration]:
    return [i for i in INTEGRATIONS if i.kind == kind]


def info(id_or_name: str) -> Optional[dict]:
    i = find(id_or_name)
    return i.to_dict() if i else None


def install_hint(id_or_name: str) -> str:
    i = find(id_or_name)
    if not i:
        return f"Unknown integration: {id_or_name}"
    if i.installed:
        return f"{i.name} is already installed ({len(i.detected_artifacts)} artifacts). " \
               f"Re-run: {i.install_cmd}"
    return f"Install {i.name}:\n  {i.install_cmd}"


# ---------------------------------------------------------------------------
# Auto-discovery of global skills (the Mavis pre-search)
# ---------------------------------------------------------------------------
#
# When the Mavis session gets any task, BEFORE starting the chain, it must
# search `~/.claude/skills/` for skills whose frontmatter / name / description
# matches the task. This is the "mandatory pre-search" — runs automatically
# on every --prewarm / dispatch. The Mavis still decides what to actually
# load, but the candidate set is built here.

@dataclass
class GlobalSkill:
    name: str                # the skill's directory name
    path: str                # absolute path to SKILL.md
    description: str         # first ~200 chars of frontmatter description
    frontmatter: dict        # parsed name + description
    keywords: List[str]      # tokens extracted from name + description
    source: str = ""         # which folder it came from: "mavis" | "agents" | "claude"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "path": self.path,
            "description": self.description,
            "keywords": self.keywords,
            "source": self.source,
        }


def _parse_frontmatter(text: str) -> Tuple[dict, str]:
    """Pull the YAML-ish frontmatter from a SKILL.md. Returns (metadata, body)."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    fm = text[3:end].strip()
    body = text[end + 4:].strip()
    meta: dict = {}
    current_key: Optional[str] = None
    for line in fm.splitlines():
        if not line.strip():
            continue
        if line.lstrip().startswith("- ") and current_key:
            # list item — concatenate to the running description
            meta[current_key] = (meta.get(current_key, "") + " " + line.lstrip()[2:]).strip()
            continue
        m = re.match(r"^([a-zA-Z][\w-]*):\s*(.*)$", line)
        if m:
            current_key = m.group(1).lower()
            meta[current_key] = m.group(2).strip()
    return meta, body


def _extract_keywords(text: str) -> List[str]:
    """Lowercase + unicode-normalize + tokenize. Returns unique tokens."""
    if not text:
        return []
    n = unicodedata.normalize("NFKC", text.lower())
    tokens = re.findall(r"[a-z][a-z0-9_-]{1,}|[\u0600-\u06FF]{2,}", n)
    stop = {"the", "and", "for", "with", "from", "this", "that", "when", "use", "uses",
            "used", "into", "out", "are", "was", "but", "any", "all", "via"}
    return [t for t in tokens if t not in stop and len(t) > 1]


def discover_global_skills() -> List[GlobalSkill]:
    """Walk ALL skill sources and read every SKILL.md. Returns a deduplicated
    list of GlobalSkill entries, with frontmatter parsed + keywords extracted.

    Sources (priority order — first wins on name conflict):
      1. ~/.mavis/skills/   (Mavis's own skills)
      2. ~/.agents/skills/  (the broader agent skills registry — 1800+ skills)
      3. ~/.claude/skills/  (Claude Code's skills folder)

    This is the mandatory pre-search. The Mavis calls it on every task;
    orchestrate.py --prewarm calls it too.
    """
    seen: Dict[str, GlobalSkill] = {}
    for skills_dir, source in SKILL_SOURCES:
        if not skills_dir.is_dir():
            continue
        for child in sorted(skills_dir.iterdir()):
            if not child.is_dir():
                continue
            name = child.name
            if name in seen:
                # Already picked a higher-priority source for this name
                continue
            skill_md = child / "SKILL.md"
            if not skill_md.is_file():
                continue
            try:
                text = skill_md.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            meta, _ = _parse_frontmatter(text)
            description = (meta.get("description") or "").strip()
            if len(description) > 240:
                description = description[:237] + "..."
            kw = _extract_keywords(f"{name} {name.replace('-', ' ')} {description}")
            seen[name] = GlobalSkill(
                name=name,
                path=str(skill_md),
                description=description,
                frontmatter=meta,
                keywords=kw,
                source=source,
            )
    return list(seen.values())


def discover_global_skills_all_sources() -> Dict[str, List[GlobalSkill]]:
    """Like discover_global_skills() but returns per-source lists (no dedupe).
    Useful for the Mavis to know "this skill exists in mavis AND agents".
    """
    out: Dict[str, List[GlobalSkill]] = {}
    for skills_dir, source in SKILL_SOURCES:
        if not skills_dir.is_dir():
            continue
        out[source] = []
        for child in sorted(skills_dir.iterdir()):
            if not child.is_dir():
                continue
            skill_md = child / "SKILL.md"
            if not skill_md.is_file():
                continue
            try:
                text = skill_md.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            meta, _ = _parse_frontmatter(text)
            description = (meta.get("description") or "").strip()
            if len(description) > 240:
                description = description[:237] + "..."
            name = child.name
            kw = _extract_keywords(f"{name} {name.replace('-', ' ')} {description}")
            out[source].append(GlobalSkill(
                name=name,
                path=str(skill_md),
                description=description,
                frontmatter=meta,
                keywords=kw,
                source=source,
            ))
    return out


# ---------------------------------------------------------------------------
# Similarity / duplicate detection
# ---------------------------------------------------------------------------
#
# The Mavis session has 3 skill folders. Names can collide, but the
# contents can also be near-duplicates (same role, slightly different
# naming). We surface these so the Mavis is aware before loading them.
#
# Two passes:
#   1. find_similar_skills() — token overlap on name + description
#      (catches "hunt" vs "bug-hunt" vs "debug-hunt", etc.)
#   2. find_content_duplicates() — exact-body match across folders
#      (catches "this skill is the same file copied into 3 places")


def _jaccard(a: set, b: set) -> float:
    """Jaccard similarity between two sets. 0 = no overlap, 1 = identical."""
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def find_similar_skills(threshold: float = 0.45) -> List[Dict]:
    """Find clusters of skills that look alike (high token overlap).

    Returns a list of cluster dicts:
      {
        "names": [str, ...],         # skill names in the cluster
        "paths": [str, ...],         # absolute SKILL.md paths
        "sources": [str, ...],       # which folder each came from
        "score": float,              # max pairwise similarity in the cluster
        "kind": "similar",           # tag
      }
    """
    idx = discover_global_skills()
    if not idx:
        return []
    # Pre-compute token sets
    by_name: Dict[str, GlobalSkill] = {s.name: s for s in idx}
    # Build adjacency: pair (a, b) with similarity >= threshold
    edges: List[Tuple[float, str, str]] = []
    items = list(idx)
    for i, a in enumerate(items):
        for b in items[i + 1:]:
            if a.name == b.name:
                continue  # already deduped
            sim = _jaccard(set(a.keywords), set(b.keywords))
            if sim >= threshold:
                edges.append((sim, a.name, b.name))
    # Union-find for clustering
    parent: Dict[str, str] = {s.name: s.name for s in items}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(x: str, y: str) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry
    for _, a, b in edges:
        union(a, b)
    # Group by root
    clusters: Dict[str, List[Tuple[float, str, str]]] = {}
    for sim, a, b in edges:
        r = find(a)
        clusters.setdefault(r, []).append((sim, a, b))
    # Filter: only keep clusters of size >= 2
    out: List[Dict] = []
    for root, members in clusters.items():
        names = sorted({root} | {n for _, _, n in members})
        paths = [by_name[n].path for n in names if n in by_name]
        sources = [by_name[n].source for n in names if n in by_name]
        max_score = max(s for s, _, _ in members)
        if len(names) >= 2:
            out.append({
                "names": names,
                "paths": paths,
                "sources": sources,
                "score": round(max_score, 3),
                "kind": "similar",
            })
    out.sort(key=lambda c: -c["score"])
    return out


def find_content_duplicates(min_size: int = 100) -> List[Dict]:
    """Find skills whose SKILL.md body is identical (or near-identical) across
    folders. Useful for spotting "the same file is in 3 places" duplicates.

    min_size: only consider files >= this many bytes (skip empty stubs).
    """
    paths_by_hash: Dict[str, List[str]] = {}
    for skills_dir, _ in SKILL_SOURCES:
        if not skills_dir.is_dir():
            continue
        for child in skills_dir.iterdir():
            if not child.is_dir():
                continue
            skill_md = child / "SKILL.md"
            if not skill_md.is_file():
                continue
            try:
                body = skill_md.read_bytes()
            except OSError:
                continue
            if len(body) < min_size:
                continue
            h = hashlib.md5(body).hexdigest()
            paths_by_hash.setdefault(h, []).append(str(skill_md))
    out: List[Dict] = []
    for h, paths in paths_by_hash.items():
        if len(paths) > 1:
            # Multiple folders have the exact same file — that's a content duplicate
            out.append({
                "hash": h,
                "paths": paths,
                "names": [Path(p).parent.name for p in paths],
                "kind": "content-duplicate",
            })
    return out


import hashlib  # noqa: F811  (also imported at top of file)
from pathlib import Path  # noqa: F811


def _score_skill(skill: GlobalSkill, task_tokens: List[str]) -> float:
    """Score a single skill against the task tokens. Higher = more relevant."""
    if not task_tokens or not skill.keywords:
        return 0.0
    skill_set = set(skill.keywords)
    task_set = set(task_tokens)
    # Token overlap (Jaccard-ish)
    overlap = skill_set & task_set
    if not overlap:
        return 0.0
    base = len(overlap) / max(len(skill_set), 1)
    # Boost for direct name match
    name_tokens = set(_extract_keywords(skill.name.replace("-", " ")))
    name_bonus = 1.0 if (name_tokens & task_set) else 0.0
    # Boost for description containing any task token
    desc_lower = skill.description.lower()
    desc_bonus = sum(0.5 for t in task_set if t in desc_lower)
    return base + name_bonus + desc_bonus


def match_skills_to_task(task: str, top_n: int = 8) -> List[dict]:
    """Return the top N global skills that match the task. Each entry is:
        {"name": ..., "path": ..., "description": ..., "score": float, "matched_keywords": [...]}

    This is the function the Mavis (and --prewarm) call to find candidates.
    """
    idx = discover_global_skills()
    if not idx:
        return []
    task_tokens = _extract_keywords(task)
    if not task_tokens:
        return []
    scored: List[Tuple[float, GlobalSkill, List[str]]] = []
    task_set = set(task_tokens)
    for s in idx:
        score = _score_skill(s, task_tokens)
        if score > 0:
            matched = sorted(set(s.keywords) & task_set)
            scored.append((score, s, matched))
    scored.sort(key=lambda t: -t[0])
    return [
        {
            "name": s.name,
            "path": s.path,
            "description": s.description,
            "score": round(score, 3),
            "matched_keywords": matched,
            "source": s.source,
        }
        for score, s, matched in scored[:top_n]
    ]




KIND_ICONS = {
    "skills-collection": "📚",
    "agent": "🤖",
    "orchestrator": "🎼",
    "cli": "🛠️ ",
    "search": "🔍",
    "memory": "🧠",
    "graph": "🕸️ ",
    "codex": "📟",
    "claude": "💬",
    "ui-taste": "🎨",
    "design-md": "📐",
    "methodology": "📏",
    "performance": "⚡",
    "code-review": "🔎",
    "knowledge-graph": "🧮",
    "skills-registry": "📜",
    "react": "⚛️  ",
    "persona": "🦁",
    "god-command": "⚡",
}


def render_table(integrations: List[Integration], title: str) -> str:
    lines = [f"# {title}", ""]
    lines.append(f"{'STATUS':<8}  {'KIND':<22}  {'ID':<26}  {'NAME'}")
    lines.append("-" * 90)
    for i in integrations:
        icon = KIND_ICONS.get(i.kind, "  ")
        status = "✅" if i.installed else "❌"
        lines.append(
            f"  {status:<6}  {icon} {i.kind:<18}  {i.id:<26}  {i.name}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cli(argv: List[str]) -> int:
    """The catalog CLI: list, info, install, kinds, selftest."""
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        print()
        print("Usage:")
        print("  catalog.py list                 # list all 31 + detected status")
        print("  catalog.py list installed       # only installed")
        print("  catalog.py list available       # only not-installed")
        print("  catalog.py list --kind <kind>   # filter by kind")
        print("  catalog.py info <id>            # show details for an integration")
        print("  catalog.py install <id>         # show install hint (not auto-exec)")
        print("  catalog.py kinds                # list all kinds")
        print("  catalog.py selftest             # check the catalog is well-formed")
        return 0

    cmd = argv[1]
    detect_all()  # always re-detect on each call

    if cmd == "list":
        kind_filter = None
        scope = "all"
        i = 2
        while i < len(argv):
            a = argv[i]
            if a == "installed":
                scope = "installed"
            elif a == "available":
                scope = "available"
            elif a == "--kind" and i + 1 < len(argv):
                kind_filter = argv[i + 1]
                i += 1
            i += 1

        items = INTEGRATIONS
        if scope == "installed":
            items = list_installed()
        elif scope == "available":
            items = list_available()
        if kind_filter:
            items = [it for it in items if it.kind == kind_filter]

        title = f"Catalog: {len(items)} integration(s)"
        if scope != "all":
            title += f" ({scope})"
        if kind_filter:
            title += f" — kind={kind_filter}"
        print(render_table(items, title))
        print()
        print(f"Total: {len(INTEGRATIONS)} | Installed: {len(list_installed())} | "
              f"Available: {len(list_available())}")
        return 0

    if cmd == "info":
        if len(argv) < 3:
            print("Usage: catalog.py info <id>")
            return 64
        d = info(argv[2])
        if not d:
            print(f"Unknown integration: {argv[2]}")
            return 1
        import json
        print(json.dumps(d, indent=2))
        return 0

    if cmd == "install":
        if len(argv) < 3:
            print("Usage: catalog.py install <id>")
            return 64
        print(install_hint(argv[2]))
        return 0

    if cmd == "kinds":
        seen: Dict[str, int] = {}
        for i in INTEGRATIONS:
            seen[i.kind] = seen.get(i.kind, 0) + 1
        for k, n in sorted(seen.items()):
            print(f"  {KIND_ICONS.get(k, '  ')} {k:<22}  {n}")
        return 0

    if cmd == "selftest":
        # The catalog must have unique IDs, and every entry must have a name+repo
        seen_ids: set = set()
        problems: List[str] = []
        for i in INTEGRATIONS:
            if not i.id:
                problems.append(f"{i.name}: missing id")
            if not i.name:
                problems.append(f"{i.id}: missing name")
            if not i.repo:
                problems.append(f"{i.id}: missing repo")
            if i.id in seen_ids:
                problems.append(f"{i.id}: duplicate id")
            seen_ids.add(i.id)
        if problems:
            print("FAIL")
            for p in problems:
                print(f"  - {p}")
            return 1
        # Also smoke-test the auto-discovery across all 3 sources
        per_source = discover_global_skills_all_sources()
        idx = discover_global_skills()
        if not idx:
            print("FAIL: discover_global_skills() returned no entries")
            return 1
        # Match a known task
        matches = match_skills_to_task("build a shadcn checkout flow", top_n=5)
        if not matches:
            print("FAIL: match_skills_to_task returned no matches for a UI task")
            return 1
        print(f"PASS: {len(INTEGRATIONS)} integrations, all well-formed")
        for source, items in per_source.items():
            print(f"      {len(items):>5} global skills discovered in ~/.{source}/skills/")
        print(f"      {len(idx):>5} unique skills after dedupe")
        print(f"      match_smoke: 5 top matches for 'build a shadcn checkout flow':")
        for s in matches:
            print(f"        - {s['name']:<32} (score={s['score']}, source={s.get('source', '?')})")
        return 0

    print(f"Unknown command: {cmd}")
    return 64


if __name__ == "__main__":
    import sys
    sys.exit(cli(sys.argv))
