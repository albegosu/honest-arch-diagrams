#!/usr/bin/env node
// Golden tests for honest-arch-diagrams. Zero dependencies (Node 18+).
// Guards the invariants so they cannot silently regress as adapters land:
//   - every committed example model passes the honesty linter,
//   - the layout engine produces finite geometry and keeps Data under Workload,
//   - the k8s adapter derives evidence from real resources and never leaks a
//     Secret/ConfigMap value.
//
// Usage: node scripts/test.mjs   (exit 0 = all pass, 1 = any failure)

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintModel } from './lint.mjs';
import { layout } from './layout.mjs';
import { fromK8s } from '../adapters/k8s/from-k8s.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok  - ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` :: ${detail}` : ''}`);
  }
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

// --- 1. every example model lints clean ---
console.log('# examples lint clean');
const exDir = join(root, 'examples');
const models = readdirSync(exDir).filter((f) => f.endsWith('.model.json'));
check('at least two example models exist', models.length >= 2, `found ${models.length}`);
for (const f of models) {
  const errors = lintModel(readJson(join(exDir, f)));
  check(`${f} passes honesty lint`, errors.length === 0, errors.join('; '));
}

// --- 2. layout geometry is finite and keeps Data under Workload ---
console.log('# layout invariants');
for (const f of models) {
  const g = layout(readJson(join(exDir, f)));
  const coordsFinite = g.nodes.every((n) => [n.x, n.y, n.w, n.h].every(finite));
  const noNaNEdges = g.edges.every((e) => !/NaN/.test(e.d));
  check(`${f} layout has finite node coords`, coordsFinite);
  check(`${f} layout edges have no NaN`, noNaNEdges);

  const dataNodes = g.nodes.filter((n) => n.band === 'Data');
  if (dataNodes.length) {
    const workload = g.nodes.filter((n) => n.lane === 'Workload' && !n.satellite);
    const underWorkload = dataNodes.every((d) =>
      workload.some((w) => Math.abs(w.x - d.x) <= 1 && d.y > w.y));
    check(`${f} keeps Data band under Workload`, underWorkload && workload.length > 0);
  }
}

// --- 3. k8s adapter: real evidence, no leaked secret values ---
console.log('# k8s adapter (evidence + no leak)');
const fixturePath = join(root, 'adapters/k8s/fixtures/checkout.k8s.json');
const fixture = readJson(fixturePath);
const model = fromK8s(fixture);

check('adapter output lints clean', lintModel(model).length === 0, lintModel(model).join('; '));

const hopIds = new Set(model.hops.map((h) => h.id));
check('derives ingress hop', hopIds.has('ingress'));
check('derives service hop', hopIds.has('svc'));
check('derives workload (pod) hop', hopIds.has('pod'));

const linked = model.companions.filter((c) => c.relation === 'linked');
const around = model.companions.filter((c) => c.relation === 'around');
check('has at least one linked companion', linked.length >= 1);
check('has at least one around companion', around.length >= 1);
check(
  'every linked companion evidence is a real source (secret|env)',
  linked.every((c) => /^(secret|env) \S/.test(c.evidence)),
  linked.map((c) => c.evidence).join(' | '),
);
check(
  'around companions carry no connector (no anchor)',
  around.every((c) => !c.anchor),
);

// No leak: decode every Secret value in the fixture, assert none appear in the model.
const serialized = JSON.stringify(model);
const secretValues = [];
for (const item of fixture.items ?? []) {
  if (item.kind === 'Secret' && item.data) {
    for (const v of Object.values(item.data)) {
      secretValues.push(Buffer.from(String(v), 'base64').toString('utf8'));
    }
  }
}
check('fixture actually contains a secret value to test', secretValues.length >= 1);
for (const value of secretValues) {
  check(`secret value is never leaked into the model`, !serialized.includes(value), value);
}
// Belt and suspenders: the recognizable password token must be absent.
check('password token absent from model', !serialized.includes('SUPERSECRETPASS'));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s).`);
process.exit(failures === 0 ? 0 : 1);
