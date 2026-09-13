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
import { fromGitops } from '../adapters/gitops/from-gitops.mjs';
import { fromTrace } from '../adapters/trace/from-trace.mjs';
import { toD2 } from './to-d2.mjs';
import { parseJsonOrYaml } from './yaml.mjs';
import { spawnSync } from 'node:child_process';
const skillRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(skillRoot, '..', '..');
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
const exDir = join(repoRoot, 'examples');
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
const fixturePath = join(skillRoot, 'adapters/k8s/fixtures/checkout.k8s.json');
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
const tfDump = readJson(join(skillRoot, 'adapters/terraform/fixtures/orders-edge.tfshow.json'));
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
const oapiDoc = readJson(join(skillRoot, 'adapters/openapi/fixtures/orders.openapi.json'));
const oapiModel = fromOpenApi(oapiDoc);
check('openapi output lints clean', lintModel(oapiModel).length === 0, lintModel(oapiModel).join('; '));
const oapiKinds = new Set(oapiModel.hops.map((h) => h.kind));
check('derives dns + identity + service from the contract', ['dns', 'oauth2_proxy', 'service'].every((k) => oapiKinds.has(k)));
check('every companion comes from x-depends-on (nothing inferred)', oapiModel.companions.length === (oapiDoc['x-depends-on']?.length ?? 0));
check('x-depends-on companions are linked to the service', oapiModel.companions.every((c) => c.relation === 'linked' && c.anchor === 'svc'));

// --- 8. overflow: adapters trim to cap and layout draws +N more ---
console.log('# overflow (cap + summary card)');
const capped = fromOpenApi({
  openapi: '3.0.3',
  info: { title: 'Cap Demo' },
  servers: [{ url: 'https://cap.example.com' }],
  'x-depends-on': [
    { name: 'A', kind: 'service' },
    { name: 'B', kind: 'db' },
    { name: 'C', kind: 'cloud' },
  ],
}, { cap: 2 });
check('adapter trims companions to the cap', capped.companions.length === 2, `got ${capped.companions.length}`);
check('adapter reports omitted count in overflow', capped.overflow?.count === 1, JSON.stringify(capped.overflow));
check('capped adapter output still lints clean', lintModel(capped).length === 0, lintModel(capped).join('; '));
const overflowGeom = layout({
  app: 'x',
  hops: [{ id: 'svc', kind: 'service', label: 'x', lane: 'App', evidence: 'Service x' }],
  edges: [],
  companions: [],
  caps: { companions: 8 },
  overflow: { count: 3, note: 'omitted after companion cap' },
});
check(
  'layout draws a +N more overflow card',
  overflowGeom.nodes.some((n) => n.id === '__overflow' && n.label === '+3 more'),
  overflowGeom.nodes.map((n) => n.label).join(', '),
);

// --- 9. to-d2: accented spine + dashed linked companions ---
console.log('# to-d2 generator');
const checkoutModel = readJson(join(repoRoot, 'examples/checkout-service.model.json'));
const d2 = toD2(checkoutModel);
check('to-d2 emits direction: right', /direction:\s*right/.test(d2));
check('to-d2 accents the verified path', /stroke:\s*\$\{accent\}/.test(d2));
check('to-d2 draws linked companions dashed', /Postgres[\s\S]*stroke-dash:\s*3/.test(d2) || /data\.pg[\s\S]*stroke-dash:\s*3/i.test(d2) || /secret DATABASE_URL[\s\S]*stroke-dash:\s*3/.test(d2));
check('to-d2 puts around companions in Release band', /Also in this release/.test(d2) && /Prometheus/.test(d2));
check('to-d2 never invents hops missing from the model', !/RedisX|fakething/i.test(d2));

// --- 10. openapi YAML (same evidence as JSON fixture) ---
console.log('# openapi YAML');
const oapiYamlPath = join(skillRoot, 'adapters/openapi/fixtures/orders.openapi.yaml');
const oapiYamlDoc = parseJsonOrYaml(readFileSync(oapiYamlPath, 'utf8'), oapiYamlPath);
const oapiYamlModel = fromOpenApi(oapiYamlDoc);
check('yaml openapi parses to an object', oapiYamlDoc && !Array.isArray(oapiYamlDoc) && oapiYamlDoc.openapi);
check('yaml openapi output lints clean', lintModel(oapiYamlModel).length === 0, lintModel(oapiYamlModel).join('; '));
check('yaml openapi matches json companion count', oapiYamlModel.companions.length === oapiModel.companions.length);
check('yaml openapi derives dns + identity + service', ['dns', 'oauth2_proxy', 'service'].every((k) => oapiYamlModel.hops.some((h) => h.kind === k)));

