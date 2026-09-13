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
import { validateSchema } from './schema.mjs';
import { fromK8s } from '../adapters/k8s/from-k8s.mjs';
import { fromTerraform } from '../adapters/terraform/from-terraform.mjs';
import { fromOpenApi } from '../adapters/openapi/from-openapi.mjs';

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
  const model = readJson(join(exDir, f));
  check(`${f} matches the schema`, validateSchema(model).length === 0, validateSchema(model).join('; '));
  const errors = lintModel(model);
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
    // Data hangs under Workload when that lane exists, else under the deepest spine lane (App).
    const spineNodes = g.nodes.filter((n) => !n.satellite);
    const workload = spineNodes.filter((n) => n.lane === 'Workload');
    const anchorLane = workload.length ? workload : spineNodes.filter((n) => n.lane === 'App');
    const laneName = workload.length ? 'Workload' : 'App';
    const underAnchor = dataNodes.every((d) => anchorLane.some((w) => Math.abs(w.x - d.x) <= 1 && d.y > w.y));
    check(`${f} keeps Data band under ${laneName}`, underAnchor && anchorLane.length > 0);
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

// --- 4. the linter must REJECT dishonest (but schema-valid) models ---
console.log('# honesty rejections (negative tests)');
const spine = () => ({
  app: 'x',
  hops: [{ id: 'svc', kind: 'service', label: 'x', lane: 'App', evidence: 'Service x' }],
  edges: [],
  companions: [],
  caps: { companions: 8 },
});
const rejects = (name, mutate) => {
  const m = spine();
  mutate(m);
  check(name, lintModel(m).length > 0, 'expected at least one violation');
};
rejects('rejects companion count over the cap', (m) => {
  m.caps.companions = 1;
  m.companions.push(
    { id: 'a', kind: 'db', label: 'A', relation: 'around', evidence: 'ns', subtitle: 'release' },
    { id: 'b', kind: 'db', label: 'B', relation: 'around', evidence: 'ns', subtitle: 'release' },
  );
});
rejects('rejects a companion drawn on the accented path', (m) => {
  m.companions.push({ id: 'pg', kind: 'db', label: 'PG', relation: 'linked', evidence: 'secret pg', subtitle: 'uses', anchor: 'svc' });
  m.edges.push({ from: 'svc', to: 'pg', path: true });
});
rejects('rejects a linked companion with no anchor', (m) => {
  m.companions.push({ id: 'pg', kind: 'db', label: 'PG', relation: 'linked', evidence: 'secret pg', subtitle: 'uses' });
});
rejects('rejects a companion that duplicates a hop id', (m) => {
  m.companions.push({ id: 'svc', kind: 'db', label: 'PG', relation: 'linked', evidence: 'secret pg', subtitle: 'uses', anchor: 'svc' });
});

// --- 5. adapter derives an HTTPRoute spine (not just Ingress) ---
console.log('# k8s adapter (HTTPRoute branch)');
const httpRouteDump = {
  kind: 'List',
  items: [
    {
      kind: 'HTTPRoute',
      metadata: { name: 'orders', namespace: 'orders' },
      spec: { hostnames: ['orders.example.com'], rules: [{ backendRefs: [{ name: 'orders' }] }] },
    },
    { kind: 'Service', metadata: { name: 'orders', namespace: 'orders' }, spec: { selector: { app: 'orders' } } },
    {
      kind: 'Deployment',
      metadata: { name: 'orders', namespace: 'orders' },
      spec: {
        selector: { matchLabels: { app: 'orders' } },
        template: { metadata: { labels: { app: 'orders' } }, spec: { containers: [{ name: 'orders', env: [{ name: 'DB_HOST', value: 'mysql.orders.svc:3306' }] }] } },
      },
    },
  ],
};
const routeModel = fromK8s(httpRouteDump);
check('adapter output lints clean (httproute)', lintModel(routeModel).length === 0, lintModel(routeModel).join('; '));
check('derives an httproute hop', routeModel.hops.some((h) => h.kind === 'httproute'));
check('derives a linked companion from env host', routeModel.companions.some((c) => c.relation === 'linked' && /^env /.test(c.evidence)));

// --- 6. terraform adapter: edge spine + honest around/linked split, no leaked values ---
console.log('# terraform adapter (around by default, linked on reference)');
const tfDump = readJson(join(root, 'adapters/terraform/fixtures/orders-edge.tfshow.json'));
const tfModel = fromTerraform(tfDump);
check('terraform output lints clean', lintModel(tfModel).length === 0, lintModel(tfModel).join('; '));
const tfHopKinds = new Set(tfModel.hops.map((h) => h.kind));
check('derives an edge spine (dns + tls + ingress + service)', ['dns', 'tls', 'ingress', 'service'].every((k) => tfHopKinds.has(k)));
const referencedDb = tfModel.companions.find((c) => c.id === 'aws-db-instance-orders');
const unreferencedCache = tfModel.companions.find((c) => c.id === 'aws-elasticache-cluster-sessions');
check('referenced datastore is promoted to linked', referencedDb?.relation === 'linked', referencedDb?.relation);
check('unreferenced datastore stays around (co-located only)', unreferencedCache?.relation === 'around', unreferencedCache?.relation);
check('terraform never leaks a resource value (password)', !JSON.stringify(tfModel).includes('TFSECRETPW'));

// --- 7. openapi adapter: declared spine + x-depends-on only ---
console.log('# openapi adapter (declared contract only)');
const oapiDoc = readJson(join(root, 'adapters/openapi/fixtures/orders.openapi.json'));
const oapiModel = fromOpenApi(oapiDoc);
check('openapi output lints clean', lintModel(oapiModel).length === 0, lintModel(oapiModel).join('; '));
const oapiKinds = new Set(oapiModel.hops.map((h) => h.kind));
check('derives dns + identity + service from the contract', ['dns', 'oauth2_proxy', 'service'].every((k) => oapiKinds.has(k)));
check('every companion comes from x-depends-on (nothing inferred)', oapiModel.companions.length === (oapiDoc['x-depends-on']?.length ?? 0));
check('x-depends-on companions are linked to the service', oapiModel.companions.every((c) => c.relation === 'linked' && c.anchor === 'svc'));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s).`);
process.exit(failures === 0 ? 0 : 1);
