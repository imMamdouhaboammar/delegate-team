#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const EXPECTED_ENGINE = '>=20';
const EXPECTED_MAJORS = [20, 22, 24];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function fail(message) {
  console.error(`Node support contract failed: ${message}`);
  process.exitCode = 1;
}

function extractNumbers(block) {
  return [...block.matchAll(/\b(\d+)(?:\.x)?\b/g)].map((match) => Number(match[1]));
}

function assertMatrix(path, marker, expected) {
  const source = read(path);
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    fail(`${path} does not contain ${JSON.stringify(marker)}`);
    return;
  }

  const block = source.slice(markerIndex, markerIndex + 260);
  const actual = [...new Set(extractNumbers(block).filter((value) => value >= 10 && value <= 99))].sort((a, b) => a - b);
  const wanted = [...expected].sort((a, b) => a - b);

  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${path} matrix is [${actual.join(', ')}], expected [${wanted.join(', ')}]`);
  }
}

const packageJson = JSON.parse(read('package.json'));
if (packageJson.engines?.node !== EXPECTED_ENGINE) {
  fail(`package.json engines.node is ${JSON.stringify(packageJson.engines?.node)}, expected ${JSON.stringify(EXPECTED_ENGINE)}`);
}

assertMatrix('.github/workflows/ci.yml', 'node-version:', EXPECTED_MAJORS);
assertMatrix('.github/workflows/quality-gate.yml', 'matrix:', EXPECTED_MAJORS);

const installation = read('docs/INSTALLATION.md');
if (!installation.includes('| Node.js | `>=20` |')) {
  fail('docs/INSTALLATION.md must declare Node.js >=20');
}
if (!installation.includes('CI matrix tests Node 20, 22, and 24')) {
  fail('docs/INSTALLATION.md must list the tested Node majors');
}

if (!process.exitCode) {
  console.log(`Node support contract is aligned: ${EXPECTED_ENGINE}; CI tests ${EXPECTED_MAJORS.join(', ')}.`);
}
