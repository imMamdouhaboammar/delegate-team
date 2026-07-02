#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import readline from 'node:readline';

const VERSION = '0.0.5';
const MARKER_START = '<!-- agent-kernel:start -->';
const MARKER_END = '<!-- agent-kernel:end -->';
const DEFAULT_AGENTS = ['claude', 'codex', 'cursor', 'antigravity', 'gemini'];
const DEFAULT_DENY_COMMANDS = [
  { id: 'dangerous-rm', pattern: '(^|\\s)(sudo\\s+)?rm\\s+-rf\\s+(/|~|\\$HOME)(\\s|$)', message: 'Blocked: dangerous rm -rf target.' },
  { id: 'curl-pipe-shell', pattern: '(curl|wget)[^|;&]*(\\||>)[^;&]*(sh|bash|zsh)', message: 'Blocked: piping remote content into a shell.' },
  { id: 'chmod-777', pattern: 'chmod\\s+-R\\s+777', message: 'Blocked: chmod -R 777 is not allowed.' },
  { id: 'force-push-main', pattern: 'git\\s+push[^\n]*(--force|-f)[^\n]*(main|master)', message: 'Blocked: force push to main/master.' },
  { id: 'delete-git', pattern: 'rm\\s+-rf\\s+\\.git', message: 'Blocked: deleting .git is not allowed.' }
];
const DEFAULT_SECRET_PATTERNS = [
  `OPENAI_API_KEY\\s*=\\s*["'][^"']+["']`,
  `ANTHROPIC_API_KEY\\s*=\\s*["'][^"']+["']`,
  `SUPABASE_SERVICE_ROLE_KEY\\s*=\\s*["'][^"']+["']`,
  'AIza[0-9A-Za-z\\-_]{35}',
  'sk-[A-Za-z0-9]{20,}',
  'ghp_[A-Za-z0-9]{20,}'
];
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', 'coverage', '.agent-kernel']);
const EPISODIC_EXCLUSION_MARKER = '<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>';
const EPISODE_TEXT_LIMIT = 120000;

function homeDir() {
  return process.env.AGENT_KERNEL_HOME || path.join(os.homedir(), '.agent-kernel');
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readText(p, fallback = '') {
  try { return fs.readFileSync(p, 'utf8'); } catch { return fallback; }
}

function writeText(p, text) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, text, 'utf8');
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, value) {
  writeText(p, JSON.stringify(value, null, 2) + '\n');
}

function id(prefix = 'item') {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const short = crypto.randomBytes(3).toString('hex');
  return `${prefix}_${stamp}_${short}`;
}

function logLine(kind, value) {
  const p = path.join(homeDir(), 'logs', `${kind}.jsonl`);
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, JSON.stringify({ at: nowIso(), ...value }) + '\n');
}

function print(msg = '') {
  process.stdout.write(String(msg) + '\n');
}

function error(msg) {
  process.stderr.write(String(msg) + '\n');
}

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const raw = a.slice(2);
      const eq = raw.indexOf('=');
      if (eq >= 0) {
        out[raw.slice(0, eq)] = raw.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) { out[raw] = next; i++; }
        else out[raw] = true;
      }
    } else if (a.startsWith('-') && a.length > 1) {
      out[a.slice(1)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function kernelPaths() {
  const root = homeDir();
  return {
    root,
    source: path.join(root, 'source'),
    dist: path.join(root, 'dist'),
    inbox: path.join(root, 'inbox'),
    pending: path.join(root, 'inbox', 'pending'),
    approved: path.join(root, 'inbox', 'approved'),
    rejected: path.join(root, 'inbox', 'rejected'),
    skills: path.join(root, 'skills'),
    hooks: path.join(root, 'hooks'),
    logs: path.join(root, 'logs'),
    config: path.join(root, 'config.json'),
    memoriesDir: path.join(root, 'source', 'memories'),
    schemasDir: path.join(root, 'source', 'schemas'),
    policiesDir: path.join(root, 'source', 'policies'),
    rules: path.join(root, 'source', 'memories', 'rules.json'),
    preferences: path.join(root, 'source', 'memories', 'preferences.json'),
    workflows: path.join(root, 'source', 'memories', 'workflows.json'),
    projectNotes: path.join(root, 'source', 'memories', 'project-notes.json'),
    skillsJson: path.join(root, 'source', 'memories', 'skills.json'),
    policies: path.join(root, 'source', 'policies', 'policies.json'),
    memorySchema: path.join(root, 'source', 'schemas', 'memory.schema.json'),
    proposalSchema: path.join(root, 'source', 'schemas', 'proposal.schema.json'),
    policySchema: path.join(root, 'source', 'schemas', 'policy.schema.json'),
    episodeSchema: path.join(root, 'source', 'schemas', 'episode.schema.json'),
    episodesDir: path.join(root, 'episodes'),
    episodeArchive: path.join(root, 'episodes', 'archive'),
    episodeIndex: path.join(root, 'episodes', 'index.json'),
    episodeSources: path.join(root, 'episodes', 'sources.json'),
    legacyRules: path.join(root, 'source', 'rules.json'),
    legacyMemories: path.join(root, 'source', 'memories.json'),
    legacySkillsJson: path.join(root, 'source', 'skills.json'),
    legacyPolicies: path.join(root, 'source', 'policies.json')
  };
}

function defaultConfig() {
  return {
    version: VERSION,
    createdAt: nowIso(),
    owner: os.userInfo().username,
    strictMode: true,
    syncTargets: {
      codex: true,
      claude: true,
      cursor: false,
      antigravity: false,
      gemini: true
    },
    memoryWritePolicy: {
      default: 'pending',
      autoApprove: [
        { type: 'project-note', level: 'note', maxChars: 280 }
      ],
      requireManualApproval: [
        { type: 'rule' },
        { level: 'critical' },
        { scope: 'global' }
      ]
    },
    packageManagerPreference: 'pnpm',
    episodicMemory: {
      enabled: true,
      exclusionMarker: EPISODIC_EXCLUSION_MARKER,
      captureTextLimit: EPISODE_TEXT_LIMIT,
      syncSources: ['claude', 'codex'],
      searchMode: 'text'
    },
    generatedBy: 'agent-kernel'
  };
}

function defaultRules() {
  return [
    {
      id: 'inspect-before-editing',
      type: 'rule',
      scope: 'global',
      level: 'critical',
      text: 'Inspect the repository structure, package manager, config files, and relevant source files before editing.',
      targets: ['all'],
      tags: ['workflow', 'safety'],
      status: 'approved',
      enforcement: { promptContext: true, finalChecklist: true },
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso()
    },
    {
      id: 'small-reviewable-patches',
      type: 'rule',
      scope: 'global',
      level: 'standard',
      text: 'Prefer small, reviewable patches. Do not perform large rewrites unless the user explicitly asks for them.',
      targets: ['all'],
      tags: ['workflow'],
      status: 'approved',
      enforcement: { promptContext: true, finalChecklist: true },
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso()
    },
    {
      id: 'no-secrets-in-code',
      type: 'policy',
      scope: 'global',
      level: 'critical',
      text: 'Never expose API keys, tokens, service-role keys, or private credentials in code, logs, UI, screenshots, generated docs, or commits.',
      targets: ['all'],
      tags: ['security', 'secrets'],
      status: 'approved',
      enforcement: { promptContext: true, postEditScan: true, preCommit: true, ci: true },
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso()
    },
    {
      id: 'prefer-pnpm-typescript-cli',
      type: 'policy',
      scope: 'global',
      level: 'critical',
      text: 'For TypeScript CLI projects, prefer pnpm, tsup, Vitest, Commander-style command structure, and version 0.0.1 unless the repository already has a different standard.',
      targets: ['all'],
      tags: ['typescript', 'cli', 'package-manager'],
      status: 'approved',
      enforcement: { promptContext: true, preToolUse: true, preCommit: true },
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso()
    },
    {
      id: 'no-sqlite-fallback-supabase',
      type: 'policy',
      scope: 'global',
      level: 'critical',
      text: 'In production Supabase apps, do not add local SQLite fallbacks, fake persistence, or dummy database layers unless the user explicitly asks for a local-only prototype.',
      targets: ['all'],
      tags: ['supabase', 'database', 'production'],
      status: 'approved',
      enforcement: { promptContext: true, postEditScan: true, preCommit: true, ci: true },
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso()
    },
    {
      id: 'no-hardcoded-production-content',
      type: 'policy',
      scope: 'global',
      level: 'standard',
      text: 'Do not hardcode production content, users, creators, prices, or platform data when a database or CMS is available. Prefer database-backed configuration.',
      targets: ['all'],
      tags: ['architecture', 'database'],
      status: 'approved',
      enforcement: { promptContext: true, postEditScan: true },
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso()
    }
  ];
}

function defaultMemories() {
  return [
    {
      id: 'memory-model',
      type: 'workflow',
      scope: 'global',
      level: 'standard',
      text: 'Memory changes must follow Propose -> Review -> Approve -> Publish -> Sync. Agents may propose memories, but only Agent Kernel publishes them.',
      targets: ['all'],
      tags: ['memory', 'governance'],
      status: 'approved',
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 1
    }
  ];
}

function defaultPreferences() {
  return [
    {
      id: 'final-response-checklist',
      type: 'preference',
      scope: 'global',
      level: 'standard',
      text: 'Final responses after coding must include changed files, checks run, and unverified assumptions.',
      targets: ['all'],
      tags: ['reporting', 'workflow'],
      status: 'approved',
      source: { createdBy: 'agent-kernel', channel: 'init' },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 1
    }
  ];
}

function defaultProjectNotes() {
  return [];
}

function defaultSkills() {
  return [
    {
      id: 'typescript-cli',
      title: 'TypeScript CLI Standard',
      description: 'Use for CLI packages. Prefers pnpm, TypeScript, tsup, tests, small commands, clean package metadata, and safe publish checks.',
      path: 'skills/typescript-cli',
      triggers: ['cli', 'command line', 'terminal package', 'npm package', 'pnpm']
    },
    {
      id: 'supabase-safety',
      title: 'Supabase Safety',
      description: 'Use for Supabase projects. Avoid local DB fallbacks, protect service-role keys, require migrations, and verify RLS assumptions.',
      path: 'skills/supabase-safety',
      triggers: ['supabase', 'rls', 'migration', 'database']
    },
    {
      id: 'agent-governance',
      title: 'Agent Governance',
      description: 'Use when creating or modifying agent rules, hooks, skills, memories, or policy enforcement.',
      path: 'skills/agent-governance',
      triggers: ['agent', 'rules', 'hooks', 'memory', 'governance', 'AGENTS.md']
    }
  ];
}

function defaultPolicies() {
  return {
    version: 1,
    denyCommands: DEFAULT_DENY_COMMANDS,
    denyWritePaths: ['.env', '.env.*', '**/secrets/**', '**/*service-account*.json', '.git/**', 'node_modules/**'],
    requireApprovalPaths: ['package.json', 'pnpm-lock.yaml', 'supabase/migrations/**', 'prisma/migrations/**', 'drizzle/**'],
    secretPatterns: DEFAULT_SECRET_PATTERNS,
    forbiddenDependencyPatterns: [
      { whenFileExists: 'pnpm-lock.yaml', commandPattern: '(^|\\s)(npm\\s+install|npm\\s+i|yarn\\s+add)(\\s|$)', message: 'This repository appears to use pnpm. Use pnpm unless explicitly approved.' }
    ],
    forbiddenContentPatterns: [
      { id: 'sqlite-fallback', files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'], whenProjectContains: ['@supabase/supabase-js', 'supabase'], pattern: '(better-sqlite3|sqlite3|fallback database|local sqlite|SQLite fallback)', message: 'Forbidden SQLite fallback pattern in a Supabase project.' },
      { id: 'hardcoded-production-data', files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], pattern: '(const|let|var)\\s+(creators|users|products|prices|plans)\\s*=\\s*\\[', message: 'Possible hardcoded production data array. Use DB/CMS unless this is fixture/test data.' }
    ]
  };
}


function defaultEpisodeSources() {
  return [
    { id: 'claude-projects', agent: 'claude', path: path.join(os.homedir(), '.claude', 'projects'), glob: '**/*.jsonl' },
    { id: 'claude-transcripts', agent: 'claude', path: path.join(os.homedir(), '.claude', 'transcripts'), glob: '**/*.jsonl' },
    { id: 'codex-sessions', agent: 'codex', path: path.join(os.homedir(), '.codex', 'sessions'), glob: '**/*.jsonl' }
  ];
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function safeReadMaybe(p, limit = EPISODE_TEXT_LIMIT) {
  try {
    const stat = fs.statSync(p);
    const fd = fs.openSync(p, 'r');
    const len = Math.min(stat.size, limit);
    const buffer = Buffer.alloc(len);
    fs.readSync(fd, buffer, 0, len, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch {
    return '';
  }
}

function recursiveStrings(value, out = [], depth = 0) {
  if (depth > 8 || out.join('\n').length > EPISODE_TEXT_LIMIT) return out;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && trimmed.length > 1) out.push(trimmed);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) recursiveStrings(item, out, depth + 1);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['id', 'uuid', 'timestamp', 'created_at', 'createdAt', 'session_id', 'conversation_id'].includes(key)) continue;
      recursiveStrings(item, out, depth + 1);
    }
  }
  return out;
}

