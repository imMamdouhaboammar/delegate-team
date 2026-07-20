#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dtExecutable = process.platform === 'win32' ? 'dt.cmd' : 'dt';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
  }
  return result;
}

const requiredFiles = [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/cli.js',
  'bin/apeiron-uni',
  'bin/autopilot.sh',
  'bin/agents-health.sh',
  'bin/verify-package.mjs',
  'delegate-team/scripts/relay.mjs',
  'delegate-team/scripts/codex-router.mjs',
  'delegate-team/scripts/gemini-router.mjs',
  'delegate-team/scripts/opencode-router.mjs',
  'templates/chatgpt-remote-bootstrap.md',
];

const reviewedJsonFiles = [
  'agent-kernel/develpment/backlog.json',
  'agent-kernel/examples/json-memory-rule.json',
  'agent-kernel/examples/sample-episode.json',
  'agent-kernel/examples/sample-rule.json',
  'mmas/examples/boulder.example.json',
  'package.json',
].sort();

const secretPattern = /(^|\/)(\.env|\.npmrc|id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.pem|.*\.key)$/;

try {
  const verificationRoot = mkdtempSync(join(tmpdir(), 'delegate-team-pack-'));
  const packed = run(npmCommand, ['pack', '--json', '--ignore-scripts', '--pack-destination', verificationRoot]);
  const payload = JSON.parse(packed.stdout);
  const entry = Array.isArray(payload) ? payload[0] : payload;

  if (!entry?.filename || !Array.isArray(entry.files)) {
    throw new Error('npm pack did not return a filename and files inventory');
  }

  const tarballPath = isAbsolute(entry.filename)
    ? entry.filename
    : resolve(verificationRoot, entry.filename);
  if (!existsSync(tarballPath)) {
    throw new Error(`npm pack tarball is missing: ${tarballPath}`);
  }

  const packedFiles = entry.files.map((file) => file.path).sort();
  const missingRequired = requiredFiles.filter((file) => !packedFiles.includes(file));
  if (missingRequired.length > 0) {
    throw new Error(`missing required files: ${missingRequired.join(', ')}`);
  }

  const secretLikeFiles = packedFiles.filter((file) => secretPattern.test(file));
  if (secretLikeFiles.length > 0) {
    throw new Error(`secret-like files found: ${secretLikeFiles.join(', ')}`);
  }

  const actualJsonFiles = packedFiles.filter((file) => file.endsWith('.json')).sort();
  const unexpectedJson = actualJsonFiles.filter((file) => !reviewedJsonFiles.includes(file));
  const missingJson = reviewedJsonFiles.filter((file) => !actualJsonFiles.includes(file));
  if (unexpectedJson.length > 0 || missingJson.length > 0) {
    throw new Error(`JSON allowlist mismatch. Unexpected: ${unexpectedJson.join(', ') || '<none>'}. Missing: ${missingJson.join(', ') || '<none>'}.`);
  }

  const installRoot = join(verificationRoot, 'install');
  mkdirSync(installRoot, { recursive: true });
  writeFileSync(join(installRoot, 'package.json'), '{"private":true}\n');
  run(npmCommand, ['install', '--prefix', installRoot, tarballPath, '--ignore-scripts', '--no-audit', '--no-fund']);

  const installedRoot = join(installRoot, 'node_modules', 'delegate-team');
  for (const file of requiredFiles) {
    if (!existsSync(join(installedRoot, file))) {
      throw new Error(`installed artifact is missing: ${file}`);
    }
  }

  const dtPath = join(installRoot, 'node_modules', '.bin', dtExecutable);
  const versionResult = run(dtPath, ['--version'], { cwd: installRoot });
  run(dtPath, ['remote', '--help'], { cwd: installRoot });

  const packageJson = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
  console.log(`Package verification passed: ${packageJson.name}@${packageJson.version}, ${packedFiles.length} files, CLI ${versionResult.stdout.trim()}`);
  console.log(`Verification workspace: ${verificationRoot}`);
  console.log(`Packed artifact: ${tarballPath}`);
} catch (error) {
  console.error(`Package verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
