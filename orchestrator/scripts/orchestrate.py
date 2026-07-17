#!/usr/bin/env python3
"""orchestrate.py — auto-route a task description through /apeiron-ship's stages.

v4.3.0 — pre-warm contract:
  * Word boundaries via regex \\b — kills the v2.1.1 `p ` / ` ship ` false positives.
  * Arabic / mixed-language support out of the box.
  * Expanded MMAS patterns — "team of N agents", "use a team", "spawn X and Y".
  * BUILD/PUBLISH word-boundary matching.
  * Self-test mode (--selftest) with a 47-case regression battery.
  * dt-first dispatch (--dispatch → dt run --backend=<X>).
  * --direct escape hatch, --team MMAS override.
  * Dynamic integration resolution (superpowers / waza / unslop / autoresearch).
  * **NEW: --prewarm** — emit a JSON manifest of skills to load, paths to
    SKILL.md files, the verdict, and the dispatch command. The Apeiron
    session reads this and calls `skill` tool on each path before
    proceeding — so the chain's guidance is already in context.
  * **NEW: brief generation** — `--dispatch` writes a markdown brief
    to /tmp/apeiron-brief-*.md containing the task, the chain plan, and
    the prewarm manifest, then passes it to `dt run --brief <path>`. The
    backend agent (codex / claude / etc.) sees the same context the
    Apeiron session has.
"""

import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# The neural mesh (neural-mesh.json) is the connective tissue shared with the
# dt CLI. Imported lazily-safe: load_mesh() returns None if the file is absent.
try:
    from neural_mesh import load_mesh
except ImportError:  # pragma: no cover — running from a different cwd
    def load_mesh(*_args, **_kwargs):  # type: ignore
        return None

VERSION = "4.3.0"


# ---------------------------------------------------------------------------
# Normalization / tokenization
# ---------------------------------------------------------------------------