function parseJsonlConversation(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const chunks = [];
  let messages = 0;
  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const role = obj.role || obj.type || obj.author?.role || obj.message?.role || obj.event || 'entry';
    const strings = recursiveStrings(obj).join(' ').replace(/\s+/g, ' ').trim();
    if (!strings) continue;
    chunks.push(`${role}: ${strings}`);
    messages += 1;
    if (chunks.join('\n').length > EPISODE_TEXT_LIMIT) break;
  }
  return { text: chunks.join('\n').slice(0, EPISODE_TEXT_LIMIT), messages };
}

function detectProjectFromPath(filePath) {
  const parts = filePath.split(path.sep).filter(Boolean);
  const idx = parts.lastIndexOf('projects');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].replace(/^-/, '').replace(/-/g, '/');
  const codex = parts.lastIndexOf('sessions');
  if (codex >= 0 && parts[codex + 1]) return parts[codex + 1];
  return '';
}

function titleFromText(text, fallback = 'Conversation episode') {
  const first = text.split(/\r?\n/).map(x => x.trim()).find(Boolean) || fallback;
  return first.replace(/^(user|assistant|system|entry|message):\s*/i, '').slice(0, 90) || fallback;
}

function tokenize(text) {
  return String(text || '').toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
}

function episodeScore(episode, query) {
  const terms = tokenize(query).filter(t => t.length > 1);
  if (!terms.length) return 0;
  const hay = `${episode.id} ${episode.title} ${episode.summary || ''} ${episode.project || ''} ${episode.agent || ''} ${(episode.tags || []).join(' ')} ${episode.text || ''}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const count = (hay.match(re) || []).length;
    if (count) score += 1 + Math.min(count, 8);
  }
  return score;
}

function listJsonlFiles(root) {
  const out = [];
  if (!exists(root)) return out;
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
    }
  }
  walk(root);
  return out;
}

function readEpisodeIndex() {
  const p = kernelPaths();
  ensureJsonFirstLayout(p);
  const idx = readJson(p.episodeIndex, { version: 1, updatedAt: nowIso(), episodes: [] });
  if (!Array.isArray(idx.episodes)) idx.episodes = [];
  return idx;
}

function writeEpisodeIndex(idx) {
  const p = kernelPaths();
  idx.version = idx.version || 1;
  idx.updatedAt = nowIso();
  writeJson(p.episodeIndex, idx);
}

function episodePathFor(idValue) {
  return path.join(kernelPaths().episodeArchive, `${idValue}.json`);
}

function normalizeEpisode(input) {
  const text = String(input.text || '').slice(0, EPISODE_TEXT_LIMIT);
  const sourceHash = input.sourceHash || sha256(`${input.sourcePath || ''}\n${text}`);
  const episodeId = input.id || `episode_${sourceHash.slice(0, 16)}`;
  const createdAt = input.createdAt || nowIso();
  return {
    id: episodeId,
    type: 'episode',
    title: input.title || titleFromText(text),
    summary: input.summary || '',
    agent: input.agent || 'manual',
    project: input.project || '',
    sourcePath: input.sourcePath || '',
    sourceHash,
    sourceMtimeMs: input.sourceMtimeMs || null,
    messageCount: input.messageCount || null,
    text,
    tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    version: 1
  };
}

function saveEpisode(episode) {
  const p = kernelPaths();
  ensureDir(p.episodeArchive);
  const normalized = normalizeEpisode(episode);
  writeJson(episodePathFor(normalized.id), normalized);
  const idx = readEpisodeIndex();
  const compact = {
    id: normalized.id,
    title: normalized.title,
    summary: normalized.summary,
    agent: normalized.agent,
    project: normalized.project,
    sourcePath: normalized.sourcePath,
    sourceHash: normalized.sourceHash,
    sourceMtimeMs: normalized.sourceMtimeMs,
    tags: normalized.tags,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
  const existing = idx.episodes.findIndex(e => e.id === normalized.id || (compact.sourceHash && e.sourceHash === compact.sourceHash));
  if (existing >= 0) idx.episodes[existing] = compact;
  else idx.episodes.push(compact);
  writeEpisodeIndex(idx);
  logLine('episodes', { action: 'save', id: normalized.id, agent: normalized.agent, project: normalized.project });
  return normalized;
}

function loadEpisode(idOrPath) {
  if (!idOrPath) return null;
  const direct = path.isAbsolute(idOrPath) ? idOrPath : episodePathFor(idOrPath.endsWith('.json') ? idOrPath.slice(0, -5) : idOrPath);
  if (exists(direct)) return readJson(direct, null);
  const idx = readEpisodeIndex();
  const hit = idx.episodes.find(e => e.id === idOrPath || e.id.includes(idOrPath) || e.sourcePath === idOrPath);
  if (hit) return readJson(episodePathFor(hit.id), null);
  return null;
}

function readStdinTextIfAvailable() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function commandEpisode(flags = {}) {
  const action = flags._?.[0] || 'stats';
  const rest = flags._?.slice(1) || [];
  const p = kernelPaths();
  ensureJsonFirstLayout(p);
  if (action === 'add' || action === 'capture') {
    const text = flags.text || rest.join(' ') || readStdinTextIfAvailable();
    if (!text || !String(text).trim()) { error('Usage: agent-kernel episode add --title "..." --text "..."'); process.exitCode = 1; return; }
    if (String(text).includes(EPISODIC_EXCLUSION_MARKER)) { print('Episode skipped because exclusion marker was present.'); return; }
    const episode = saveEpisode({
      title: flags.title,
      summary: flags.summary,
      agent: flags.agent || flags.from || 'manual',
      project: flags.project || '',
      tags: flags.tags || '',
      text
    });
    print(`Saved episode: ${episode.id}`);
    return;
  }
  if (action === 'sync') {
    const sources = readJson(p.episodeSources, { sources: defaultEpisodeSources() }).sources || defaultEpisodeSources();
    const wantedAgent = flags.agent;
    const limit = flags.limit ? Number(flags.limit) : Infinity;
    const idx = readEpisodeIndex();
    const knownHashes = new Set(idx.episodes.map(e => e.sourceHash).filter(Boolean));
    let seen = 0, saved = 0, skipped = 0;
    for (const src of sources) {
      if (wantedAgent && src.agent !== wantedAgent) continue;
      for (const file of listJsonlFiles(src.path)) {
        if (seen >= limit) break;
        seen += 1;
        const raw = safeReadMaybe(file, EPISODE_TEXT_LIMIT);
        if (!raw || raw.includes(EPISODIC_EXCLUSION_MARKER)) { skipped += 1; continue; }
        const stat = fs.statSync(file);
        const hash = sha256(`${file}\n${stat.mtimeMs}\n${raw}`);
        if (knownHashes.has(hash)) { skipped += 1; continue; }
        const parsed = parseJsonlConversation(raw);
        if (!parsed.text.trim()) { skipped += 1; continue; }
        saveEpisode({
          title: titleFromText(parsed.text, path.basename(file)),
          summary: `Synced from ${src.agent} transcript with ${parsed.messages} parsed entries.`,
          agent: src.agent,
          project: detectProjectFromPath(file),
          sourcePath: file,
          sourceHash: hash,
          sourceMtimeMs: stat.mtimeMs,
          messageCount: parsed.messages,
          tags: [src.agent, 'synced'],
          text: parsed.text
        });
        knownHashes.add(hash);
        saved += 1;
      }
    }
    print(`Episode sync complete. scanned=${seen} saved=${saved} skipped=${skipped}`);
    return;
  }
  if (action === 'search') {
    const query = flags.query || rest.join(' ');
    if (!query) { error('Usage: agent-kernel episode search <query>'); process.exitCode = 1; return; }
    const limit = Math.max(1, Math.min(Number(flags.limit || 10), 50));
    const idx = readEpisodeIndex();
    const scored = [];
    for (const e of idx.episodes) {
      const full = loadEpisode(e.id) || e;
      const score = episodeScore(full, query);
      if (score > 0) scored.push({ score, episode: full });
    }
    scored.sort((a, b) => b.score - a.score || String(b.episode.updatedAt).localeCompare(String(a.episode.updatedAt)));
    const results = scored.slice(0, limit).map(x => x.episode);
    if (flags.json) { print(safeJson(results)); return; }
    if (!results.length) { print('No matching episodes.'); return; }
    for (const e of results) {
      const excerpt = String(e.text || '').replace(/\s+/g, ' ').slice(0, 260);
      print(`[${e.id}] ${e.title}\nagent=${e.agent || ''} project=${e.project || ''} updated=${e.updatedAt || e.createdAt}\n${excerpt}\n`);
    }
    return;
  }
  if (action === 'show' || action === 'read') {
    const wanted = flags.id || rest[0];
    const episode = loadEpisode(wanted);
    if (!episode) { error(`Episode not found: ${wanted}`); process.exitCode = 1; return; }
    if (flags.json) { print(safeJson(episode)); return; }
    print(`# ${episode.title}\n\nID: ${episode.id}\nAgent: ${episode.agent || ''}\nProject: ${episode.project || ''}\nCreated: ${episode.createdAt}\nSource: ${episode.sourcePath || 'manual'}\n\n${episode.summary || ''}\n\n---\n\n${episode.text}`);
    return;
  }
  if (action === 'stats') {
    const idx = readEpisodeIndex();
    const byAgent = {};
    const byProject = {};
    for (const e of idx.episodes) {
      byAgent[e.agent || 'unknown'] = (byAgent[e.agent || 'unknown'] || 0) + 1;
      byProject[e.project || 'unknown'] = (byProject[e.project || 'unknown'] || 0) + 1;
    }
    print(safeJson({ episodes: idx.episodes.length, archive: p.episodeArchive, byAgent, byProject, updatedAt: idx.updatedAt }));
    return;
  }
  if (action === 'reindex') {
    const episodes = listFiles(p.episodeArchive).filter(f => f.endsWith('.json')).map(f => readJson(f, null)).filter(Boolean);
    const idx = { version: 1, updatedAt: nowIso(), episodes: episodes.map(e => ({ id: e.id, title: e.title, summary: e.summary, agent: e.agent, project: e.project, sourcePath: e.sourcePath, sourceHash: e.sourceHash, sourceMtimeMs: e.sourceMtimeMs, tags: e.tags || [], createdAt: e.createdAt, updatedAt: e.updatedAt })) };
    writeEpisodeIndex(idx);
    print(`Reindexed ${idx.episodes.length} episodes.`);
    return;
  }
  error('Usage: agent-kernel episode <add|sync|search|show|stats|reindex>');
  process.exitCode = 1;
}