// --- 11. gitops adapter (YAML manifests + optional values) ---
console.log('# gitops adapter');
const gitopsDir = join(skillRoot, 'adapters/gitops/fixtures/checkout');
const gitopsModel = fromGitops(join(gitopsDir, 'manifests.yaml'), {
  app: 'checkout',
  valuesPath: join(gitopsDir, 'values.yaml'),
});
check('gitops output lints clean', lintModel(gitopsModel).length === 0, lintModel(gitopsModel).join('; '));
check('gitops derives ingress + svc + pod', ['ingress', 'svc', 'pod'].every((id) => gitopsModel.hops.some((h) => h.id === id)));
check('gitops linked from env/secret in manifests', gitopsModel.companions.some((c) => c.relation === 'linked' && /^(secret|env) /.test(c.evidence)));
check('gitops around includes co-located prometheus', gitopsModel.companions.some((c) => c.relation === 'around' && /prom/i.test(c.label)));
check(
  'gitops values add PAYMENTS_URL as linked (name only)',
  gitopsModel.companions.some((c) => c.evidence === 'values PAYMENTS_URL' && c.relation === 'linked'),
);
check('gitops never emits APP_VERSION as a companion', !gitopsModel.companions.some((c) => /VERSION/i.test(c.id) || /VERSION/i.test(c.evidence)));
check('gitops never leaks values host strings as secret material', !JSON.stringify(gitopsModel).includes('SUPERSECRET'));

// --- 12. k8s --app filter (multi-service dump → one spine) ---
console.log('# k8s --app filter');
const multi = readJson(join(skillRoot, 'adapters/k8s/fixtures/multi-app.k8s.json'));
const front = fromK8s(multi, { app: 'frontend' });
const back = fromK8s(multi, { app: 'backend' });
check('frontend model lints clean', lintModel(front).length === 0, lintModel(front).join('; '));
check('backend model lints clean', lintModel(back).length === 0, lintModel(back).join('; '));
check('frontend spine service is frontend', front.hops.find((h) => h.id === 'svc')?.label === 'frontend');
check('backend spine service is backend', back.hops.find((h) => h.id === 'svc')?.label === 'backend');
check('frontend dns is frontend host', front.hops.find((h) => h.id === 'dns')?.label === 'frontend.example.com');
check('backend dns is backend host', back.hops.find((h) => h.id === 'dns')?.label === 'backend.example.com');
check(
  'frontend does not put backend on the accented path',
  !front.edges.some((e) => e.path && (e.from === 'backend' || e.to === 'backend'))
    && !front.hops.some((h) => h.id === 'svc' && h.label === 'backend'),
);
check(
  'other app appears as around (or linked via env), not a second svc hop',
  front.hops.filter((h) => h.kind === 'service').length === 1
    && (front.companions.some((c) => /backend/i.test(c.label) || /backend/i.test(c.id)) || front.companions.some((c) => /PYTHON_BACKEND/.test(c.evidence))),
);

// --- 13. trace adapter (runtime path evidence) ---
console.log('# trace adapter');
const traceFix = readJson(join(skillRoot, 'adapters/trace/fixtures/checkout.trace.json'));
const traceModel = fromTrace(traceFix, { app: 'checkout' });
check('trace output lints clean', lintModel(traceModel).length === 0, lintModel(traceModel).join('; '));
check('trace derives dns + tls + service', ['dns', 'tls', 'service'].every((k) => traceModel.hops.some((h) => h.kind === k)));
check('trace linked companions from CLIENT spans', traceModel.companions.filter((c) => c.relation === 'linked').length >= 2);
check('trace around only same k8s namespace', traceModel.companions.some((c) => c.relation === 'around' && /prometheus/i.test(c.label)));
check('trace omits other-namespace services from around', !traceModel.companions.some((c) => /payments/i.test(c.label)));
check('trace evidence never invents ingress', !traceModel.hops.some((h) => h.kind === 'ingress' || h.kind === 'httproute'));

// OTel-shaped export (resourceSpans)
const otelShaped = {
  resourceSpans: [{
    resource: { attributes: [
      { key: 'service.name', value: { stringValue: 'orders' } },
      { key: 'k8s.namespace.name', value: { stringValue: 'orders' } },
    ] },
    scopeSpans: [{
      spans: [
        {
          name: 'GET /orders', kind: 2,
          attributes: [
            { key: 'http.host', value: { stringValue: 'orders.example.com' } },
            { key: 'http.scheme', value: { stringValue: 'https' } },
          ],
        },
        {
          name: 'HTTP GET', kind: 3,
          attributes: [
            { key: 'peer.service', value: { stringValue: 'payments' } },
            { key: 'http.url', value: { stringValue: 'https://user:SECRET@payments.example.com/charge' } },
          ],
        },
      ],
    }],
  }],
};
const otelModel = fromTrace(otelShaped, { app: 'orders' });
check('otel-shaped export lints clean', lintModel(otelModel).length === 0, lintModel(otelModel).join('; '));
check('otel never leaks URL credentials', !JSON.stringify(otelModel).includes('SECRET') && !JSON.stringify(otelModel).includes('user:'));
check('otel linked peer from CLIENT span', otelModel.companions.some((c) => c.relation === 'linked' && /payments/i.test(c.label)));

// --- 14. CLI router ---
console.log('# cli router');
const cliPath = join(skillRoot, 'scripts/cli.mjs');
const help = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
check('cli --help exits 0', help.status === 0);
check('cli --help lists from-trace', /from-trace/.test(help.stdout + help.stderr));
const cliLint = spawnSync(process.execPath, [cliPath, 'lint', join(repoRoot, 'examples/checkout-from-trace.model.json')], { encoding: 'utf8' });
check('cli lint checkout-from-trace passes', cliLint.status === 0, cliLint.stderr || cliLint.stdout);

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s).`);
process.exit(failures === 0 ? 0 : 1);
