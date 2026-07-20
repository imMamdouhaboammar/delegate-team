#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';

const EXPECTED_ENGINE = '>=24';
const EXPECTED_MAJORS = [24];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function fail(message) {
  console.error(`Node support contract failed: ${message}`);
  process.exitCode = 1;
}

function numbersNear(path, marker) {
  const source = read(path);
  const start = source.indexOf(marker);
  if (start === -1) {
    fail(`${path} does not contain ${JSON.stringify(marker)}`);
    return [];
  }
  return [...source.slice(start, start + 240).matchAll(/\b(\d+)(?:\.x)?\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 10 && value <= 99);
}

function assertMatrix(path, marker) {
  const actual = [...new Set(numbersNear(path, marker))].sort((a, b) => a - b);
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_MAJORS)) {
    fail(`${path} matrix is [${actual.join(', ')}], expected [${EXPECTED_MAJORS.join(', ')}]`);
  }
}

const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));

if (packageJson.engines?.node !== EXPECTED_ENGINE) {
  fail(`package.json engines.node is ${JSON.stringify(packageJson.engines?.node)}`);
}
if (packageLock.packages?.['']?.engines?.node !== EXPECTED_ENGINE) {
  fail(`package-lock.json root engines.node is ${JSON.stringify(packageLock.packages?.['']?.engines?.node)}`);
}
if (packageJson.scripts?.['node-support:check'] !== 'node scripts/check-node-support.mjs') {
  fail('package.json must expose npm run node-support:check');
}
if (!packageJson.scripts?.['release:verify']?.includes('npm run node-support:check')) {
  fail('release:verify must include the Node support contract');
}

assertMatrix('.github/workflows/ci.yml', 'node-version:');
assertMatrix('.github/workflows/quality-gate.yml', 'matrix:\n        node:');

const workflowNames = readdirSync(new URL('../.github/workflows/', import.meta.url))
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
for (const name of workflowNames) {
  const active = read(`.github/workflows/${name}`)
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  const unsupported = active.match(/node-version:\s*['"]?(20|22)(?:\.x)?/);
  if (unsupported) {
    fail(`${name} uses unsupported Node ${unsupported[1]}`);
  }
}

const installation = read('docs/INSTALLATION.md');
const architecture = read('docs/ARCHITECTURE.md');
if (!installation.includes('| Node.js | `>=24` |')) {
  fail('docs/INSTALLATION.md must declare Node.js >=24');
}
if (!installation.includes('CI tests Node 24')) {
  fail('docs/INSTALLATION.md must state that CI tests Node 24');
}
if (!architecture.includes('Node ≥ 24 for the `dt` CLI.')) {
  fail('docs/ARCHITECTURE.md must declare Node >=24');
}

const runtimeMajor = Number(process.versions.node.split('.')[0]);
if (runtimeMajor < 24) {
  fail(`current runtime is Node ${process.versions.node}; Node 24 or newer is required`);
}

if (!process.exitCode) {
  console.log(`Node support contract is aligned: ${EXPECTED_ENGINE}; CI tests Node 24.`);
}
