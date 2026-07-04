#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

const pkg = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

expectEqual('.claude-plugin/plugin.json version', plugin.version, pkg.version);
expectEqual('.claude-plugin/marketplace.json version', marketplace.version, pkg.version);

if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
  errors.push('.claude-plugin/marketplace.json plugins must be a non-empty array');
} else {
  for (const entry of marketplace.plugins) {
    expectEqual(`marketplace plugin ${entry.name || '<unnamed>'} version`, entry.version, pkg.version);
  }
}

if (!changelog.includes(`## [${pkg.version}]`)) {
  errors.push(`CHANGELOG.md missing entry for ${pkg.version}`);
}

const lockPath = join(root, 'package-lock.json');
if (existsSync(lockPath)) {
  const lock = readJson('package-lock.json');
  if (lock.version !== pkg.version) {
    warnings.push(`package-lock.json root version is ${lock.version}, package.json is ${pkg.version}. Run: npm install --package-lock-only`);
  }
  const rootPackage = lock.packages?.[''];
  if (rootPackage?.version && rootPackage.version !== pkg.version) {
    warnings.push(`package-lock.json packages[""].version is ${rootPackage.version}, package.json is ${pkg.version}. Run: npm install --package-lock-only`);
  }
}

if (warnings.length > 0) {
  console.warn('Version sync warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('Version sync errors:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Version sync ok for ${pkg.name}@${pkg.version}`);