def normalize(text: str) -> str:
    """NFKC, lowercase, collapse whitespace. Preserves Arabic / Unicode."""
    text = unicodedata.normalize("NFKC", text or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def tokenize(text: str) -> List[str]:
    """Word tokens, unicode-aware (Latin + Arabic blocks)."""
    return re.findall(r"[\w\u0600-\u06FF]+", text)


# ---------------------------------------------------------------------------
# Pattern matchers — all word-boundary aware
# ---------------------------------------------------------------------------

def has_word(word: str, text: str) -> bool:
    return re.search(rf"\b{re.escape(word)}\b", text, re.UNICODE) is not None


def has_phrase(phrase: str, text: str) -> bool:
    return re.search(rf"\b{re.escape(phrase)}\b", text, re.UNICODE) is not None


def has_regex(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.UNICODE) is not None


def any_pat(patterns: List[str], text: str) -> bool:
    return any(has_regex(p, text) for p in patterns)


# ---------------------------------------------------------------------------
# Pattern groups (English + Arabic)
# ---------------------------------------------------------------------------

# RESEARCH — overrides everything
RESEARCH_PATS = [
    r"\bresearch\b", r"\binvestigate\b", r"\bsurvey\b", r"\bstudy\b",
    r"\bexplore\b", r"\bread about\b", r"\blearn about\b",
    r"\bunderstand (?:how|why|what)\b",
    r"\bابحث\b", r"\bادرس\b", r"\bاستكشف\b",
]

# MEMORY — overrides everything (highest priority: recall from agent-kernel)
# Triggers when the user asks to remember/recall past decisions or facts.
# Routes to agent-kernel (persistent memory layer), no code execution.
MEMORY_PATS = [
    # English: "remember this/that/...", "what did we ...", "last time",
    # "previously", "what was the decision"
    r"\bremember (?:this|that|these|those)\b",
    r"\bremember (?:to|that)\b",
    r"\bwhat did we do\b",
    r"\bwhat did we (?:decide|choose|pick)\b",
    r"\bwhat was the (?:decision|conclusion|outcome|verdict)\b",
    r"\blast time\b",
    r"\bpreviously\b",
    r"\bin (?:the )?past\b",
    # Arabic: "تذكر", "ماذا فعلنا", "في الماضي", "آخر مرة"
    r"\bتذكر\b", r"\bماذا فعلنا\b", r"\bفي الماضي\b", r"\bآخر مرة\b",
    r"\bما الذي قررناه\b",
]

# Trivial — explicit operations with no design weight
TRIVIAL_PATS = [
    r"^rename\b", r"^comments? (?:out|on)\b", r"\bcomment out\b",
    r"\bremove that\b", r"^bump version\b", r"\bupdate the version\b",
]

# BUILD / PUBLISH — strong override (wins over accidental UI/perf scores)
BUILD_PATS = [
    r"\bpublish\b", r"\brelease\b", r"\bship\b", r"\bpush\b",
    r"\bdeploy\b", r"\blaunch\b", r"\bpackage it\b",
    r"\bcut a release\b", r"\bbuild a repo\b", r"\bbuild a package\b",
    r"\bbuild a library\b", r"\bbuild an? sdk\b",
    r"\bgithub\b", r"\bopen[- ]source\b", r"\bopensource\b", r"\bcontribute\b",
    r"\bانشر\b", r"\bأطلق\b", r"\bانتقل إلى production\b",
]

# /think strong — design / plan / architect
THINK_STRONG = [
    r"\bplan\b", r"\bdesign\b", r"\barchitect\b",
    r"\bhow should\b", r"\bwhat'?s the best\b",
    r"\bapproach\b", r"\bstrategy\b",
    r"\bصمم\b", r"\bخطط\b", r"\bبنية\b",
]

# /think soft — generic build verbs
THINK_SOFT = [
    r"\bbuild\b", r"\bcreate\b", r"\bimplement\b",
    r"\badd a\b", r"\bdevelop\b", r"\bscaffold\b", r"\bgenerate\b",
    r"\bابني\b", r"\bأضف\b", r"\bأنشئ\b", r"\bطور\b",
]

# UI anchors (true UI keywords, not agentic / backend)
UI_ANCHORS = [
    r"\bui\b", r"\bfrontend\b", r"\bfront[- ]end\b", r"\bواجهة\b", r"\bui\b",
]

# Backend / CLI anchors (suppress UI gate)
BACKEND_ANCHORS = [
    r"\bagentic\b", r"\bapi\b", r"\bbackend\b", r"\bserver\b",
    r"\bcli\b", r"\bterminal\b", r"\bquery\b", r"\bsql\b",
    r"\bendpoint\b", r"\bhandler\b", r"\bcli\b",
    r"\bخادم\b", r"\bسيرفر\b",
]

# Page-name patterns (UI signal even without explicit "ui")
PAGE_NAMES = [
    "landing page", "pricing page", "dashboard page",
    "settings page", "profile page", "signup page",
    "login page", "checkout flow", "onboarding flow",
    "صفحة هبوط", "صفحة تسعير",
]

# Component / styling patterns (UI signal)
COMPONENT_WORDS = [
    "component", "layout", "css", "tailwind", "shadcn",
    "modal", "form", "design system", "color palette", "typography",
    "مكون", "تصميم",
]

# Bug signals
BUG_STRONG = [
    r"\bfix\b", r"\bdebug\b", r"\bbug\b", r"\bbroken\b",
    r"\bregression\b", r"\bfailing\b", r"\bfails?\b",
    r"\bcrash\b", r"\bleak\b", r"\bundefined\b",
    r"\bأصلح\b", r"\bمعطوب\b", r"\bعطل\b",
]

BUG_SOFT = [
    r"\berror\b", r"\bexception\b", r"\bhang\b", r"\bwrong\b",
    r"\bnot working\b", r"\bdoesn'?t work\b",
    r"\bخطأ\b", r"\bمشكلة\b",
]

# Performance metrics (numerical)
PERF_METRIC = [
    r"\bp\d{1,3}\b",          # p50 / p95 / p99
    r"\d+\s*%",               # 50%
    r"<\s*\d+",               # < 200
    r">\s*\d+",               # > 100
    r"\breduce\b.*?\bby\b",   # reduce by 50%
    r"\bincrease\b.*?\bby\b", # increase by 20%
]

# Performance named metrics
PERF_NAMED = [
    r"\bcoverage\b", r"\blatency\b", r"\bbundle size\b",
    r"\bthroughput\b", r"\bmemory\b", r"\brps\b", r"\bqps\b",
]

# Performance soft signals
PERF_SOFT = [
    r"\bperf\b", r"\bperformance\b", r"\bslow\b",
    r"\bfaster\b", r"\boptimi[sz]e\b",
    r"\breduce\b", r"\bminimi[sz]e\b",
    r"\bبطيء\b", r"\bأسرع\b", r"\bأداء\b", r"\bكفاءة\b",
]

# Heavy multi-file work (delegate-team)
DELEGATE_SIGS = [
    r"\brefactor\b", r"\bmigrat\w*", r"\boverhaul\b", r"\brewrite\b",
    r"\bacross\b", r"\bmulti[- ]file\b", r"\barchitecture\b",
    r"\bintegrate\b", r"\bservice\b", r"\bmodule\b",
]

# Explicit delegation to a specific CLI implementer agent.
# "delegate this to grok" / "have codex do X" / "run it through opencode" etc.
DELEGATE_TO_PATS = [
    r"\bdelegate (?:this|it|the task|the work)?\s*(?:to|via|through|with)\s+(\w+)\b",
    r"\bhave\s+(\w+)\s+(?:do|implement|build|fix|write|refactor|handle)\b",
    r"\brun (?:it|this|the task)?\s*(?:through|via|with)\s+(\w+)\b",
    r"\buse\s+(\w+)\s+delegate\b",
    r"\bask\s+(\w+)\s+to\b",
]

# Map a captured agent alias → delegate skill id.
DELEGATE_AGENT_ALIASES = {
    "grok": "grok-delegate",
    "codex": "codex-delegate",
    "opencode": "opencode-delegate",
    "open-code": "opencode-delegate",
    "kimi": "kimi-delegate",
    "agy": "agy-delegate",
}

# Multi-agent team signals (MMAS)
MMAS_STRONG = [
    r"\bsquad\b", r"\bswarm\b", r"\bcrew\b",
    r"\bmulti[- ]agent\b", r"\bparallel agents\b", r"\bconcurrent agents\b",
    r"\bteam of agents\b",                  # team of agents
    r"\bteam of \d+ agents?\b",             # team of 3 agents
    r"\bspawn (?:a )?team\b",               # spawn team / spawn a team
    r"\bspawn \w+ (?:and|&|,) \w+\b",       # spawn atlas and forge
    r"\bagent crew\b", r"\bdivision of labor\b",
    r"\bفريق\b", r"\bعملاء متعددين\b",
]

# MMAS weak — needs team-agent context
MMAS_WEAK = [
    r"\bspeciali[sz]e\b",                  # speciali[sz]e
    r"\bteam of \w+\b",                    # team of N / team of coders
    r"\bspawn\b",                          # spawn [X]
]


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_task(task: str) -> Dict[str, int]:
    """Return a dict of stage→score. Empty dict means 'trivial'."""
    n = normalize(task)
    # Reset per-call: explicit delegate-to target (carried to pick_verdict).
    score_task.delegate_to = None  # type: ignore[attr-defined]

    # ----- MEMORY override (highest priority — recall from agent-kernel) -----
    # If the user explicitly says "remember this" or asks "what did we do",
    # route to agent-kernel BEFORE anything else — even RESEARCH.
    if any_pat(MEMORY_PATS, n):
        return {"memory": 4}

    # ----- RESEARCH override (next) -----
    if any_pat(RESEARCH_PATS, n):
        return {"research": 4}

    # ----- Trivial explicit override -----
    if any_pat(TRIVIAL_PATS, n):
        return {}

    scores: Dict[str, int] = {
        "think": 0, "research": 0, "systematic": 0, "unslop": 0,
        "writing": 0, "autoresearch": 0, "delegate": 0, "mmas": 0,
        "check": 0, "qguard": 0,
    }

    # ----- BUILD/PUBLISH — strong override signal -----
    if any_pat(BUILD_PATS, n):
        scores["think"] = 3
        scores["delegate"] = 3
        scores["check"] = 2
        scores["qguard"] = 2
        scores["unslop"] = 0
        scores["mmas"] = 0

    # ----- /think -----
    if any_pat(THINK_STRONG, n):
        scores["think"] += 3
    if any_pat(THINK_SOFT, n):
        scores["think"] += 2

    # ----- UNSLOP UI gate -----
    is_ui_anchored = any(has_regex(p, n) for p in UI_ANCHORS)
    is_backend_anchored = any(has_regex(p, n) for p in BACKEND_ANCHORS)

    if is_ui_anchored and not is_backend_anchored:
        scores["unslop"] = 4
    elif any(has_phrase(p, n) for p in PAGE_NAMES):
        scores["unslop"] = 4
    elif (
        any(has_word(p, n) for p in COMPONENT_WORDS)
        and not is_backend_anchored
    ):
        scores["unslop"] = 3

    # ----- systematic-debugging -----
    if any_pat(BUG_STRONG, n):
        scores["systematic"] = 3
    elif any_pat(BUG_SOFT, n):
        scores["systematic"] = 2

    # ----- autoresearch -----
    if any_pat(PERF_METRIC, n):
        scores["autoresearch"] = 4
    elif any_pat(PERF_NAMED, n):
        scores["autoresearch"] = 3
    elif any_pat(PERF_SOFT, n):
        scores["autoresearch"] = 2

    # ----- /delegate-team -----
    if any_pat(DELEGATE_SIGS, n):
        scores["delegate"] += 3

    # ----- Explicit delegate-to-<agent> (delegate-skills component) -----
    # Captures the named CLI implementer (grok/codex/opencode/kimi/agy) and
    # resolves it to the matching delegate skill. Stored on the function so the
    # verdict can name the skill.
    resolved_agent = None
    for pat in DELEGATE_TO_PATS:
        m = re.search(pat, n)
        if m:
            alias = (m.group(1) or "").lower()
            resolved_agent = DELEGATE_AGENT_ALIASES.get(alias)
            if resolved_agent:
                break
    score_task.delegate_to = resolved_agent  # type: ignore[attr-defined]
    if resolved_agent:
        # Strong signal: an explicit delegate request beats the generic FEATURE bump.
        scores["delegate"] = max(scores["delegate"], 4)

    # ----- Default FEATURE bump -----
    # If the task is clearly a build (think ≥ 2) and nothing more specific
    # (perf / UI gate / MMAS / bug) claimed it, default to /delegate-team.
    # This was a v2.1.1 rule that the rewrite initially dropped.
    if (
        scores["think"] >= 2
        and scores["autoresearch"] == 0
        and scores["delegate"] == 0
        and scores["unslop"] < 3
    ):
        scores["delegate"] += 2

    # ----- MMAS — multi-agent team -----
    if any_pat(MMAS_STRONG, n):
        scores["mmas"] = 4
    elif (
        has_word("specialist", n) or has_word("specialists", n)
        or has_word("specialize", n) or has_word("specialise", n)
    ) and (
        has_word("working", n) or has_word("agents", n)
        or has_word("roles", n)
    ):
        scores["mmas"] = 4
    elif (
        has_word("parallel", n) or has_word("concurrent", n)
    ) and (
        has_word("agents", n)
        or has_word("specialists", n)
        or has_word("roles", n)
    ):
        scores["mmas"] = 3
    elif has_word("use", n) and has_word("team", n):
        # "use a team", "use the team", "use this team"
        scores["mmas"] = 3
    elif has_word("spawn", n) and has_word("team", n):
        # catch-all for spawn + team in any phrasing
        scores["mmas"] = 3

    # ----- Trivial structural fallback -----
    tokens = tokenize(n)
    if (
        len(tokens) <= 4
        and scores["think"] == 0
        and scores["delegate"] == 0
        and scores["unslop"] < 3
        and scores["mmas"] == 0
        and scores["systematic"] == 0
        and scores["autoresearch"] == 0
    ):
        return {}

    # ----- Derived stages -----
    if scores["think"] >= 2:
        scores["writing"] = 2
    if scores["think"] >= 2 or scores["systematic"] >= 2 or scores["delegate"] >= 2:
        scores["check"] = max(scores["check"], 2)
    if scores["unslop"] >= 3 or scores["delegate"] >= 2:
        scores["qguard"] = max(scores["qguard"], 2)
    # NEW: perf path also gates through /check + quality-guard
    if scores["autoresearch"] >= 3:
        scores["check"] = max(scores["check"], 2)
        scores["qguard"] = max(scores["qguard"], 2)

    return scores


# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------

def pick_verdict(n: str, scores: Dict[str, int]) -> str:
    if scores.get("memory", 0) >= 4:
        return "MEMORY path — invoke agent-kernel (persistent memory; no code execution)."
    if scores.get("research", 0) >= 4:
        return "RESEARCH path — invoke `learn` skill (no code)."
    if any_pat(BUILD_PATS, n) and scores.get("unslop", 0) == 0:
        return "BUILD/PUBLISH path — delegate-team (→ mini-coder-max), no unslop gate."
    if scores.get("autoresearch", 0) >= 3:
        return "PERFORMANCE/METRIC path — autoresearch loop is the engine, then quality-guard."
    # Loosened: any soft perf word (slow / faster / optimize / ...) plus no
    # stronger signal (UI / bug / build-publish) is enough to flag perf path.
    # Better to over-route than miss a perf intent.
    if (
        scores.get("autoresearch", 0) >= 2
        and scores.get("unslop", 0) < 3
        and scores.get("systematic", 0) == 0
        and scores.get("delegate", 0) == 0
    ):
        return "PERFORMANCE/METRIC path — soft perf signal, autoresearch is the engine."
    if scores.get("unslop", 0) >= 3:
        return "UI DELIVERY path — unslop audit (score≥70) is BLOCKING before delegate-team."
    if scores.get("mmas", 0) >= 3:
        return "MULTI-AGENT TEAM path — apeiron-team (MMAS) with Atlas+ agents."
    # Explicit delegate-to-<agent> (delegate-skills component): name the skill
    # and remind the orchestrator it stays the reviewer (the relay never commits).
    if getattr(score_task, "delegate_to", None):
        return (f"DELEGATE path — {score_task.delegate_to} skill "
                f"(write brief, review diff, land it yourself).")
    if scores.get("systematic", 0) >= 3:
        return "BUG path — debug-issue before any patch, then quality-guard."
    if scores.get("delegate", 0) >= 2:
        return "FEATURE path — delegate-team (→ mini-coder-max), then quality-guard."
    return "Default full chain — plan-mode → delegate-team → review-delta → quality-guard."


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

STAGE_LABELS: List[Tuple[str, str]] = [
    # key             # default fallback (used when framework missing)
    ("think",        "plan-mode"),
    ("research",     "learn (research)"),
    ("systematic",   "debug-issue"),
    ("unslop",       "unslop audit (UI gate)"),
    ("writing",      "brainstorming"),
    ("autoresearch", "autoresearch loop"),
    ("delegate",     "delegate-team (→ mini-coder-max)"),
    ("mmas",         "apeiron-team (MMAS)"),
    ("check",        "review-delta"),
    ("qguard",       "quality-guard"),
]


def _resolved_stage_labels() -> List[Tuple[str, str]]:
    """Return STAGE_LABELS with the label replaced by the real installed
    framework if the owning integration is on disk."""
    ints = detect_integrations()
    resolved: List[Tuple[str, str]] = []
    for key, fallback in STAGE_LABELS:
        framework = STAGE_TO_FRAMEWORK.get(key)
        if framework and ints.get(framework, {}).get("installed"):
            skill_name = STAGE_TO_SKILL.get(key, key)
            resolved.append((key, f"{framework}:{skill_name}"))
        else:
            resolved.append((key, fallback))
    return resolved


def format_output(task: str, scores: Dict[str, int], team: bool = False) -> str:
    n = normalize(task)
    out: List[str] = [f'# /apeiron-ship route for: "{task}"', ""]
    if not scores:
        out.append("TRIVIAL — handle locally, skip the chain.")
        out.append("")
        out.append("# No dispatch needed (trivial task).")
        out.append("")
        out.append(render_integrations_status())
        return "\n".join(out)

    pairs = [
        (label, scores.get(key, 0))
        for key, label in _resolved_stage_labels()
        if scores.get(key, 0) > 0
    ]
    pairs.sort(key=lambda x: -x[1])
    out.append("Stages (descending score):")
    for label, score in pairs:
        out.append(f"  • {label} (score={score})")
    out.append("")
    out.append("# Verdict:")
    out.append(pick_verdict(n, scores))

    # --- Dispatch hint ---
    dispatch = dispatch_for_verdict(n, scores, team=team)
    if dispatch:
        out.append("")
        out.append("# Dispatch:")
        out.append(dispatch)

    # --- Integrations status ---
    out.append("")
    out.append(render_integrations_status())

    return "\n".join(out)


# ---------------------------------------------------------------------------
# Backend selection (which coding agent handles this path best)
# ---------------------------------------------------------------------------

# Path → recommended backend. None means "no execution, use a skill instead".
PATH_BACKEND = {
    "RESEARCH":     None,    # use `learn` skill — no code execution
    "MEMORY":       None,    # use agent-kernel — persistent memory (no code)
    "BUG":          "minimax",
    "BUILD":        "minimax",
    "PERFORMANCE":  "codex",     # Codex strong for metric/measurement work
    "UI":           "claude",    # Claude Code is the UI/frontend specialist
    "MULTI-AGENT":  None,        # apeiron-team handles internally
    "FEATURE":      "minimax",
}

# All 6 backends the delegate-team supersystem supports.
ALL_BACKENDS = ("codex", "claude", "gemini", "minimax", "mmx", "opencode")


# ---------------------------------------------------------------------------
# Integration detection — does each companion framework exist on disk?
# ---------------------------------------------------------------------------
#
# All integrations live in `~/.claude/skills/` (Claude Code convention).
# We check for specific skill names per framework. Slash commands under
# `~/.claude/commands/` for autoresearch. Binaries on PATH for unslop + dt.

# Required skill names per framework. If at least `min_required` of them are
# present, the framework is considered installed.
INTEGRATION_REQUIRED = {
    "superpowers": {
        "min_required": 8,
        "skills": [
            "brainstorming", "writing-plans", "test-driven-development",
            "systematic-debugging", "verification-before-completion",
            "dispatching-parallel-agents", "executing-plans",
            "subagent-driven-development", "using-git-worktrees",
            "requesting-code-review", "receiving-code-review",
            "finishing-a-development-branch", "writing-skills",
            "using-superpowers",
        ],
    },
    "waza": {
        "min_required": 6,
        "skills": ["think", "ui", "check", "hunt", "write", "learn", "read", "health"],
    },
    "unslop-preflight": {
        # The skill itself + the binary both count.
        "min_required": 1,
        "skills": ["unslop"],
    },
    "autoresearch": {
        # The skill + a slash command both count.
        "min_required": 1,
        "skills": ["autoresearch"],
    },
}

# Map orchestrator stage-key → framework that owns the canonical version.
STAGE_TO_FRAMEWORK = {
    "think":        "waza",            # /think
    "research":     "waza",            # /learn
    "systematic":   "superpowers",     # systematic-debugging
    "unslop":       "unslop-preflight",
    "writing":      "superpowers",     # writing-plans
    "autoresearch": "autoresearch",
    "check":        "waza",            # /check (review-delta)
    "delegate":     None,              # dt, no framework
    "mmas":         None,              # apeiron-team, no framework
    "qguard":       None,              # quality-guard, built-in
}

# Map stage-key → specific skill name within its framework.
STAGE_TO_SKILL = {
    "think":        "think",
    "research":     "learn",
    "systematic":   "systematic-debugging",
    "unslop":       "unslop",
    "writing":      "writing-plans",
    "autoresearch": "autoresearch",
    "check":        "check",
}

# Where each skill lives on disk. Used to (a) emit prewarm hints for the
# Apeiron session, and (b) embed the path list in the brief for backend agents.
CLAUDE_SKILLS_DIR = os.path.expanduser("~/.claude/skills")
CLAUDE_COMMANDS_DIR = os.path.expanduser("~/.claude/commands")
AGENTS_SKILLS_DIR = os.path.expanduser("~/.agents/skills")
APEIRON_SKILLS_DIR = os.path.expanduser("~/.apeiron/skills")


def skill_path_for_stage(stage_key: str) -> Optional[str]:
    """Return the filesystem path to the SKILL.md for a stage, if any."""
    skill_name = STAGE_TO_SKILL.get(stage_key)
    if not skill_name:
        return None
    p = os.path.join(CLAUDE_SKILLS_DIR, skill_name, "SKILL.md")
    return p if os.path.isfile(p) else None


def build_json_trace(task: str, scores: Dict[str, int], check_kernel: bool = False) -> dict:
    """Build the JSON trace consumed by `tests/v26-smoke.test.ts` and any
    external orchestrator consumer that wants machine-readable routing.

    Returned dict shape (contract — v2.7.0+):
      {
        "task":                         str,
        "timestamp":                    ISO-8601 UTC,
        "detected_signals":             {
            "publish_release_build":   0|1,    # BUILD/PUBLISH signal (binary flag)
            "ui_frontend":             int,    # UI DELIVERY score
            "bug_fix":                 int,    # BUG score
            "metrics_research":        int,    # PERFORMANCE/METRIC score
            "memory_recall":           int,    # MEMORY score
            "multi_agent":             int,    # MULTI-AGENT score
            "research":                int,    # RESEARCH score (additional signal)
            "feature":                 int,    # FEATURE / default score
        },
        "selected_workflow":             str,   # clean workflow name (e.g. "UI DELIVERY", "MEMORY", "BUILD/PUBLISH")
        "selected_workflow_description": str,   # full human-readable description (e.g. "unslop audit (score≥70) is BLOCKING before delegate-team.")
        "selected_stages":              [str], # ordered list of stage keys
        "skipped_stages":               [str], # stage keys that scored 0
        "reasons":                      [str], # human-readable explanations
        "dispatch":                     str,   # exact command (or "" for no-dispatch paths)
        "kernel_used":                  0|1,   # 1 if agent-kernel is present in this trace
      }

    This is the ONLY output when --json is used. Any debug/decorative output
    must go to stderr so the JSON contract is preserved.
    """
    import datetime as _dt

    n = normalize(task)
    verdict = pick_verdict(n, scores) if scores else "TRIVIAL"
    dispatch = _dispatch_command(n, scores) if scores else ""

    # Split the verdict into clean name + descriptive tail.
    # e.g. "UI DELIVERY path — unslop audit (score≥70) is BLOCKING before delegate-team."
    #   → name: "UI DELIVERY"
    #   → desc: "unslop audit (score≥70) is BLOCKING before delegate-team."
    if " path " in verdict:
        wf_name, wf_desc_full = verdict.split(" path ", 1)
        # Strip leading em-dash / colon / whitespace from the description
        wf_desc = wf_desc_full.lstrip(" —:-")
    elif verdict == "TRIVIAL":
        wf_name = "TRIVIAL"
        wf_desc = "handle locally, skip the chain."
    else:
        wf_name = verdict
        wf_desc = ""

    # Translate internal scoring keys → spec-required signal buckets.
    # publish_release_build is a BINARY flag (0|1) — it does NOT carry the
    # combined score, because tests assert `.toBe(1)` exactly.
    detected_signals = {
        "publish_release_build": 1 if any_pat(BUILD_PATS, n) else 0,
        "ui_frontend":           int(scores.get("unslop", 0)),
        "bug_fix":               int(scores.get("systematic", 0)),
        "metrics_research":      int(scores.get("autoresearch", 0)),
        "memory_recall":         int(scores.get("memory", 0)),
        "multi_agent":           int(scores.get("mmas", 0)),
        "research":              int(scores.get("research", 0)),
        "feature":               int(scores.get("delegate", 0)),
    }

    # Stage ordering: pick all stages that scored > 0, in canonical order
    selected_stages: List[str] = []
    skipped_stages:  List[str] = []
    for key, _label in STAGE_LABELS:
        if scores.get(key, 0) > 0:
            selected_stages.append(key)
        else:
            skipped_stages.append(key)

    # Human-readable reasons for the verdict
    reasons: List[str] = []
    if scores.get("memory", 0) >= 4:
        reasons.append("Memory recall signal matched (remember / what did we / last time).")
    if scores.get("research", 0) >= 4:
        reasons.append("Research signal matched (research / investigate / study / explore).")
    if any_pat(BUILD_PATS, n):
        reasons.append("Publish / release / ship / deploy / github signal matched.")
    if scores.get("autoresearch", 0) >= 3:
        reasons.append("Performance metric or named-perf keyword present.")
    if scores.get("unslop", 0) >= 3:
        reasons.append("UI / frontend / page-name signal present.")
    if scores.get("systematic", 0) >= 3:
        reasons.append("Bug / fix / debug keyword present.")
    if scores.get("mmas", 0) >= 3:
        reasons.append("Multi-agent team signal (team / parallel / spawn).")
    if scores.get("delegate", 0) >= 2:
        reasons.append("Generic build/feature signal — default delegate-team path.")
    if not reasons:
        reasons.append("Trivial task — no chain invoked.")

    # kernel_used: 1 if agent-kernel is present + score > 0 for memory/stages,
    # OR if --check-kernel was passed. detect_integrations() reads from
    # the catalog and is safe to call from anywhere.
    kernel_info = detect_integrations().get("agent-kernel", {})
    if check_kernel:
        # User asked explicitly: report 1 if installed, 0 if not.
        kernel_used = 1 if kernel_info.get("installed") else 0
    else:
        kernel_used = 1 if (kernel_info.get("installed") and (
            scores.get("memory", 0) > 0
            or scores.get("systematic", 0) > 0
            or scores.get("delegate", 0) > 0
        )) else 0

    return {
        "task":                         task,
        "timestamp":                    _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "detected_signals":             detected_signals,
        "selected_workflow":            wf_name,
        "selected_workflow_description": wf_desc,
        "selected_stages":              selected_stages,
        "skipped_stages":               skipped_stages,
        "reasons":                      reasons,
        "dispatch":                     dispatch,
        "kernel_used":                  kernel_used,
    }


def build_prewarm_manifest(task: str, scores: Dict[str, int]) -> dict:
    """Build a structured manifest of what the Apeiron session (or the backend
    brief) should pre-warm before tackling the task.

    MANDATORY: this manifest is built on every --prewarm / dispatch, and
    the Apeiron session reads it before starting the chain. The auto-discovery
    of global skills (catalog.discover_global_skills + match_skills_to_task)
    runs here so the Apeiron always sees relevant skills from
    ~/.claude/skills/ — not just the chain-specific ones.

    Returned dict shape:
      {
        "task": str,
        "stages":     [chain-specific stages from the verdict],
        "auto_discovered": [top-N global skills matched by keyword overlap],
        "companions": [additional skills worth loading (TDD, UI)],
        "verdict":    str,
        "dispatch":   str,    # exact `dt run` command
        "agent_kernels_to_read": [paths],
      }
    """
    n = normalize(task)
    verdict = pick_verdict(n, scores) if scores else "TRIVIAL"
    dispatch = _dispatch_command(n, scores) if scores else ""

    # Chain-specific stages (from the verdict)
    seen: set = set()
    stages: list = []
    for key, _ in STAGE_LABELS:
        if scores.get(key, 0) > 0 and key not in seen:
            seen.add(key)
            path = skill_path_for_stage(key)
            framework = STAGE_TO_FRAMEWORK.get(key)
            skill_name = STAGE_TO_SKILL.get(key)
            stages.append({
                "key": key,
                "framework": framework,
                "skill": skill_name,
                "path": path,
                "installed": path is not None,
            })

    # Companion tools that are worth pre-warming for the chain
    extras: list = []
    if scores.get("delegate", 0) >= 2 or scores.get("unslop", 0) >= 3:
        tdd = os.path.join(CLAUDE_SKILLS_DIR, "test-driven-development", "SKILL.md")
        if os.path.isfile(tdd):
            extras.append({
                "skill": "test-driven-development",
                "path": tdd,
                "why": "mandatory methodology for any coding chain",
            })
    if scores.get("unslop", 0) >= 3:
        ui = os.path.join(CLAUDE_SKILLS_DIR, "ui", "SKILL.md")
        if os.path.isfile(ui):
            extras.append({
                "skill": "ui",
                "path": ui,
                "why": "UI generation complement to unslop audit",
            })

    # The Big Boss persona — load for any non-trivial coding path. The Apeiron
    # session is the staff engineer; this skill encodes the 6 laws and the
    # full tool/sub-agent matrix.
    if scores.get("delegate", 0) >= 2 or scores.get("systematic", 0) >= 3 or scores.get("unslop", 0) >= 3:
        bigboss = os.path.join(APEIRON_SKILLS_DIR, "big-boss", "SKILL.md")
        if os.path.isfile(bigboss):
            extras.append({
                "skill": "big-boss",
                "path": bigboss,
                "why": "Apeiron staff-engineer persona — full agency, terminal mastery, sub-agent delegation, rigor",
            })

    # Mandatory pre-search: find global skills that match the task.
    # The Apeiron (and the brief passed to backend agents) sees this and
    # decides what to actually load.
    auto_discovered: list = []
    similar_clusters: list = []
    content_duplicates: list = []
    try:
        from catalog import (
            match_skills_to_task,
            find_similar_skills,
            find_content_duplicates,
        )
        auto_discovered = match_skills_to_task(task, top_n=10)
        # Only include clusters relevant to the discovered skills (or top
        # global clusters if nothing matched).
        if auto_discovered and "name" in auto_discovered[0]:
            discovered_names = {a["name"] for a in auto_discovered if "name" in a}
            all_clusters = find_similar_skills(threshold=0.45)
            similar_clusters = [
                c for c in all_clusters
                if any(n in discovered_names for n in c["names"])
            ][:5]
            if not similar_clusters:
                # Fallback: top 3 global clusters
                similar_clusters = all_clusters[:3]
        else:
            similar_clusters = find_similar_skills(threshold=0.45)[:3]

        # Content duplicates — only show the cross-folder ones (different
        # paths in different folders with same body). In-folder dupes are
        # # noise.
        for d in find_content_duplicates(min_size=200):
            sources = {Path(p).parent.parent.name for p in d["paths"]}  # ~/.X/skills/...
            if len(sources) > 1:
                content_duplicates.append(d)
        content_duplicates = content_duplicates[:5]
    except Exception as e:
        auto_discovered = [{"error": f"auto-discovery failed: {e}"}]

    # Dedupe: drop auto-discovered entries that are already in stages or
    # companions (the Apeiron doesn't need to see the same skill twice).
    chain_paths = {s.get("path") for s in stages if s.get("path")}
    companion_paths = {c.get("path") for c in extras if c.get("path")}
    auto_discovered = [
        a for a in auto_discovered
        if a.get("path") not in chain_paths and a.get("path") not in companion_paths
    ]

    return {
        "task": task,
        "verdict": verdict,
        "dispatch": dispatch,
        "stages": stages,
        "auto_discovered": auto_discovered,
        "similar_clusters": similar_clusters,
        "content_duplicates": content_duplicates,
        "companions": extras,
        "agent_kernels_to_read": [
            os.path.expanduser("~/delegate-team/agent-kernel/MEMORY.md"),
        ] if scores else [],
    }


def _dispatch_command(n: str, scores: Dict[str, int]) -> str:
    """Build the exact `dt run` command for a given verdict."""
    n_norm = normalize(n)
    quoted = '"' + n.replace('"', '\\"') + '"'
    if scores.get("research", 0) >= 4:
        return ""
    if scores.get("mmas", 0) >= 3:
        return f'dt run --team {quoted}'
    backend = recommended_backend(n_norm, scores) or "minimax"
    return f"dt run --backend={backend} {quoted}"


def detect_integrations() -> dict:
    """Return a dict: framework_name → {installed: bool, found: int, total: int, ...}."""
    skills_dir = os.path.expanduser("~/.claude/skills")
    commands_dir = os.path.expanduser("~/.claude/commands")
    out: dict = {}

    for name, spec in INTEGRATION_REQUIRED.items():
        found = 0
        missing: list = []
        for skill in spec["skills"]:
            if os.path.isdir(os.path.join(skills_dir, skill)):
                found += 1
            else:
                missing.append(skill)
        installed = found >= spec["min_required"]

        extras: dict = {}
        if name == "unslop-preflight":
            extras["unslop_bin"] = which("unslop") or os.path.isfile(
                "/opt/homebrew/bin/unslop"
            )
        if name == "autoresearch":
            # Slash commands count too
            slash_count = 0
            if os.path.isdir(commands_dir):
                slash_count = sum(
                    1 for f in os.listdir(commands_dir)
                    if f.startswith("autoresearch")
                )
            extras["slash_commands"] = slash_count
            installed = installed or slash_count > 0

        out[name] = {
            "installed": installed,
            "found": found,
            "total": len(spec["skills"]),
            "missing": missing[:5],   # cap the list
            **extras,
        }
    return out


def resolve_stage_label(stage_key: str) -> str:
    """Return the actual installed skill/command for a stage, or fallback."""
    framework = STAGE_TO_FRAMEWORK.get(stage_key)
    if not framework:
        # Built-in stages (delegate / mmas / qguard) have no framework owner.
        return _FALLBACK_LABELS[stage_key]
    installed_skills = detect_integrations().get(framework, {}).get("installed", False)
    skill_name = STAGE_TO_SKILL.get(stage_key, stage_key)
    if installed_skills:
        return f"{framework}:{skill_name}"
    return _FALLBACK_LABELS[stage_key]


# Static fallback labels (used when the owning framework isn't installed).
_FALLBACK_LABELS = {
    "think":        "plan-mode",
    "research":     "learn (research)",
    "systematic":   "debug-issue",
    "unslop":       "unslop audit (UI gate)",
    "writing":      "brainstorming",
    "autoresearch": "autoresearch loop",
    "delegate":     "delegate-team (→ mini-coder-max)",
    "mmas":         "apeiron-team (MMAS)",
    "check":        "review-delta",
    "qguard":       "quality-guard",
}


def install_hint(framework: str) -> str:
    """Return a one-line install hint for a missing companion framework."""
    hints = {
        "superpowers": (
            "Run: ./delegate-team/install.sh --superpowers  "
            "(or: git clone --depth 1 https://github.com/obra/superpowers /tmp/sp && "
            "cp -r /tmp/sp/skills/* ~/.claude/skills/)"
        ),
        "waza": (
            "Run: npx -y skills add tw93/Waza -a claude-code -g -y"
        ),
        "unslop-preflight": (
            "Run: git clone --depth 1 https://github.com/imMamdouhaboammar/unslop-preflight /tmp/unslop && "
            "npm install -g /tmp/unslop && "
            "cp -r /tmp/unslop/SKILL.md ~/.claude/skills/unslop/SKILL.md"
        ),
        "autoresearch": (
            "Run: git clone --depth 1 https://github.com/uditgoenka/autoresearch /tmp/autoresearch && "
            "cp -r /tmp/autoresearch/skills/autoresearch ~/.claude/skills/ && "
            "cp /tmp/autoresearch/commands/*.md ~/.claude/commands/"
        ),
    }
    return hints.get(framework, "(no install hint available)")


def render_integrations_status() -> str:
    """Format the Integrations status block for the orchestrator output."""
    ints = detect_integrations()
    lines = ["# Integrations status:"]
    for name in ("superpowers", "waza", "unslop-preflight", "autoresearch"):
        info = ints.get(name, {})
        if info.get("installed"):
            extras = []
            if "slash_commands" in info:
                extras.append(f"{info['slash_commands']} slash commands")
            if name == "unslop-preflight" and info.get("unslop_bin"):
                extras.append("`unslop` bin on PATH")
            extra_str = ("  ·  " + ", ".join(extras)) if extras else ""
            lines.append(
                f"  ✅ {name:<22}  {info['found']}/{info['total']} skills on disk{extra_str}"
            )
        else:
            lines.append(
                f"  ❌ {name:<22}  {info['found']}/{info['total']} skills on disk"
            )
            lines.append(f"     └─ install: {install_hint(name)}")
    return "\n".join(lines)


def detect_verdict_key(scores: Dict[str, int]) -> str:
    """Return the verdict-key used for backend lookup."""
    if scores.get("memory", 0) >= 4:
        return "MEMORY"
    if scores.get("research", 0) >= 4:
        return "RESEARCH"
    # Build/publish — needs explicit build path detection
    if any_pat(BUILD_PATS, normalize("")) and scores.get("unslop", 0) == 0:
        return "BUILD"
    if scores.get("autoresearch", 0) >= 3:
        return "PERFORMANCE"
    if (
        scores.get("autoresearch", 0) >= 2
        and scores.get("unslop", 0) < 3
        and scores.get("systematic", 0) == 0
        and scores.get("delegate", 0) == 0
    ):
        return "PERFORMANCE"
    if scores.get("unslop", 0) >= 3:
        return "UI"
    if scores.get("mmas", 0) >= 3:
        return "MULTI-AGENT"
    if scores.get("systematic", 0) >= 3:
        return "BUG"
    if scores.get("delegate", 0) >= 2:
        return "FEATURE"
    return "FEATURE"  # default chain


def _delegate_dispatch(task: str, agent: str) -> str:
    """Build the `dt delegate <agent>` command for an explicit delegate verdict.

    The agent→skill mapping is resolved from the neural mesh (neural-mesh.json),
    the single source of truth shared with the dt CLI. If the mesh is absent,
    fall back to the inline alias table so dispatch never breaks.
    """
    quoted = '"' + task.replace('"', '\\"') + '"'
    mesh = load_mesh()
    if mesh:
        target = mesh.delegate_target_for(agent)
        if target:
            # e.g. "grok-delegate" -> agent "grok"
            agent = target.replace("-delegate", "")
    # Fallback alias resolution (keeps the behaviour without the mesh file).
    agent = DELEGATE_AGENT_ALIASES.get(agent, agent)
    if agent.endswith("-delegate"):
        agent = agent[: -len("-delegate")]
    return (
        f"# DELEGATE path — the orchestrator stays the reviewer; the relay\n"
        f"# writes the brief, the CLI agent implements, you land the diff.\n"
        f"# Dispatch:  dt delegate {agent} --brief /tmp/apeiron-brief.txt\n"
        f"# Task:      {quoted}\n"
        f"# Inspect:   dt mesh --trace   (see the ROUTES_TO synapse fire)"
    )


def dispatch_for_verdict(n: str, scores: Dict[str, int], team: bool = False) -> str:
    """Return the suggested `dt run` command for the verdict.

    Everything routes through `dt` (the delegate-team CLI). The orchestrator
    only picks the right `--backend` flag (or `dt delegate <agent>` for an
    explicit DELEGATE verdict, resolved from the neural mesh). Users can
    override the backend at exec time.
    """
    if not scores:
        return ""

    # Re-derive verdict key
    n_norm = normalize(n)
    if scores.get("memory", 0) >= 4:
        key = "MEMORY"
    elif scores.get("research", 0) >= 4:
        key = "RESEARCH"
    elif any_pat(BUILD_PATS, n_norm) and scores.get("unslop", 0) == 0:
        key = "BUILD"
    elif scores.get("autoresearch", 0) >= 3:
        key = "PERFORMANCE"
    elif (
        scores.get("autoresearch", 0) >= 2
        and scores.get("unslop", 0) < 3
        and scores.get("systematic", 0) == 0
        and scores.get("delegate", 0) == 0
    ):
        key = "PERFORMANCE"
    elif scores.get("unslop", 0) >= 3:
        key = "UI"
    elif scores.get("mmas", 0) >= 3:
        key = "MULTI-AGENT"
    elif scores.get("systematic", 0) >= 3:
        key = "BUG"
    else:
        key = "FEATURE"

    quoted = '"' + n.replace('"', '\\"') + '"'

    if key == "RESEARCH":
        return (
            "# No dispatch — RESEARCH path runs the `learn` skill instead.\n"
            "# To go deeper: `dt route --explain \"<task>\"`"
        )
    if key == "MEMORY":
        return (
            "# No dispatch — MEMORY path invokes agent-kernel (persistent memory).\n"
            "# The agent reads from ~/delegate-team/agent-kernel/MEMORY.md,\n"
            "# appends the new fact, and acknowledges the recall.\n"
            "# Inspect: `dt kernel` to see the memory home + episode/rule counts."
        )
    if getattr(score_task, "delegate_to", None):
        # Explicit delegate-to-<agent> (delegate-skills component).
        # The orchestrator now emits a real `dt delegate <agent>` command,
        # resolved from the neural mesh's ROUTES_TO synapses.
        return _delegate_dispatch(n, score_task.delegate_to)
    if key == "MULTI-AGENT" or team:
        return (
            f"# MMAS path: dt run --team {quoted}\n"
            f"# Override:  dt run {quoted} (auto-pick backend)\n"
            f"# Inspect:   dt route --explain {quoted}"
        )

    backend = PATH_BACKEND.get(key, "minimax")
    others = ", ".join(b for b in ALL_BACKENDS if b != backend)
    return (
        f"# Recommended: dt run --backend={backend} {quoted}\n"
        f"# Auto-pick:   dt run {quoted}   (no --backend, lets the router decide)\n"
        f"# Other backends: {others}\n"
        f"# Bypass router:  {backend} {quoted}  (direct, no dt supervision)\n"
        f"# Inspect:        dt route --explain {quoted}"
    )


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

# (input, expected_verdict_substring, comment)
SELFTEST_CASES: List[Tuple[str, str, str]] = [
    # ----- Expected routing (v2.1.1 behavior we want to preserve) -----
    ("Make API p95 < 200ms",                "PERFORMANCE",   "explicit perf metric"),
    ("Reduce latency by 50%",               "PERFORMANCE",   "reduce by %"),
    ("Build a landing page for the new product", "UI",       "UI page"),
    ("Add a modal for the checkout flow",   "UI",            "modal + checkout flow"),
    ("Add login page",                      "UI",            "page name"),
    ("Add a new component for the dashboard","UI",           "component + dashboard"),
    ("fix the broken login flow on Safari", "BUG",           "bug fix"),
    ("the API returns undefined sometimes","BUG",           "undefined"),
    ("fix the failing test suite",          "BUG",           "failing"),
    ("Build a CLI to convert CSV to JSON",  "FEATURE",       "CLI but feature"),
    ("build an agentic system",             "FEATURE",       "agentic but no UI"),
    ("research the latest in vector databases", "RESEARCH",  "research"),
    ("remember this: never add SQLite fallback to Supabase projects",
                                            "MEMORY",       "remember this:"),
    ("what did we do about the stripe webhook last time",
                                            "MEMORY",       "what did we do (last time)"),
    ("rename getCurrentUser to getActiveUser", "TRIVIAL",    "rename"),
    ("bump version",                        "TRIVIAL",       "bump version"),
    # ----- v2.1.1 false-positive guards (these were the bugs) -----
    ("ship it",                             "BUILD",         "ship alone (was perf)"),
    ("ship a new feature",                  "BUILD",         "ship + feature (was perf)"),
    ("ship v2",                             "BUILD",         "ship + version"),
    ("ship it now",                         "BUILD",         "ship it now"),
    ("shop items faster",                   "PERFORMANCE",   "shop+items + faster (was perf via 'p ')"),
    ("tap to open",                         "TRIVIAL",       "tap+open (no verb, vague)"),
    ("wrap up the PR",                      "TRIVIAL",       "wrap+up (no verb, vague)"),
    ("leap forward",                        "TRIVIAL",       "leap+forward (no verb, vague)"),
    ("bump up the version",                 "TRIVIAL",       "bump+up (no verb, vague)"),
    ("whip up something",                   "TRIVIAL",       "whip+up (no verb, vague)"),
    ("squad up atlas forge coder",          "MULTI-AGENT",   "squad up (was perf)"),
    ("top up the balance",                  "TRIVIAL",       "top+up (no verb, vague)"),
    # ----- MMAS expansions -----
    ("spawn atlas and forge as a team",     "MULTI-AGENT",   "spawn X+Y+team"),
    ("use a team of 3 agents",              "MULTI-AGENT",   "team of N agents"),
    ("use a team",                          "MULTI-AGENT",   "use a team"),
    ("5 specialists working on it",         "MULTI-AGENT",   "N specialists"),
    ("team of agents",                      "MULTI-AGENT",   "team of agents"),
    ("multi-agent system",                  "MULTI-AGENT",   "multi-agent"),
    ("parallel agents",                     "MULTI-AGENT",   "parallel agents"),
    # ----- Arabic -----
    ("أصلح الـ login المعطوب",              "BUG",           "Arabic fix"),
    ("ابني landing page",                   "UI",            "Arabic build + UI"),
    ("ابحث في vector databases",            "RESEARCH",      "Arabic research"),
    ("خطط authentication flow",             "FEATURE",       "Arabic plan"),
    # ----- Build/publish -----
    ("publish v2.1 to github",              "BUILD",         "publish + github"),
    ("deploy to prod",                      "BUILD",         "deploy"),
    ("release v2.0",                        "BUILD",         "release"),
    # ----- More edge cases -----
    ("test",                                "TRIVIAL",       "single word test"),
    ("help",                                "TRIVIAL",       "single word help"),
    ("",                                    "TRIVIAL",       "empty input"),
    ("create a new API endpoint for users", "FEATURE",       "api + endpoint (backend, not UI)"),
    ("debug why the API is slow",           "BUG",           "debug + slow — bug wins"),
    ("optimize the dashboard page",         "UI",            "optimize + dashboard (UI wins)"),
    ("Make API p95 latency < 200ms",        "PERFORMANCE",   "p95 + latency"),
    # ----- Explicit delegate-to-<agent> (delegate-skills component) -----
    ("delegate this to grok",                "DELEGATE",      "delegate to grok → grok-delegate skill"),
    ("have codex implement the parser",      "DELEGATE",      "have codex do X → codex-delegate skill"),
    ("run it through opencode",              "DELEGATE",      "run through opencode → opencode-delegate skill"),
    ("use kimi delegate the refactor",       "DELEGATE",      "use kimi delegate → kimi-delegate skill"),
]


def run_selftest(verbose: bool = False) -> int:
    total = len(SELFTEST_CASES)
    print(f"# /apeiron-ship self-test — {total} cases (orchestrate.py v{VERSION})\n")
    passed = 0
    failed: List[Tuple[str, str, str, str]] = []
    for task, expected, comment in SELFTEST_CASES:
        scores = score_task(task)
        n = normalize(task)
        verdict = pick_verdict(n, scores) if scores else "TRIVIAL"
        ok = expected in verdict
        if ok:
            passed += 1
            mark = "PASS"
        else:
            mark = "FAIL"
            failed.append((task, expected, verdict, comment))
        if verbose or not ok:
            disp_task = task if task else "<empty>"
            print(f"  [{mark}] {comment!r:48} task={disp_task!r:46} → {verdict}")
    print(f"\n# Result: {passed}/{total} passed")
    if failed:
        print(f"\n# Failed:")
        for task, expected, verdict, comment in failed:
            print(f"  - {comment!r}: {task!r} → {verdict!r} (wanted {expected!r})")
        return 1
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def usage() -> None:
    print('Usage: orchestrate.py "<task>"  (or --selftest)', file=sys.stderr)


def main(argv: List[str]) -> int:
    if len(argv) >= 2 and argv[1] == "--selftest":
        return run_selftest(verbose=True)

    # Parse flags
    dispatch = False
    direct = False
    team = False
    prewarm = False
    as_json = False
    no_trace_file = False
    check_kernel = False
    brief_path: Optional[str] = None
    args: List[str] = []
    i = 1
    while i < len(argv):
        a = argv[i]
        if a in ("--dispatch", "-x"):
            dispatch = True
        elif a == "--direct":
            direct = True
        elif a == "--team":
            team = True
        elif a == "--prewarm":
            prewarm = True
        elif a == "--json":
            as_json = True
        elif a == "--no-trace-file":
            no_trace_file = True
        elif a == "--check-kernel":
            check_kernel = True
        elif a == "--brief" and i + 1 < len(argv):
            brief_path = argv[i + 1]
            i += 1
        elif a in ("--help", "-h"):
            usage()
            return 0
        else:
            args.append(a)
        i += 1

    if not args or not args[0].strip():
        usage()
        return 64

    task = args[0]
    scores = score_task(task)
    n = normalize(task)

    # If --team is set, treat as MMAS path (overrides routing)
    if team and scores:
        scores = {**scores, "mmas": max(scores.get("mmas", 0), 4)}

    # --json: emit ONLY a JSON trace to stdout (no comments, no formatting).
    # This is the contract for the v26-smoke.test.ts routing tests.
    # Debug/decorative output goes to stderr (suppressed when stderr is closed).
    if as_json:
        import json
        import time
        trace = build_json_trace(task, scores, check_kernel=check_kernel)
        # Write only the JSON to stdout. Any other output is forbidden here.
        sys.stdout.write(json.dumps(trace, indent=2, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return 0

    # --prewarm: emit the JSON manifest for the Apeiron session to consume.
    # The Apeiron session reads this, calls the `skill` tool for each path,
    # and then proceeds with the chain (or invokes --dispatch).
    if prewarm:
        manifest = build_prewarm_manifest(task, scores)
        import json
        sys.stdout.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return 0

    print(format_output(task, scores, team=team))

    if dispatch and scores:
        # --direct: bypass dt and call the backend directly (escape hatch)
        if direct:
            backend = recommended_backend(n, scores)
            if backend and which(backend):
                quoted = '"' + task.replace('"', '\\"') + '"'
                print()
                print(f"# Executing (direct): {backend} {quoted}")
                os.execvp(backend, [backend, task])
            elif backend:
                print(f"\n# WARNING: backend '{backend}' not found in PATH. Install it or pick another.")
                return 1
            else:
                print("\n# No backend to call directly for this verdict.")
                return 1
            return 0

        # Default: route through `dt` (the delegate-team supersystem).
        if not which("dt"):
            print("\n# ERROR: `dt` (delegate-team CLI) not found in PATH.")
            print("# Add ~/delegate-team/bin to your PATH, or run with --direct.")
            return 127

        quoted = '"' + task.replace('"', '\\"') + '"'
        n_norm = normalize(n)
        if scores.get("research", 0) >= 4:
            print("\n# RESEARCH path: no dt dispatch (use `learn` skill instead).")
            return 0

        # Generate a brief file with the task + the prewarm manifest so the
        # backend agent (codex / claude / etc.) sees the same context the
        # Apeiron session has.
        written_brief: Optional[str] = None
        if brief_path is None:
            import tempfile
            fd, written_brief = tempfile.mkstemp(prefix="apeiron-brief-", suffix=".md")
            os.close(fd)
        else:
            written_brief = brief_path
        write_brief(written_brief, task, scores, team=team)

        if scores.get("mmas", 0) >= 3 or team:
            print()
            print(f"# Brief:    {written_brief}")
            print(f"# Executing: dt run --team --brief {written_brief} {quoted}")
            os.execvp("dt", ["dt", "run", "--team", "--brief", written_brief, task])
        else:
            backend = recommended_backend(n, scores) or "minimax"
            print()
            print(f"# Brief:    {written_brief}")
            print(f"# Executing: dt run --backend={backend} --brief {written_brief} {quoted}")
            os.execvp("dt", ["dt", "run", "--backend", backend, "--brief", written_brief, task])

    return 0


def write_brief(path: str, task: str, scores: Dict[str, int], team: bool = False) -> None:
    """Write a structured brief file that backend agents (codex/claude/...)
    can read for full context: the task, the routing decision, the chain
    plan, and the prewarm manifest of skills to consult."""
    manifest = build_prewarm_manifest(task, scores)
    n = normalize(task)
    verdict = pick_verdict(n, scores) if scores else "TRIVIAL"

    lines: List[str] = []
    lines.append("# apeiron-ship brief")
    lines.append("")
    lines.append(f"**Task:** {task}")
    lines.append("")
    lines.append(f"**Verdict:** {verdict}")
    lines.append("")
    lines.append("## Routing")
    pairs = [
        (label, scores.get(key, 0))
        for key, label in _resolved_stage_labels()
        if scores.get(key, 0) > 0
    ]
    pairs.sort(key=lambda x: -x[1])
    lines.append("| Stage | Score |")
    lines.append("|-------|-------|")
    for label, score in pairs:
        lines.append(f"| {label} | {score} |")
    lines.append("")
    lines.append("## Pre-warm: skills to read before starting")
    lines.append("")
    for stage in manifest["stages"]:
        if stage.get("path"):
            lines.append(f"- **{stage['framework']}:{stage['skill']}** — `{stage['path']}`")
        else:
            lines.append(f"- ~~{stage['framework']}:{stage['skill']}~~ (not installed — use the fallback approach)")
    for companion in manifest.get("companions", []):
        lines.append(f"- **{companion['skill']}** — `{companion['path']}` ({companion.get('why', '')})")
    auto = manifest.get("auto_discovered", [])
    if auto:
        lines.append("")
        lines.append("## Auto-discovered from ~/.claude/skills/ (mandatory pre-search)")
        lines.append("")
        lines.append("These were matched by keyword overlap with the task. The orchestrator "
                    "doesn't claim they're authoritative — but if any of them look relevant to "
                    "the chain, read them. They were surfaced because something in their "
                    "frontmatter or name overlaps with the task.")
        lines.append("")
        for a in auto:
            if "error" in a:
                lines.append(f"- ⚠️ {a['error']}")
                continue
            matched = ",".join(a.get("matched_keywords", [])[:6])
            source = a.get("source", "?")
            lines.append(f"- **{a['name']}** (score={a['score']}, source={source}, matched: {matched})")
            lines.append(f"  - `{a['path']}`")
            if a.get("description"):
                d = a["description"]
                if len(d) > 160:
                    d = d[:157] + "..."
                lines.append(f"  - {d}")

    # Similar clusters — same role, different names. Apeiron picks one.
    clusters = manifest.get("similar_clusters", [])
    if clusters:
        lines.append("")
        lines.append("## Similar clusters (Apeiron: pick one, don't load all)")
        lines.append("")
        lines.append("These are groups of skills that look alike (high token overlap "
                    "on name + description). They likely serve the same role. "
                    "Pick **one** of each cluster — loading all of them is bloat.")
        lines.append("")
        for c in clusters:
            lines.append(f"- **cluster** (similarity={c['score']}): {', '.join(c['names'])}")
            for path, source in zip(c["paths"], c["sources"]):
                lines.append(f"  - `{path}`  (source={source})")

    # Content duplicates — exact body match across folders
    dups = manifest.get("content_duplicates", [])
    if dups:
        lines.append("")
        lines.append("## Content duplicates (cross-folder)")
        lines.append("")
        lines.append("These skills have IDENTICAL SKILL.md bodies in different folders. "
                    "No need to load more than one — pick the highest-priority source "
                    "(apeiron > agents > claude).")
        lines.append("")
        for d in dups:
            lines.append(f"- **{', '.join(d['names'])}** (hash {d['hash'][:8]})")
            for p in d["paths"]:
                lines.append(f"  - `{p}`")
    lines.append("")
    lines.append("## Dispatch")
    lines.append("")
    lines.append("```")
    lines.append(manifest.get("dispatch", "(no dispatch — handle as the chain suggests)"))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- This brief was generated by `/apeiron-ship --dispatch`.")
    lines.append("- Treat each pre-warmed skill as authoritative guidance for that stage.")
    lines.append("- The Apeiron session that spawned this dispatch has the same skills loaded — the chain's evidence is consistent on both sides.")
    lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def recommended_backend(n: str, scores: Dict[str, int]) -> Optional[str]:
    """Return the recommended backend for the verdict, matching pick_verdict."""
    key = detect_verdict_key_for(n, scores)
    if key in ("RESEARCH", "MULTI-AGENT"):
        return None
    return PATH_BACKEND.get(key, "minimax")


def detect_verdict_key_for(n: str, scores: Dict[str, int]) -> str:
    """Single source of truth for the verdict key (mirrors pick_verdict logic)."""
    if scores.get("research", 0) >= 4:
        return "RESEARCH"
    n_norm = normalize(n)
    if any_pat(BUILD_PATS, n_norm) and scores.get("unslop", 0) == 0:
        return "BUILD"
    if scores.get("autoresearch", 0) >= 3:
        return "PERFORMANCE"
    if (
        scores.get("autoresearch", 0) >= 2
        and scores.get("unslop", 0) < 3
        and scores.get("systematic", 0) == 0
        and scores.get("delegate", 0) == 0
    ):
        return "PERFORMANCE"
    if scores.get("unslop", 0) >= 3:
        return "UI"
    if scores.get("mmas", 0) >= 3:
        return "MULTI-AGENT"
    if scores.get("systematic", 0) >= 3:
        return "BUG"
    if scores.get("delegate", 0) >= 2:
        return "FEATURE"
    return "FEATURE"


def which(cmd: str) -> bool:
    """Return True if `cmd` is on PATH."""
    import shutil
    return shutil.which(cmd) is not None


if __name__ == "__main__":
    sys.exit(main(sys.argv))