function memorySchema() {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://agent-kernel.local/schemas/memory.schema.json",
    "title": "Agent Kernel Memory",
    "type": "object",
    "additionalProperties": true,
    "required": ["id", "type", "scope", "level", "text", "status", "createdAt"],
    "properties": {
      "id": { "type": "string", "minLength": 3 },
      "type": { "enum": ["rule", "policy", "preference", "workflow", "project-note", "skill-trigger"] },
      "scope": { "enum": ["global", "project"] },
      "level": { "enum": ["critical", "standard", "note"] },
      "status": { "enum": ["approved", "pending", "rejected"] },
      "text": { "type": "string", "minLength": 8, "maxLength": 4000 },
      "targets": { "type": "array", "items": { "type": "string" } },
      "tags": { "type": "array", "items": { "type": "string" } },
      "enforcement": { "type": "object" },
      "source": { "type": "object" },
      "createdAt": { "type": "string" },
      "updatedAt": { "type": "string" },
      "version": { "type": "integer", "minimum": 1 }
    }
  };
}

function proposalSchema() {
  const s = memorySchema();
  return {
    ...s,
    "$id": "https://agent-kernel.local/schemas/proposal.schema.json",
    "title": "Agent Kernel Memory Proposal",
    "required": ["id", "type", "scope", "level", "text", "status", "reason", "source", "createdAt"],
    "properties": {
      ...s.properties,
      "reason": { "type": "string", "minLength": 3 },
      "status": { "enum": ["pending", "rejected", "approved"] }
    }
  };
}

function policySchema() {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://agent-kernel.local/schemas/policy.schema.json",
    "title": "Agent Kernel Policy Pack",
    "type": "object",
    "required": ["version", "denyCommands", "secretPatterns", "forbiddenContentPatterns"],
    "properties": {
      "version": { "type": "integer" },
      "denyCommands": { "type": "array" },
      "denyWritePaths": { "type": "array" },
      "requireApprovalPaths": { "type": "array" },
      "secretPatterns": { "type": "array" },
      "forbiddenDependencyPatterns": { "type": "array" },
      "forbiddenContentPatterns": { "type": "array" }
    }
  };
}

function episodeSchema() {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://agent-kernel.local/schemas/episode.schema.json",
    "title": "Agent Kernel Episodic Memory",
    "type": "object",
    "required": ["id", "type", "title", "text", "createdAt"],
    "properties": {
      "id": { "type": "string", "minLength": 3 },
      "type": { "enum": ["episode"] },
      "title": { "type": "string", "minLength": 3 },
      "summary": { "type": "string" },
      "agent": { "type": "string" },
      "project": { "type": "string" },
      "sourcePath": { "type": "string" },
      "sourceHash": { "type": "string" },
      "text": { "type": "string", "minLength": 1 },
      "tags": { "type": "array", "items": { "type": "string" } },
      "createdAt": { "type": "string" },
      "updatedAt": { "type": "string" }
    }
  };
}

function writeSchemas(paths) {
  writeJson(paths.memorySchema, memorySchema());
  writeJson(paths.proposalSchema, proposalSchema());
  writeJson(paths.policySchema, policySchema());
  writeJson(paths.episodeSchema, episodeSchema());
}

