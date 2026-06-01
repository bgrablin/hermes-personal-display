#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const trackerPath = path.join(projectRoot, 'tests', 'fixtures', 'puppet-layer', 'recommendation-status.json');
const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function evidenceExists(item) {
  const [rel, pattern] = item.split('::');
  if (!rel || !pattern) return false;
  const filePath = path.join(projectRoot, rel);
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, 'utf8').includes(pattern);
}

const recommendations = tracker.recommendations || {};
const keys = Object.keys(recommendations);
assert(keys.length === 14, `Expected exactly 14 puppet-layer recommendation entries; found ${keys.length}.`);

const allowed = new Set(['implemented', 'partial', 'deferred']);
const requiredPrefixes = Array.from({ length: 14 }, (_, i) => `${i + 1}_`);
for (const prefix of requiredPrefixes) {
  assert(keys.some((key) => key.startsWith(prefix)), `Missing recommendation ${prefix.replace('_', '')}.`);
}

for (const key of keys.sort()) {
  const rec = recommendations[key];
  assert(rec && typeof rec === 'object', `${key} must be an object.`);
  assert(allowed.has(rec.status), `${key} has invalid status ${rec.status}.`);
  assert(Array.isArray(rec.evidence) && rec.evidence.length > 0, `${key} must list at least one evidence pattern.`);
  if (rec.status === 'partial' || rec.status === 'deferred') {
    assert(typeof rec.rationale === 'string' && rec.rationale.length >= 40, `${key} ${rec.status} status needs a concrete rationale.`);
  }
  for (const item of rec.evidence) {
    assert(evidenceExists(item), `${key} evidence not found: ${item}`);
  }
  console.log(`${rec.status.toUpperCase()} ${key}`);
}

const roadmapPath = path.join(projectRoot, tracker.roadmap);
assert(fs.existsSync(roadmapPath), `Roadmap missing: ${tracker.roadmap}`);
const roadmap = fs.readFileSync(roadmapPath, 'utf8');
for (let i = 1; i <= 14; i += 1) {
  assert(roadmap.includes(`- [ ] ${i}.`) || roadmap.includes(`- [x] ${i}.`) || roadmap.includes(`- [/] ${i}.`), `Roadmap missing checklist item ${i}.`);
}

console.log('OK puppet-layer recommendation tracker checks.');