function withMemoryDefaults(item = {}, defaults = {}) {
  const t = item.type || defaults.type || 'rule';
  return {
    id: item.id || id(t),
    type: t,
    scope: item.scope || defaults.scope || 'global',
    level: item.level || defaults.level || 'standard',
    text: item.text || '',
    targets: Array.isArray(item.targets) ? item.targets : String(item.targets || 'all').split(',').map(s => s.trim()).filter(Boolean),
    tags: Array.isArray(item.tags) ? item.tags : String(item.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    status: item.status || defaults.status || 'approved',
    source: item.source || { createdBy: 'agent-kernel', channel: 'migration' },
    createdAt: item.createdAt || item.created_at || nowIso(),
    updatedAt: item.updatedAt || item.updated_at || nowIso(),
    version: item.version || 1,
    ...item
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function ensureJsonFirstLayout(paths) {
  [paths.memoriesDir, paths.schemasDir, paths.policiesDir, paths.episodesDir, paths.episodeArchive].forEach(ensureDir);
  writeSchemas(paths);
  if (!exists(paths.episodeIndex)) writeJson(paths.episodeIndex, { version: 1, updatedAt: nowIso(), episodes: [] });
  if (!exists(paths.episodeSources)) writeJson(paths.episodeSources, { version: 1, sources: defaultEpisodeSources() });
  if (!exists(paths.rules)) {
    const src = exists(paths.legacyRules) ? normalizeArray(readJson(paths.legacyRules, [])) : defaultRules();
    writeJson(paths.rules, src.map(x => withMemoryDefaults(x, { type: x.type || 'rule' })));
  }
  if (!exists(paths.preferences)) writeJson(paths.preferences, defaultPreferences());
  if (!exists(paths.workflows)) {
    const src = exists(paths.legacyMemories) ? normalizeArray(readJson(paths.legacyMemories, [])) : defaultMemories();
    writeJson(paths.workflows, src.map(x => withMemoryDefaults(x, { type: x.type || 'workflow' })));
  }
  if (!exists(paths.projectNotes)) writeJson(paths.projectNotes, defaultProjectNotes());
  if (!exists(paths.skillsJson)) {
    const src = exists(paths.legacySkillsJson) ? readJson(paths.legacySkillsJson, defaultSkills()) : defaultSkills();
    writeJson(paths.skillsJson, src);
  }
  if (!exists(paths.policies)) {
    const src = exists(paths.legacyPolicies) ? readJson(paths.legacyPolicies, defaultPolicies()) : defaultPolicies();
    writeJson(paths.policies, src);
  }
}

function initSkillFolders(paths) {
  const skills = defaultSkills();
  for (const s of skills) {
    const dir = path.join(paths.root, s.path);
    ensureDir(dir);
    const md = `# ${s.title}\n\n${s.description}\n\n## When to use\n\nUse this skill when the task mentions: ${s.triggers.join(', ')}.\n\n## Required behavior\n\n- Inspect the current repository before editing.\n- Keep changes small and reviewable.\n- Report checks run and unverified assumptions.\n- Follow Agent Kernel policies from ${path.join(paths.dist, 'AGENTS.md')}.\n`;
    if (!exists(path.join(dir, 'SKILL.md'))) writeText(path.join(dir, 'SKILL.md'), md);
  }
}

function commandInit(flags = {}) {
  const p = kernelPaths();
  [p.root, p.source, p.memoriesDir, p.schemasDir, p.policiesDir, p.episodesDir, p.episodeArchive, p.dist, p.pending, p.approved, p.rejected, p.skills, p.hooks, p.logs].forEach(ensureDir);
  if (!exists(p.config) || flags.force) writeJson(p.config, defaultConfig());
  if (flags.force) {
    writeJson(p.rules, defaultRules());
    writeJson(p.preferences, defaultPreferences());
    writeJson(p.workflows, defaultMemories());
    writeJson(p.projectNotes, defaultProjectNotes());
    writeJson(p.skillsJson, defaultSkills());
    writeJson(p.policies, defaultPolicies());
  }
  ensureJsonFirstLayout(p);
  initSkillFolders(p);
  commandCompile({ quiet: true });
  if (flags.sync) commandSync({ quiet: true });
  if (flags.enforce) commandEnforceInstall({ quiet: true });
  print(`Agent Kernel initialized at ${p.root}`);
  print('Next: agent-kernel doctor');
}

function loadApproved() {
  const p = kernelPaths();
  ensureJsonFirstLayout(p);
  const rules = readJson(p.rules, []).filter(x => x.status === 'approved');
  const preferences = readJson(p.preferences, []).filter(x => x.status === 'approved');
  const workflows = readJson(p.workflows, []).filter(x => x.status === 'approved');
  const projectNotes = readJson(p.projectNotes, []).filter(x => x.status === 'approved');
  const memories = [...preferences, ...workflows, ...projectNotes];
  const skills = readJson(p.skillsJson, []);
  const policies = readJson(p.policies, defaultPolicies());
  const config = readJson(p.config, defaultConfig());
  return { rules, preferences, workflows, projectNotes, memories, skills, policies, config, paths: p };
}

function groupRules(rules) {
  const critical = rules.filter(r => r.level === 'critical');
  const standard = rules.filter(r => r.level !== 'critical');
  return { critical, standard };
}

function bulletList(items, prefix = '- ') {
  if (!items.length) return '- None configured.';
  return items.map(x => `${prefix}${x.text}`).join('\n');
}

function renderAgentsMd(data) {
  const { rules, memories, skills, paths } = data;
  const { critical, standard } = groupRules(rules);
  return `${MARKER_START}\n# Agent Kernel Constitution\n\nGenerated by Agent Kernel ${VERSION}. Do not edit this file directly.\nSource of truth: \`${paths.source}\`\n\n## Operating model\n\nThis file is shared guidance for coding agents. Critical rules are also enforced by hooks, scanners, git hooks, or CI when installed.\n\n## Critical rules\n\n${bulletList(critical)}\n\n## Standard rules\n\n${bulletList(standard)}\n\n## Memory workflow\n\n${bulletList(memories.filter(m => ['workflow', 'preference'].includes(m.type)))}\n\n## Episodic recall protocol\n\nUse episodic memory when the user refers to past conversations, previous attempts, decisions, patterns, or phrases such as "like last time", "what did we decide", "the approach we tried", or "we discussed this before". Search first with:\n\n\`\`\`bash\nagent-kernel episode search "<query>"\n\`\`\`\n\nSensitive conversations containing ${EPISODIC_EXCLUSION_MARKER} must not be indexed.\n\n## Agent memory capture protocol\n\nWhen the user says "remember this", "save this", "add this as a rule", "خلي دي rule", "احفظ دي", "احفظها لباقي agents", or corrects the same behavior twice, do not edit generated files directly. Create a pending proposal using:\n\n\`\`\`bash\nagent-kernel propose --from <agent> --type rule --scope global --level standard --targets all --text "<exact rule>" --reason "<why this should be saved>"\n\`\`\`\n\nRules become shared only after approval and publish.\n\n## Available skills\n\n${skills.map(s => `- ${s.id}: ${s.description}`).join('\n') || '- None configured.'}\n\n## Final response checklist\n\n- Explain changed files.\n- State checks run.\n- State anything not verified.\n- Never hide policy violations or skipped checks.\n${MARKER_END}\n`;
}

function renderClaudeMd(data) {
  const agentsPath = path.join(data.paths.dist, 'AGENTS.md');
  return `${MARKER_START}\n# Claude Code Instructions\n\nRead and follow the shared Agent Kernel constitution.\n\n@${agentsPath}\n\n## Claude-specific protocol\n\n- Use Agent Kernel hooks when installed.\n- If a PreToolUse or PostToolUse hook blocks an action, stop and fix the violation.\n- If the user asks to save a rule, create a pending proposal with \`agent-kernel propose\`, not a direct edit to generated files.\n\n${MARKER_END}\n`;
}

function renderCursorRule(data) {
  return `---\ndescription: Agent Kernel shared rules and governance\nalwaysApply: true\n---\n\n# Agent Kernel Cursor Rule\n\nThis project is governed by Agent Kernel. Follow the generated constitution at:\n\n${path.join(data.paths.dist, 'AGENTS.md')}\n\n## Non-negotiables\n\n${bulletList(groupRules(data.rules).critical)}\n\nIf the user asks to remember a rule, create a pending proposal:\n\n\`agent-kernel propose --from cursor --type rule --scope global --level standard --targets all --text "..." --reason "..."\`\n`;
}

function renderAntigravityAgents(data) {
  return `${MARKER_START}\n# Antigravity Agent Instructions\n\nUse the Agent Kernel constitution as the source of truth.\n\n${path.join(data.paths.dist, 'AGENTS.md')}\n\n## Rules\n\n${bulletList(data.rules)}\n\n## Skills folder\n\n${data.paths.skills}\n\n${MARKER_END}\n`;
}

function renderGeminiMd(data) {
  return `${MARKER_START}\n# Gemini CLI Agent Kernel Instructions\n\nFollow the shared Agent Kernel constitution at:\n\n${path.join(data.paths.dist, 'AGENTS.md')}\n\nCritical rules:\n\n${bulletList(groupRules(data.rules).critical)}\n\n${MARKER_END}\n`;
}

function renderSkillsIndex(data) {
  return `# Agent Kernel Skills Index\n\nGenerated at ${nowIso()}\n\n${data.skills.map(s => `## ${s.id}\n\n${s.description}\n\nPath: \`${path.join(data.paths.root, s.path)}\`\n\nTriggers: ${s.triggers.join(', ')}\n`).join('\n')}`;
}

function compilePolicy(data) {
  const derived = structuredClone(data.policies || defaultPolicies());
  derived.rules = data.rules.map(r => ({ id: r.id, level: r.level, text: r.text, enforcement: r.enforcement || {} }));
  derived.compiledAt = nowIso();
  return derived;
}

function commandCompile(flags = {}) {
  const p = kernelPaths();
  if (!exists(p.config)) {
    [p.root, p.source, p.memoriesDir, p.schemasDir, p.policiesDir, p.episodesDir, p.episodeArchive, p.dist, p.pending, p.approved, p.rejected, p.skills, p.hooks, p.logs].forEach(ensureDir);
    writeJson(p.config, defaultConfig());
    ensureJsonFirstLayout(p);
    initSkillFolders(p);
  }
  const data = loadApproved();
  writeText(path.join(p.dist, 'AGENTS.md'), renderAgentsMd(data));
  writeText(path.join(p.dist, 'CLAUDE.md'), renderClaudeMd(data));
  writeText(path.join(p.dist, 'cursor-rule.mdc'), renderCursorRule(data));
  writeText(path.join(p.dist, 'antigravity-agents.md'), renderAntigravityAgents(data));
  writeText(path.join(p.dist, 'GEMINI.md'), renderGeminiMd(data));
  writeText(path.join(p.dist, 'SKILLS.md'), renderSkillsIndex(data));
  writeJson(path.join(p.dist, 'policy.json'), compilePolicy(data));
  logLine('compile', { dist: p.dist });
  if (!flags.quiet) print(`Compiled Agent Kernel files in ${p.dist}`);
}

function backupIfNeeded(target) {
  if (!exists(target)) return;
  const text = readText(target);
  if (text.includes(MARKER_START)) return;
  const backup = `${target}.agent-kernel-backup-${Date.now()}`;
  fs.copyFileSync(target, backup);
}

function copyGenerated(src, dest) {
  backupIfNeeded(dest);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function commandSync(flags = {}) {
  const p = kernelPaths();
  commandCompile({ quiet: true });
  const targets = [];
  const codex = path.join(os.homedir(), '.codex', 'AGENTS.md');
  copyGenerated(path.join(p.dist, 'AGENTS.md'), codex); targets.push(codex);
  const claude = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  copyGenerated(path.join(p.dist, 'CLAUDE.md'), claude); targets.push(claude);
  const gemini = path.join(os.homedir(), '.gemini', 'GEMINI.md');
  copyGenerated(path.join(p.dist, 'GEMINI.md'), gemini); targets.push(gemini);
  logLine('sync', { targets });
  if (!flags.quiet) {
    print('Synced global agent files:');
    for (const t of targets) print(`- ${t}`);
  }
}

function gitRoot(cwd = process.cwd()) {
  try {
    return childProcess.execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return path.resolve(cwd);
  }
}

function commandLink(flags = {}) {
  const project = path.resolve(flags._?.[0] || '.');
  const root = gitRoot(project);
  commandCompile({ quiet: true });
  const p = kernelPaths();
  const agents = readText(path.join(p.dist, 'AGENTS.md'));
  writeText(path.join(root, 'AGENTS.md'), `${agents}\n\n## Project bridge\n\nLinked project: ${root}\nLinked at: ${nowIso()}\n`);
  writeText(path.join(root, '.cursor', 'rules', '00-agent-kernel.mdc'), renderCursorRule(loadApproved()));
  writeText(path.join(root, '.agents', 'agents.md'), renderAntigravityAgents(loadApproved()));
  writeText(path.join(root, 'GEMINI.md'), renderGeminiMd(loadApproved()));
  const skillIndex = path.join(root, '.agents', 'skills', 'README.md');
  writeText(skillIndex, `# Linked Agent Kernel Skills\n\nGlobal skills live at: ${p.skills}\n\n${readText(path.join(p.dist, 'SKILLS.md'))}`);
  if (flags.hooks || flags.enforce) installGitHook(root);
  logLine('link', { project: root });
  print(`Linked Agent Kernel to ${root}`);
}

function commandDoctor() {
  const p = kernelPaths();
  const checks = [];
  function check(label, ok, detail = '') { checks.push({ label, ok, detail }); }
  check('kernel home exists', exists(p.root), p.root);
  check('config exists', exists(p.config), p.config);
  check('JSON-first memory dir exists', exists(p.memoriesDir), p.memoriesDir);
  check('rules source exists', exists(p.rules), p.rules);
  check('preferences source exists', exists(p.preferences), p.preferences);
  check('workflows source exists', exists(p.workflows), p.workflows);
  check('schemas exist', exists(p.memorySchema) && exists(p.proposalSchema) && exists(p.policySchema), p.schemasDir);
  check('dist AGENTS.md exists', exists(path.join(p.dist, 'AGENTS.md')), path.join(p.dist, 'AGENTS.md'));
  check('dist policy.json exists', exists(path.join(p.dist, 'policy.json')), path.join(p.dist, 'policy.json'));
  check('episodes archive exists', exists(p.episodeArchive), p.episodeArchive);
  check('episode index exists', exists(p.episodeIndex), p.episodeIndex);
  check('Claude global file', exists(path.join(os.homedir(), '.claude', 'CLAUDE.md')), '~/.claude/CLAUDE.md');
  check('Codex global file', exists(path.join(os.homedir(), '.codex', 'AGENTS.md')), '~/.codex/AGENTS.md');
  const settings = readJson(path.join(os.homedir(), '.claude', 'settings.json'), null);
  check('Claude settings readable', !!settings, '~/.claude/settings.json');
  check('Claude hooks configured', !!settings?.hooks, 'settings.hooks');
  print(`Agent Kernel Doctor (${VERSION})`);
  print('');
  for (const c of checks) print(`${c.ok ? '✓' : '!'} ${c.label}${c.detail ? `: ${c.detail}` : ''}`);
  print('');
  print(checks.every(c => c.ok) ? 'Status: OK' : 'Status: ATTENTION REQUIRED');
}

function normalizeProposal(input) {
  return {
    id: input.id || id(input.type || 'proposal'),
    type: input.type || 'rule',
    scope: input.scope || 'global',
    level: input.level || 'standard',
    text: input.text || '',
    reason: input.reason || 'No reason provided.',
    targets: String(input.targets || 'all').split(',').map(s => s.trim()).filter(Boolean),
    tags: String(input.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    source: { proposedBy: input.from || 'user', cwd: process.cwd(), channel: input.channel || 'cli' },
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1
  };
}

function validateProposal(proposal) {
  const errors = [];
  if (!proposal.text || proposal.text.trim().length < 8) errors.push('Proposal text is too short.');
  if (proposal.text.length > 2000) errors.push('Proposal text is too long.');
  const secretRe = new RegExp(DEFAULT_SECRET_PATTERNS.join('|'), 'i');
  if (secretRe.test(proposal.text)) errors.push('Proposal appears to contain a secret.');
  if (!['rule', 'policy', 'preference', 'workflow', 'project-note', 'skill-trigger'].includes(proposal.type)) errors.push(`Unsupported type: ${proposal.type}`);
  if (!['global', 'project'].includes(proposal.scope)) errors.push(`Unsupported scope: ${proposal.scope}`);
  if (!['critical', 'standard', 'note'].includes(proposal.level)) errors.push(`Unsupported level: ${proposal.level}`);
  return errors;
}

function commandPropose(flags) {
  const text = flags.text || flags._?.join(' ');
  const proposal = normalizeProposal({ ...flags, text });
  const errors = validateProposal(proposal);
  if (errors.length) {
    error('Invalid memory proposal:');
    errors.forEach(e => error(`- ${e}`));
    process.exitCode = 1;
    return;
  }
  const p = kernelPaths();
  ensureDir(p.pending);
  const dest = path.join(p.pending, `${proposal.id}.json`);
  writeJson(dest, proposal);
  logLine('proposals', { action: 'propose', id: proposal.id, from: proposal.source.proposedBy });
  print(`Created pending memory proposal: ${proposal.id}`);
  print(`Review: agent-kernel inbox`);
  print(`Approve: agent-kernel approve ${proposal.id} --publish`);
}

function targetMemoryFile(paths, type) {
  if (type === 'rule' || type === 'policy') return paths.rules;
  if (type === 'preference') return paths.preferences;
  if (type === 'workflow') return paths.workflows;
  if (type === 'project-note') return paths.projectNotes;
  if (type === 'skill-trigger') return paths.workflows;
  return paths.workflows;
}

function commandRemember(flags) {
  const text = flags.text || flags._?.join(' ');
  if (!text) { error('Usage: agent-kernel remember "text" [--type rule] [--level standard]'); process.exitCode = 1; return; }
  const item = {
    id: id(flags.type || 'memory'),
    type: flags.type || 'rule',
    scope: flags.scope || 'global',
    level: flags.level || 'standard',
    text,
    targets: String(flags.targets || 'all').split(',').map(s => s.trim()).filter(Boolean),
    tags: String(flags.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    status: 'approved',
    source: { createdBy: 'user', channel: 'cli' },
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
    enforcement: flags.level === 'critical' ? { promptContext: true, postEditScan: true, preCommit: true } : { promptContext: true }
  };
  const p = kernelPaths();
  const targetFile = targetMemoryFile(p, item.type);
  const arr = readJson(targetFile, []);
  arr.push(item);
  writeJson(targetFile, arr);
  commandCompile({ quiet: true });
  if (flags.publish) commandSync({ quiet: true });
  print(`Saved approved ${item.type}: ${item.id}`);
}

function listPending() {
  const p = kernelPaths();
  ensureDir(p.pending);
  return fs.readdirSync(p.pending).filter(f => f.endsWith('.json')).map(f => readJson(path.join(p.pending, f), null)).filter(Boolean);
}

function commandInbox() {
  const items = listPending();
  if (!items.length) { print('No pending memory proposals.'); return; }
  print('Pending memory proposals');
  print('');
  for (const x of items) {
    print(`[${x.id}] ${x.type} / ${x.scope} / ${x.level}`);
    print(`From: ${x.source?.proposedBy || 'unknown'}`);
    print(`Text: ${x.text}`);
    print(`Reason: ${x.reason}`);
    print('');
  }
}

function findPending(proposalId) {
  const p = kernelPaths();
  const full = path.join(p.pending, `${proposalId}.json`);
  if (exists(full)) return { full, proposal: readJson(full, null) };
  const matches = fs.readdirSync(p.pending).filter(f => f.includes(proposalId) && f.endsWith('.json'));
  if (matches.length === 1) {
    const f = path.join(p.pending, matches[0]);
    return { full: f, proposal: readJson(f, null) };
  }
  return null;
}

function commandApprove(flags) {
  const proposalId = flags._?.[0];
  if (!proposalId) { error('Usage: agent-kernel approve <proposal-id> [--publish]'); process.exitCode = 1; return; }
  const hit = findPending(proposalId);
  if (!hit?.proposal) { error(`Pending proposal not found: ${proposalId}`); process.exitCode = 1; return; }
  const p = kernelPaths();
  const item = { ...hit.proposal, status: 'approved', approvedAt: nowIso(), enforcement: hit.proposal.enforcement || { promptContext: true } };
  const target = targetMemoryFile(p, item.type);
  const arr = readJson(target, []);
  arr.push(item);
  writeJson(target, arr);
  ensureDir(p.approved);
  fs.renameSync(hit.full, path.join(p.approved, path.basename(hit.full)));
  logLine('approvals', { action: 'approve', id: item.id });
  commandCompile({ quiet: true });
  if (flags.publish) commandSync({ quiet: true });
  print(`Approved proposal: ${item.id}`);
}

function commandReject(flags) {
  const proposalId = flags._?.[0];
  if (!proposalId) { error('Usage: agent-kernel reject <proposal-id>'); process.exitCode = 1; return; }
  const hit = findPending(proposalId);
  if (!hit?.proposal) { error(`Pending proposal not found: ${proposalId}`); process.exitCode = 1; return; }
  const p = kernelPaths();
  ensureDir(p.rejected);
  fs.renameSync(hit.full, path.join(p.rejected, path.basename(hit.full)));
  logLine('approvals', { action: 'reject', id: hit.proposal.id });
  print(`Rejected proposal: ${hit.proposal.id}`);
}

function commandPublish(flags) {
  commandCompile({ quiet: true });
  commandSync({ quiet: true });
  if (!flags.quiet) print('Published and synced Agent Kernel.');
}

function validateMemoryObject(item, fileLabel = 'memory') {
  const errors = [];
  if (!item || typeof item !== 'object') return [`${fileLabel}: item is not an object`];
  if (!item.id || typeof item.id !== 'string') errors.push(`${fileLabel}: missing id`);
  if (!['rule', 'policy', 'preference', 'workflow', 'project-note', 'skill-trigger'].includes(item.type)) errors.push(`${item.id || fileLabel}: invalid type ${item.type}`);
  if (!['global', 'project'].includes(item.scope)) errors.push(`${item.id || fileLabel}: invalid scope ${item.scope}`);
  if (!['critical', 'standard', 'note'].includes(item.level)) errors.push(`${item.id || fileLabel}: invalid level ${item.level}`);
  if (!['approved', 'pending', 'rejected'].includes(item.status)) errors.push(`${item.id || fileLabel}: invalid status ${item.status}`);
  if (!item.text || typeof item.text !== 'string' || item.text.trim().length < 8) errors.push(`${item.id || fileLabel}: text is missing or too short`);
  if (item.text && item.text.length > 4000) errors.push(`${item.id || fileLabel}: text is too long`);
  const secretRe = new RegExp(DEFAULT_SECRET_PATTERNS.join('|'), 'i');
  if (item.text && secretRe.test(item.text)) errors.push(`${item.id || fileLabel}: text appears to contain a secret`);
  if (!item.createdAt) errors.push(`${item.id || fileLabel}: missing createdAt`);
  return errors;
}

function memoryFiles(paths) {
  return [
    ['rules', paths.rules],
    ['preferences', paths.preferences],
    ['workflows', paths.workflows],
    ['project-notes', paths.projectNotes]
  ];
}

function commandValidate(flags = {}) {
  const p = kernelPaths();
  ensureJsonFirstLayout(p);
  const errors = [];
  const ids = new Map();
  for (const [label, file] of memoryFiles(p)) {
    const arr = readJson(file, null);
    if (!Array.isArray(arr)) {
      errors.push(`${label}: expected JSON array at ${file}`);
      continue;
    }
    arr.forEach((item, index) => {
      for (const e of validateMemoryObject(item, `${label}[${index}]`)) errors.push(e);
      if (item?.id) {
        if (ids.has(item.id)) errors.push(`duplicate id: ${item.id} in ${label} and ${ids.get(item.id)}`);
        else ids.set(item.id, label);
      }
    });
  }
  for (const proposal of listPending()) {
    for (const e of validateMemoryObject({ ...proposal, status: proposal.status || 'pending' }, `proposal:${proposal.id}`)) errors.push(e);
    if (!proposal.reason) errors.push(`${proposal.id}: proposal missing reason`);
  }
  const policy = readJson(p.policies, null);
  if (!policy || typeof policy !== 'object') errors.push(`policy pack is not a JSON object: ${p.policies}`);
  else {
    if (!Array.isArray(policy.denyCommands)) errors.push('policy.denyCommands must be an array');
    if (!Array.isArray(policy.secretPatterns)) errors.push('policy.secretPatterns must be an array');
    if (!Array.isArray(policy.forbiddenContentPatterns)) errors.push('policy.forbiddenContentPatterns must be an array');
  }
  if (errors.length) {
    print('Agent Kernel validation failed:');
    errors.forEach(e => print(`- ${e}`));
    process.exitCode = 2;
    return;
  }
  print('Agent Kernel validation: OK');
}

function commandMigrateJson(flags = {}) {
  const p = kernelPaths();
  ensureJsonFirstLayout(p);
  commandValidate({});
  if (process.exitCode && process.exitCode !== 0) return;
  commandCompile({ quiet: true });
  if (flags.publish) commandSync({ quiet: true });
  print(`Migrated Agent Kernel to JSON-first layout at ${p.source}`);
}

function loadAllMemoryItems() {
  const p = kernelPaths();
  ensureJsonFirstLayout(p);
  const out = [];
  for (const [label, file] of memoryFiles(p)) {
    for (const item of readJson(file, [])) out.push({ ...item, bucket: label, file });
  }
  return out;
}

function commandMemory(flags = {}) {
  const action = flags._?.[0] || 'list';
  const rest = flags._?.slice(1) || [];
  if (action === 'list') {
    const items = loadAllMemoryItems().filter(x => !flags.type || x.type === flags.type).filter(x => !flags.level || x.level === flags.level);
    if (!items.length) { print('No memories found.'); return; }
    for (const x of items) print(`[${x.id}] ${x.type}/${x.scope}/${x.level}/${x.status} (${x.bucket})\n${x.text}\n`);
    return;
  }
  if (action === 'search') {
    const q = (flags.query || rest.join(' ')).toLowerCase();
    if (!q) { error('Usage: agent-kernel memory search <query>'); process.exitCode = 1; return; }
    const items = loadAllMemoryItems().filter(x => `${x.id} ${x.type} ${x.level} ${x.text} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q));
    if (!items.length) { print('No matching memories.'); return; }
    for (const x of items) print(`[${x.id}] ${x.type}/${x.level}\n${x.text}\n`);
    return;
  }
  if (action === 'show') {
    const wanted = rest[0];
    const item = loadAllMemoryItems().find(x => x.id === wanted || x.id?.includes(wanted));
    if (!item) { error(`Memory not found: ${wanted}`); process.exitCode = 1; return; }
    print(JSON.stringify(item, null, 2));
    return;
  }
  error(`Unknown memory command: ${action}`);
  process.exitCode = 1;
}

function mergeHookSettings(settings) {
  const command = 'agent-kernel hook';
  const hooks = settings.hooks || {};
  function add(event, matcher, cmd) {
    hooks[event] ||= [];
    const existsCmd = JSON.stringify(hooks[event]).includes(cmd);
    if (!existsCmd) hooks[event].push({ matcher, hooks: [{ type: 'command', command: `${command} ${cmd}` }] });
  }
  add('SessionStart', 'startup|resume|compact', 'session-start');
  add('UserPromptSubmit', '', 'user-prompt-submit');
  add('PreToolUse', 'Bash', 'pre-tool-use');
  add('PreToolUse', 'Write|Edit|MultiEdit', 'pre-tool-use');
  add('PostToolUse', 'Write|Edit|MultiEdit', 'post-tool-use');
  settings.hooks = hooks;
  return settings;
}

function commandEnforceInstall(flags = {}) {
  commandCompile({ quiet: true });
  const claudeDir = path.join(os.homedir(), '.claude');
  ensureDir(claudeDir);
  const settingsPath = path.join(claudeDir, 'settings.json');
  const settings = readJson(settingsPath, {});
  writeJson(settingsPath, mergeHookSettings(settings));
  const hookDir = path.join(claudeDir, 'hooks');
  ensureDir(hookDir);
  const sessionEnd = path.join(hookDir, 'session-end');
  const sessionEndScript = `#!/usr/bin/env sh
# agent-kernel:start
agent-kernel episode sync --limit 25 >/dev/null 2>&1 || true
# agent-kernel:end
`;
  if (!exists(sessionEnd) || readText(sessionEnd).includes('agent-kernel:start')) {
    writeText(sessionEnd, sessionEndScript);
    fs.chmodSync(sessionEnd, 0o755);
  }
  if (!flags.quiet) print(`Installed Claude hooks in ${settingsPath} and ${sessionEnd}`);
}

function fileMatches(pattern, file) {
  if (!pattern.includes('*')) return file === pattern || file.endsWith('/' + pattern);
  const escaped = pattern.split('**').join('__DOUBLESTAR__')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .split('__DOUBLESTAR__').join('.*');
  return new RegExp(`^${escaped}$`).test(file);
}

function listFiles(root) {
  const out = [];
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(full);
    }
  }
  walk(root);
  return out;
}

function getStagedFiles(root) {
  try {
    const out = childProcess.execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).trim();
    return out ? out.split('\n').map(f => path.join(root, f)) : [];
  } catch { return []; }
}

function projectContains(root, terms) {
  const pkg = readText(path.join(root, 'package.json'));
  const all = `${pkg}\n${exists(path.join(root, 'supabase')) ? 'supabase' : ''}`;
  return terms.some(t => all.includes(t));
}

function scanFiles(root, files) {
  const p = kernelPaths();
  const policy = readJson(path.join(p.dist, 'policy.json'), readJson(p.policies, defaultPolicies()));
  const violations = [];
  const secretRegexes = (policy.secretPatterns || DEFAULT_SECRET_PATTERNS).map(x => new RegExp(x, 'i'));
  const contentPolicies = policy.forbiddenContentPatterns || [];
  for (const full of files) {
    if (!exists(full)) continue;
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (fs.statSync(full).size > 1024 * 1024) continue;
    const text = readText(full);
    for (const re of secretRegexes) {
      if (re.test(text) && !rel.startsWith('.env')) violations.push({ file: rel, rule: 'secret-pattern', message: 'Possible hardcoded secret detected.' });
    }
    for (const cp of contentPolicies) {
      if (cp.whenProjectContains && !projectContains(root, cp.whenProjectContains)) continue;
      if (cp.files && !cp.files.some(pattern => fileMatches(pattern, rel))) continue;
      const re = new RegExp(cp.pattern, 'i');
      if (re.test(text)) violations.push({ file: rel, rule: cp.id, message: cp.message });
    }
  }
  return violations;
}

function commandGuard(flags = {}) {
  const root = gitRoot(process.cwd());
  commandCompile({ quiet: true });
  let files = [];
  if (flags.staged) files = getStagedFiles(root);
  else if (flags.file) files = [path.resolve(flags.file)];
  else files = listFiles(root);
  const violations = scanFiles(root, files);
  if (violations.length) {
    print('Agent Kernel Guard blocked violations:');
    for (const v of violations) print(`- ${v.file}: ${v.rule}: ${v.message}`);
    process.exitCode = 2;
    return;
  }
  print('Agent Kernel Guard: OK');
}

function checkCommandPolicy(command, cwd) {
  const p = kernelPaths();
  const policy = readJson(path.join(p.dist, 'policy.json'), readJson(p.policies, defaultPolicies()));
  const deny = policy.denyCommands || DEFAULT_DENY_COMMANDS;
  for (const d of deny) {
    if (new RegExp(d.pattern, 'i').test(command)) return d.message;
  }
  for (const d of policy.forbiddenDependencyPatterns || []) {
    if (d.whenFileExists && !exists(path.join(cwd, d.whenFileExists))) continue;
    if (new RegExp(d.commandPattern, 'i').test(command)) return d.message;
  }
  return null;
}

function checkWritePolicy(filePath, cwd) {
  if (!filePath) return null;
  const p = kernelPaths();
  const policy = readJson(path.join(p.dist, 'policy.json'), readJson(p.policies, defaultPolicies()));
  const rel = path.relative(gitRoot(cwd), path.resolve(cwd, filePath)).replace(/\\/g, '/');
  for (const pattern of policy.denyWritePaths || []) {
    if (fileMatches(pattern, rel)) return `Blocked write to protected path: ${rel}`;
  }
  return null;
}

function readStdinJson() {
  const input = fs.readFileSync(0, 'utf8') || '{}';
  try { return JSON.parse(input); } catch { return {}; }
}

function hookDeny(eventName, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
}

function commandHook(kind) {
  const input = readStdinJson();
  const cwd = input.cwd || process.cwd();
  if (kind === 'session-start') {
    const p = kernelPaths();
    commandCompile({ quiet: true });
    const context = readText(path.join(p.dist, 'AGENTS.md')).slice(0, 12000);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
    return;
  }
  if (kind === 'session-end') {
    commandEpisode({ _: ['sync'], limit: 25 });
    return;
  }
  if (kind === 'user-prompt-submit') {
    const prompt = input.prompt || input.user_prompt || '';
    const trigger = /(^|\n)\s*(AK remember:|AK rule:|خلي دي rule|احفظ دي|احفظها لباقي agents|remember this|save this)/i;
    if (trigger.test(prompt)) {
      const cleaned = prompt.replace(trigger, '').trim();
      const proposal = normalizeProposal({ from: 'claude', type: 'rule', scope: 'global', level: 'standard', targets: 'all', text: cleaned, reason: 'Captured from explicit user memory trigger.', channel: 'hook' });
      if (!validateProposal(proposal).length) {
        const p = kernelPaths(); ensureDir(p.pending); writeJson(path.join(p.pending, `${proposal.id}.json`), proposal);
        process.stdout.write(JSON.stringify({ decision: 'block', reason: `Saved as pending Agent Kernel memory proposal: ${proposal.id}. Run: agent-kernel approve ${proposal.id} --publish` }));
        return;
      }
    }
    process.stdout.write(JSON.stringify({}));
    return;
  }
  if (kind === 'pre-tool-use') {
    const tool = input.tool_name || input.toolName || '';
    const toolInput = input.tool_input || input.toolInput || {};
    if (tool === 'Bash' || toolInput.command) {
      const msg = checkCommandPolicy(toolInput.command || '', cwd);
      if (msg) { process.stdout.write(JSON.stringify(hookDeny('PreToolUse', msg))); return; }
    }
    const filePath = toolInput.file_path || toolInput.path || toolInput.filename;
    const msg = checkWritePolicy(filePath, cwd);
    if (msg) { process.stdout.write(JSON.stringify(hookDeny('PreToolUse', msg))); return; }
    process.stdout.write(JSON.stringify({}));
    return;
  }
  if (kind === 'post-tool-use') {
    const toolInput = input.tool_input || input.toolInput || {};
    const filePath = toolInput.file_path || toolInput.path || toolInput.filename;
    const root = gitRoot(cwd);
    const files = filePath ? [path.resolve(cwd, filePath)] : listFiles(root);
    const violations = scanFiles(root, files);
    if (violations.length) {
      const reason = violations.map(v => `${v.file}: ${v.message}`).join('\n');
      process.stdout.write(JSON.stringify({ decision: 'block', reason }));
      return;
    }
    process.stdout.write(JSON.stringify({}));
    return;
  }
  error(`Unknown hook: ${kind}`);
  process.exitCode = 1;
}

function installGitHook(root) {
  const gitDir = path.join(root, '.git');
  if (!exists(gitDir)) return false;
  const hookPath = path.join(gitDir, 'hooks', 'pre-commit');
  if (exists(hookPath) && !readText(hookPath).includes('agent-kernel guard')) {
    fs.copyFileSync(hookPath, `${hookPath}.agent-kernel-backup-${Date.now()}`);
  }
  const script = `#!/usr/bin/env sh\n# agent-kernel:start\nagent-kernel guard --staged\nstatus=$?\nif [ $status -ne 0 ]; then\n  echo "Agent Kernel blocked this commit."\n  exit $status\nfi\n# agent-kernel:end\n`;
  writeText(hookPath, script);
  fs.chmodSync(hookPath, 0o755);
  return true;
}

function commandGitHook(flags = {}) {
  const root = gitRoot(flags._?.[0] || process.cwd());
  const ok = installGitHook(root);
  print(ok ? `Installed pre-commit hook in ${root}` : `No .git directory found in ${root}`);
}

function commandStart(flags = {}) {
  const agent = flags._?.[0];
  const projectArg = flags._?.[1] || '.';
  if (!agent) { error('Usage: agent-kernel start <claude|codex|cursor|antigravity|gemini> [project]'); process.exitCode = 1; return; }
  const project = path.resolve(projectArg);
  if (!exists(project)) { error(`Project not found: ${project}`); process.exitCode = 1; return; }
  commandLink({ _: [project] });
  commandCompile({ quiet: true });
  const commandMap = { claude: 'claude', codex: 'codex', cursor: 'cursor', antigravity: 'antigravity', gemini: 'gemini' };
  const bin = commandMap[agent];
  if (!bin) { error(`Unsupported agent: ${agent}`); process.exitCode = 1; return; }
  const args = agent === 'cursor' || agent === 'antigravity' ? [project] : [];
  print(`Starting ${agent} in ${project}`);
  const child = childProcess.spawn(bin, args, { cwd: project, stdio: 'inherit', shell: true });
  child.on('exit', code => process.exit(code ?? 0));
}


function safeJson(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function parseMcpArgs(args = {}) {
  if (!args || typeof args !== 'object') return {};
  return args;
}

function jsonRpcResult(idValue, result) {
  return { jsonrpc: '2.0', id: idValue, result };
}

function jsonRpcError(idValue, code, message, data) {
  return { jsonrpc: '2.0', id: idValue ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function mcpText(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

function mcpToolDefinitions() {
  return [
    {
      name: 'agent_kernel_get_status',
      description: 'Return Agent Kernel status, home path, approved memory count, pending proposal count, and strict-mode state.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} }
    },
    {
      name: 'agent_kernel_search_memory',
      description: 'Search approved Agent Kernel memories by text, id, level, type, tags, or scope.',
      inputSchema: {
        type: 'object', additionalProperties: false,
        properties: {
          query: { type: 'string', description: 'Search text. Empty returns recent approved memories.' },
          type: { type: 'string', enum: ['rule', 'policy', 'preference', 'workflow', 'project-note', 'skill-trigger'] },
          level: { type: 'string', enum: ['critical', 'standard', 'note'] },
          limit: { type: 'number', minimum: 1, maximum: 50 }
        }
      }
    },
    {
      name: 'agent_kernel_get_constitution',
      description: 'Return the compiled AGENTS.md constitution that should guide the current coding agent.',
      inputSchema: { type: 'object', additionalProperties: false, properties: { maxChars: { type: 'number', minimum: 1000, maximum: 50000 } } }
    },
    {
      name: 'agent_kernel_propose_memory',
      description: 'Create a pending shared-memory proposal. Use this instead of editing generated files directly when the user asks to remember a rule.',
      inputSchema: {
        type: 'object', additionalProperties: false,
        required: ['text', 'reason'],
        properties: {
          text: { type: 'string', minLength: 8, maxLength: 2000 },
          reason: { type: 'string', minLength: 3, maxLength: 1000 },
          from: { type: 'string', description: 'Agent name, e.g. claude, codex, cursor, antigravity, gemini.' },
          type: { type: 'string', enum: ['rule', 'policy', 'preference', 'workflow', 'project-note', 'skill-trigger'], default: 'rule' },
          scope: { type: 'string', enum: ['global', 'project'], default: 'global' },
          level: { type: 'string', enum: ['critical', 'standard', 'note'], default: 'standard' },
          targets: { type: 'string', description: 'Comma-separated targets or all.', default: 'all' },
          tags: { type: 'string', description: 'Comma-separated tags.' }
        }
      }
    },
    {
      name: 'agent_kernel_search_episodes',
      description: 'Search archived episodic memories from prior Claude/Codex/manual sessions using local text scoring.',
      inputSchema: {
        type: 'object', additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50 },
          response_format: { type: 'string', enum: ['markdown', 'json'], default: 'markdown' }
        }
      }
    },
    {
      name: 'agent_kernel_read_episode',
      description: 'Read a full archived episodic memory by id. Use after searching episodes.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' }, response_format: { type: 'string', enum: ['markdown', 'json'], default: 'markdown' } } }
    },
    {
      name: 'agent_kernel_capture_episode',
      description: 'Capture a concise episode from the current session. Do not use for secrets or conversations marked DO NOT INDEX.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['title', 'text'],
        properties: { title: { type: 'string' }, text: { type: 'string' }, summary: { type: 'string' }, agent: { type: 'string' }, project: { type: 'string' }, tags: { type: 'string' } }
      }
    },
    {
      name: 'agent_kernel_sync_episodes',
      description: 'Sync local Claude/Codex JSONL transcripts into Agent Kernel episodic memory archive.',
      inputSchema: { type: 'object', additionalProperties: false, properties: { agent: { type: 'string', enum: ['claude', 'codex'] }, limit: { type: 'number', minimum: 1, maximum: 500 } } }
    },
    {
      name: 'agent_kernel_list_pending',
      description: 'List pending shared-memory proposals waiting for user approval.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} }
    },
    {
      name: 'agent_kernel_approve_memory',
      description: 'Approve a pending memory proposal. Disabled by default unless AGENT_KERNEL_MCP_ALLOW_APPROVE=1 is set.',
      inputSchema: {
        type: 'object', additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' }, publish: { type: 'boolean', default: false } }
      }
    },
    {
      name: 'agent_kernel_guard_command',
      description: 'Check whether a shell command would be blocked by Agent Kernel strict policies.',
      inputSchema: {
        type: 'object', additionalProperties: false,
        required: ['command'],
        properties: { command: { type: 'string' }, cwd: { type: 'string' } }
      }
    }
  ];
}

function mcpCallTool(name, rawArgs = {}) {
  const args = parseMcpArgs(rawArgs);
  if (name === 'agent_kernel_get_status') {
    const p = kernelPaths();
    const all = loadAllMemoryItems();
    const pending = listPending();
    const config = readJson(p.config, defaultConfig());
    return mcpText(safeJson({
      version: VERSION,
      home: p.root,
      approvedMemories: all.filter(x => x.status === 'approved').length,
      pendingProposals: pending.length,
      strictMode: !!config.strictMode,
      dist: p.dist
    }));
  }
  if (name === 'agent_kernel_search_memory') {
    const q = String(args.query || '').toLowerCase();
    const limit = Math.max(1, Math.min(Number(args.limit || 12), 50));
    let items = loadAllMemoryItems().filter(x => x.status === 'approved');
    if (args.type) items = items.filter(x => x.type === args.type);
    if (args.level) items = items.filter(x => x.level === args.level);
    if (q) items = items.filter(x => `${x.id} ${x.type} ${x.scope} ${x.level} ${x.text} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q));
    items = items.slice(0, limit).map(({ file, bucket, ...x }) => x);
    return mcpText(safeJson(items));
  }
  if (name === 'agent_kernel_get_constitution') {
    const p = kernelPaths();
    commandCompile({ quiet: true });
    const max = Math.max(1000, Math.min(Number(args.maxChars || 16000), 50000));
    return mcpText(readText(path.join(p.dist, 'AGENTS.md')).slice(0, max));
  }
  if (name === 'agent_kernel_propose_memory') {
    const proposal = normalizeProposal({ ...args, from: args.from || 'mcp', channel: 'mcp' });
    const errors = validateProposal(proposal);
    if (errors.length) return mcpText(safeJson({ ok: false, errors }));
    const p = kernelPaths();
    ensureDir(p.pending);
    writeJson(path.join(p.pending, `${proposal.id}.json`), proposal);
    logLine('proposals', { action: 'propose', id: proposal.id, from: proposal.source.proposedBy, channel: 'mcp' });
    return mcpText(safeJson({ ok: true, id: proposal.id, status: 'pending', next: `agent-kernel approve ${proposal.id} --publish` }));
  }
  if (name === 'agent_kernel_search_episodes') {
    const query = String(args.query || '');
    const limit = Math.max(1, Math.min(Number(args.limit || 10), 50));
    const idx = readEpisodeIndex();
    const scored = [];
    for (const e of idx.episodes) {
      const full = loadEpisode(e.id) || e;
      const score = episodeScore(full, query);
      if (score > 0) scored.push({ score, episode: full });
    }
    scored.sort((a, b) => b.score - a.score || String(b.episode.updatedAt).localeCompare(String(a.episode.updatedAt)));
    const results = scored.slice(0, limit).map(x => x.episode);
    if (args.response_format === 'json') return mcpText(safeJson(results));
    const md = results.length ? results.map(e => `## ${e.title}\n\nID: ${e.id}\nAgent: ${e.agent || ''}\nProject: ${e.project || ''}\nUpdated: ${e.updatedAt || e.createdAt}\n\n${String(e.text || '').replace(/\s+/g, ' ').slice(0, 500)}`).join('\n\n') : 'No matching episodes.';
    return mcpText(md);
  }
  if (name === 'agent_kernel_read_episode') {
    const episode = loadEpisode(String(args.id || ''));
    if (!episode) return mcpText(safeJson({ ok: false, error: `Episode not found: ${args.id}` }));
    if (args.response_format === 'json') return mcpText(safeJson(episode));
    return mcpText(`# ${episode.title}\n\nID: ${episode.id}\nAgent: ${episode.agent || ''}\nProject: ${episode.project || ''}\nSource: ${episode.sourcePath || 'manual'}\n\n${episode.summary || ''}\n\n---\n\n${episode.text}`);
  }
  if (name === 'agent_kernel_capture_episode') {
    const text = String(args.text || '');
    if (text.includes(EPISODIC_EXCLUSION_MARKER)) return mcpText(safeJson({ ok: false, skipped: true, reason: 'Exclusion marker present.' }));
    const episode = saveEpisode({ title: args.title, summary: args.summary, agent: args.agent || 'mcp', project: args.project || '', tags: args.tags || '', text });
    return mcpText(safeJson({ ok: true, id: episode.id }));
  }
  if (name === 'agent_kernel_sync_episodes') {
    const before = readEpisodeIndex().episodes.length;
    commandEpisode({ _: ['sync'], agent: args.agent, limit: args.limit || 100 });
    const after = readEpisodeIndex().episodes.length;
    return mcpText(safeJson({ ok: true, before, after, saved: after - before }));
  }
  if (name === 'agent_kernel_list_pending') {
    return mcpText(safeJson(listPending()));
  }
  if (name === 'agent_kernel_approve_memory') {
    if (process.env.AGENT_KERNEL_MCP_ALLOW_APPROVE !== '1') {
      return mcpText(safeJson({ ok: false, error: 'Approval through MCP is disabled. Run in terminal: agent-kernel approve <id> --publish, or set AGENT_KERNEL_MCP_ALLOW_APPROVE=1 intentionally.' }));
    }
    const hit = findPending(String(args.id || ''));
    if (!hit?.proposal) return mcpText(safeJson({ ok: false, error: `Pending proposal not found: ${args.id}` }));
    const p = kernelPaths();
    const item = { ...hit.proposal, status: 'approved', approvedAt: nowIso(), enforcement: hit.proposal.enforcement || { promptContext: true } };
    const target = targetMemoryFile(p, item.type);
    const arr = readJson(target, []);
    arr.push(item);
    writeJson(target, arr);
    ensureDir(p.approved);
    fs.renameSync(hit.full, path.join(p.approved, path.basename(hit.full)));
    logLine('approvals', { action: 'approve', id: item.id, channel: 'mcp' });
    commandCompile({ quiet: true });
    if (args.publish) commandSync({ quiet: true });
    return mcpText(safeJson({ ok: true, id: item.id, published: !!args.publish }));
  }
  if (name === 'agent_kernel_guard_command') {
    const msg = checkCommandPolicy(String(args.command || ''), args.cwd || process.cwd());
    return mcpText(safeJson({ ok: !msg, blocked: !!msg, reason: msg || null }));
  }
  return mcpText(safeJson({ ok: false, error: `Unknown tool: ${name}` }));
}

function mcpResources() {
  return [
    { uri: 'agent-kernel://constitution', name: 'Agent Kernel Constitution', description: 'Compiled AGENTS.md guidance.', mimeType: 'text/markdown' },
    { uri: 'agent-kernel://policy', name: 'Compiled Policy', description: 'Compiled policy.json used by guards.', mimeType: 'application/json' },
    { uri: 'agent-kernel://memories/rules', name: 'Approved Rules and Policies', description: 'Approved global and project rules.', mimeType: 'application/json' },
    { uri: 'agent-kernel://episodes/index', name: 'Episodic Memory Index', description: 'Indexed prior conversations and manual episodes.', mimeType: 'application/json' },
    { uri: 'agent-kernel://inbox/pending', name: 'Pending Memory Proposals', description: 'Unapproved memory proposals.', mimeType: 'application/json' }
  ];
}

function readMcpResource(uri) {
  const p = kernelPaths();
  commandCompile({ quiet: true });
  if (uri === 'agent-kernel://constitution') return { mimeType: 'text/markdown', text: readText(path.join(p.dist, 'AGENTS.md')) };
  if (uri === 'agent-kernel://policy') return { mimeType: 'application/json', text: readText(path.join(p.dist, 'policy.json')) };
  if (uri === 'agent-kernel://memories/rules') return { mimeType: 'application/json', text: readText(p.rules) };
  if (uri === 'agent-kernel://episodes/index') return { mimeType: 'application/json', text: readText(p.episodeIndex) };
  if (uri === 'agent-kernel://inbox/pending') return { mimeType: 'application/json', text: safeJson(listPending()) };
  throw new Error(`Unknown resource: ${uri}`);
}

function commandMcpServe() {
  ensureJsonFirstLayout(kernelPaths());
  process.stdin.setEncoding('utf8');
  let buffer = '';
  function send(payload) { process.stdout.write(JSON.stringify(payload) + '\n'); }
  process.stdin.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let req;
      try { req = JSON.parse(line); } catch { send(jsonRpcError(null, -32700, 'Parse error')); continue; }
      if (!req.method) continue;
      try {
        if (req.method === 'initialize') {
          send(jsonRpcResult(req.id, {
            protocolVersion: req.params?.protocolVersion || '2025-06-18',
            capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
            serverInfo: { name: 'agent-kernel-memory', version: VERSION }
          }));
        } else if (req.method === 'tools/list') {
          send(jsonRpcResult(req.id, { tools: mcpToolDefinitions() }));
        } else if (req.method === 'tools/call') {
          const name = req.params?.name;
          const args = req.params?.arguments || {};
          send(jsonRpcResult(req.id, mcpCallTool(name, args)));
        } else if (req.method === 'resources/list') {
          send(jsonRpcResult(req.id, { resources: mcpResources() }));
        } else if (req.method === 'resources/read') {
          const uri = req.params?.uri;
          const r = readMcpResource(uri);
          send(jsonRpcResult(req.id, { contents: [{ uri, mimeType: r.mimeType, text: r.text }] }));
        } else if (req.method === 'prompts/list') {
          send(jsonRpcResult(req.id, { prompts: [] }));
        } else if (req.method.startsWith('notifications/')) {
          // JSON-RPC notifications do not receive responses.
        } else {
          send(jsonRpcError(req.id, -32601, `Method not found: ${req.method}`));
        }
      } catch (e) {
        send(jsonRpcError(req.id, -32603, e?.message || String(e)));
      }
    }
  });
}

function claudeMcpJson() {
  return {
    type: 'stdio',
    command: 'agent-kernel',
    args: ['mcp', 'serve'],
    env: { AGENT_KERNEL_HOME: homeDir() }
  };
}

function commandMcp(flags = {}) {
  const action = flags._?.[0];
  const target = flags._?.[1] || 'claude';
  if (action === 'serve') return commandMcpServe();
  if (action === 'config') {
    if (target !== 'claude') { error('Currently supported config target: claude'); process.exitCode = 1; return; }
    print(safeJson({ mcpServers: { 'agent-kernel-memory': claudeMcpJson() } }));
    return;
  }
  if (action === 'install') {
    if (target !== 'claude') { error('Currently supported install target: claude'); process.exitCode = 1; return; }
    const claudeDir = path.join(os.homedir(), '.claude');
    ensureDir(claudeDir);
    const settingsPath = path.join(claudeDir, 'settings.json');
    const settings = readJson(settingsPath, {});
    settings.mcpServers ||= {};
    settings.mcpServers['agent-kernel-memory'] = claudeMcpJson();
    writeJson(settingsPath, settings);
    print(`Installed Agent Kernel MCP server in ${settingsPath}`);
    print('Server: agent-kernel-memory');
    return;
  }
  if (action === 'test') {
    const tools = mcpToolDefinitions().map(t => t.name);
    print(safeJson({ ok: true, server: 'agent-kernel-memory', version: VERSION, tools }));
    return;
  }
  error('Usage: agent-kernel mcp <serve|config claude|install claude|test>');
  process.exitCode = 1;
}

function commandStatus() {
  const p = kernelPaths();
  const rules = readJson(p.rules, []);
  const pending = listPending();
  print(`Agent Kernel ${VERSION}`);
  print(`Home: ${p.root}`);
  print(`Approved rules: ${rules.filter(r => r.status === 'approved').length}`);
  print(`Pending proposals: ${pending.length}`);
  print(`Dist: ${p.dist}`);
}

function commandExport(flags = {}) {
  const p = kernelPaths();
  const out = path.resolve(flags.out || 'agent-kernel-export');
  ensureDir(out);
  fs.cpSync(p.source, path.join(out, 'source'), { recursive: true });
  fs.cpSync(p.skills, path.join(out, 'skills'), { recursive: true });
  fs.cpSync(p.dist, path.join(out, 'dist'), { recursive: true });
  writeText(path.join(out, 'README.md'), `# Agent Kernel Export\n\nCreated at ${nowIso()} from ${p.root}.\n`);
  print(`Exported to ${out}`);
}

function usage() {
  print(`agent-kernel ${VERSION}\n\nUsage:\n  agent-kernel init [--sync] [--enforce]\n  agent-kernel doctor\n  agent-kernel compile\n  agent-kernel sync\n  agent-kernel link [project] [--hooks]\n  agent-kernel remember "rule text" [--type rule] [--level critical] [--publish]\n  agent-kernel propose --from claude --text "rule text" --reason "..."\n  agent-kernel inbox\n  agent-kernel approve <id> [--publish]\n  agent-kernel reject <id>\n  agent-kernel publish\n  agent-kernel enforce install\n  agent-kernel guard [--staged|--file path]\n  agent-kernel git-hook install [project]\n  agent-kernel start <claude|codex|cursor|antigravity|gemini> [project]\n  agent-kernel status\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const sub = argv[1];
  const subcommandFamilies = new Set(['enforce', 'git-hook', 'migrate', 'memory', 'mcp', 'episode']);
  const flags = parseFlags(argv.slice(subcommandFamilies.has(cmd) ? 2 : 1));
  if (subcommandFamilies.has(cmd)) flags._ = [sub, ...(flags._ || [])].filter(Boolean);
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') return usage();
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') return print(VERSION);
  if (cmd === 'init') return commandInit(flags);
  if (cmd === 'doctor') return commandDoctor(flags);
  if (cmd === 'compile') return commandCompile(flags);
  if (cmd === 'sync') return commandSync(flags);
  if (cmd === 'link') return commandLink(flags);
  if (cmd === 'remember') return commandRemember(flags);
  if (cmd === 'propose') return commandPropose(flags);
  if (cmd === 'inbox') return commandInbox(flags);
  if (cmd === 'approve') return commandApprove(flags);
  if (cmd === 'reject') return commandReject(flags);
  if (cmd === 'publish') return commandPublish(flags);
  if (cmd === 'validate') return commandValidate(flags);
  if (cmd === 'migrate' && sub === 'json') return commandMigrateJson(flags);
  if (cmd === 'memory') return commandMemory(flags);
  if (cmd === 'episode') return commandEpisode(flags);
  if (cmd === 'enforce' && sub === 'install') return commandEnforceInstall(flags);
  if (cmd === 'guard') return commandGuard(flags);
  if (cmd === 'git-hook' && sub === 'install') return commandGitHook(flags);
  if (cmd === 'hook') return commandHook(sub);
  if (cmd === 'start') return commandStart(flags);
  if (cmd === 'mcp') return commandMcp(flags);
  if (cmd === 'status') return commandStatus(flags);
  if (cmd === 'export') return commandExport(flags);
  error(`Unknown command: ${argv.join(' ')}`);
  usage();
  process.exitCode = 1;
}

main().catch(err => {
  error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
