#!/usr/bin/env node
// Kubernetes evidence adapter for honest-arch-diagrams.
// Turns a Kubernetes JSON dump (a `List`, an array, or a single object, e.g.
// `kubectl get ingress,httproute,svc,endpoints,deploy -o json`) into a model where
// every element's `evidence` is derived from a real resource, not asserted by an LLM.
//
// Honesty guarantees:
//   - Only resource kinds/names and env/Secret *names* become evidence. Secret and
//     ConfigMap *values* are never read or emitted.
//   - Hostnames extracted from env values are stripped of any user:pass credentials.
//   - Nothing is invented: a hop appears only if its resource is present in the input.
//   - When `--app` is set, gateway/service/workload selection is scoped to that app so a
//     multi-service dump cannot become a multi-spine diagram.
//
// Usage:
//   node adapters/k8s/from-k8s.mjs <dump.json> [--app <name>] [--out <model.json>]

import { readFileSync, writeFileSync } from 'node:fs';

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

/** Datastore/auth/controller classification from a resource or env name. */
function kindOfName(name) {
  const s = String(name).toLowerCase();
  if (/redis|memcache|cache/.test(s)) return 'db';
  if (/postgres|psql|pg|mysql|maria|mongo|cassandra|dynamo|database|db/.test(s)) return 'db';
  if (/auth|oauth|oidc|keycloak|cognito/.test(s)) return 'auth';
  if (/prometheus|grafana|alertmanager|controller|operator/.test(s)) return 'controller';
  return 'service';
}

/** Human label; keeps well-known datastores tidy. */
function labelFor(name) {
  const s = String(name).toLowerCase();
  if (/redis/.test(s)) return 'Redis';
  if (/postgres|psql|(^|[-_])pg([-_]|$)/.test(s)) return 'Postgres';
  if (/mysql|maria/.test(s)) return 'MySQL';
  if (/mongo/.test(s)) return 'MongoDB';
  return String(name).replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

const looksLikeHost = (v) =>
  typeof v === 'string' && (/:\/\//.test(v) || /^[a-z0-9.-]+(:\d+)?$/i.test(v));

/** Hostname only, with any user:pass credentials removed. Never leaks secrets. */
function hostOnly(v) {
  try {
    if (/:\/\//.test(v)) return new URL(v).hostname;
  } catch { /* fall through */ }
  return String(v).replace(/^[^@/]*@/, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
}

function selectorMatches(labels, selector) {
  if (!labels || !selector) return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

function loadItems(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.items)) return input.items;
  return [input];
}

/** True if a resource name is the app or clearly belongs to it (prefix/contains). */
export function nameMatchesApp(name, app) {
  if (!app) return true;
  if (!name) return false;
  const n = String(name).toLowerCase();
  const a = String(app).toLowerCase();
  return n === a || n.startsWith(`${a}-`) || n.endsWith(`-${a}`) || n.includes(`-${a}-`) || n.includes(a);
}

function ingressBackendName(ing) {
  return ing?.spec?.rules?.[0]?.http?.paths?.[0]?.backend?.service?.name;
}

function httpRouteBackendName(hr) {
  return hr?.spec?.rules?.[0]?.backendRefs?.[0]?.name;
}

function pickForApp(list, app, scoreFn) {
  if (!list.length) return undefined;
  if (!app) return list[0];
  const scored = list
    .map((item) => ({ item, score: scoreFn(item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item;
}

export function fromK8s(input, opts = {}) {
  const items = loadItems(input);
  const app = opts.app;
  const byKind = (k) => items.filter((i) => i?.kind === k);
  const ingresses = byKind('Ingress');
  const httproutes = byKind('HTTPRoute');
  const services = byKind('Service');
  const endpointsList = byKind('Endpoints');
  const deployments = byKind('Deployment');
  const securityPolicies = byKind('SecurityPolicy');

  const hops = [];
  let svcName = app;

  // Prefer HTTPRoute when it matches the app; otherwise Ingress.
  const hr = pickForApp(httproutes, app, (r) => {
    let s = 0;
    if (nameMatchesApp(r.metadata?.name, app)) s += 2;
    if (nameMatchesApp(httpRouteBackendName(r), app)) s += 3;
    return s;
  });
  const ing = pickForApp(ingresses, app, (i) => {
    let s = 0;
    if (nameMatchesApp(i.metadata?.name, app)) s += 2;
    if (nameMatchesApp(ingressBackendName(i), app)) s += 3;
    return s;
  });

  if (hr) {
    const host = hr.spec?.hostnames?.[0];
    svcName = svcName || httpRouteBackendName(hr);
    if (host) hops.push({ id: 'dns', kind: 'dns', label: host, lane: 'Edge', evidence: `HTTPRoute ${hr.metadata.name} hostname` });
    hops.push({ id: 'httproute', kind: 'httproute', label: 'HTTPRoute', lane: 'Gateway', evidence: `HTTPRoute ${hr.metadata.name}` });
  } else if (ing) {
    const rule = ing.spec?.rules?.[0];
    const host = rule?.host;
    svcName = svcName || ingressBackendName(ing);
    if (host) hops.push({ id: 'dns', kind: 'dns', label: host, lane: 'Edge', evidence: `Ingress ${ing.metadata.name} host` });
    const tls = ing.spec?.tls?.[0];
    if (tls?.secretName) hops.push({ id: 'tls', kind: 'tls', label: 'TLS termination', lane: 'Edge', evidence: `Ingress TLS secret ${tls.secretName}` });
    hops.push({ id: 'ingress', kind: 'ingress', label: 'Ingress', lane: 'Gateway', evidence: `Ingress ${ing.metadata.name}` });
    if (ing.metadata?.annotations?.['nginx.ingress.kubernetes.io/auth-url']) {
      hops.push({ id: 'oauth', kind: 'oauth2_proxy', label: 'oauth2-proxy', lane: 'Identity', evidence: `Ingress ${ing.metadata.name} auth-url annotation` });
    }
  }

  // Gateway API SecurityPolicy extAuth → Identity hop (declared evidence)
  if (!hops.some((h) => h.id === 'oauth')) {
    const pol = pickForApp(securityPolicies, app, (p) => {
      let s = 0;
      if (nameMatchesApp(p.metadata?.name, app)) s += 2;
      const target = p.spec?.targetRef?.name;
      if (nameMatchesApp(target, app)) s += 3;
      return s;
    });
    const backend = pol?.spec?.extAuth?.http?.backendRefs?.[0]?.name
      ?? pol?.spec?.extAuth?.backendRefs?.[0]?.name;
    if (backend) {
      hops.push({
        id: 'oauth', kind: 'oauth2_proxy', label: 'oauth2-proxy', lane: 'Identity',
        evidence: `SecurityPolicy ${pol.metadata.name} extAuth ${backend}`,
      });
    }
  }

  // --- app service (strict when --app) ---
  const svc = pickForApp(services, app, (s) => (nameMatchesApp(s.metadata?.name, app) ? 3 : 0))
    || (!app ? services[0] : undefined)
    || services.find((s) => s.metadata?.name === svcName);
  if (svc) {
    svcName = svc.metadata.name;
    hops.push({ id: 'svc', kind: 'service', label: svcName, lane: 'App', evidence: `Service ${svcName}` });
  }

  // --- endpoints ---
  const ep = endpointsList.find((e) => e.metadata?.name === svcName);
  if (ep?.subsets?.length) {
    hops.push({ id: 'endpoints', kind: 'endpoints', label: 'Endpoints', lane: 'Workload', evidence: `Endpoints ${svcName}` });
  }

  // --- workload (Deployment behind the service) ---
  const appDeploy =
    deployments.find((d) => selectorMatches(d.spec?.selector?.matchLabels, svc?.spec?.selector)) ||
    pickForApp(deployments, app, (d) => (nameMatchesApp(d.metadata?.name, app) ? 3 : 0)) ||
    deployments.find((d) => d.metadata?.name === svcName);
  if (appDeploy) {
    hops.push({ id: 'pod', kind: 'pod', label: `${appDeploy.metadata.name} pod`, lane: 'Workload', evidence: `Deployment ${appDeploy.metadata.name}` });
  }

  // --- path edges over the present hops, in canonical order ---
  const order = ['dns', 'tls', 'ingress', 'httproute', 'oauth', 'svc', 'endpoints', 'pod'];
  const present = order.filter((id) => hops.some((h) => h.id === id));
  const edges = [];
  for (let i = 0; i < present.length - 1; i++) edges.push({ from: present[i], to: present[i + 1], path: true });

  const anchorId = ['svc', 'pod', 'endpoints', 'ingress', 'httproute'].find((id) => present.includes(id)) ?? present.at(-1);

  // --- companions ---
  const cap = opts.cap ?? 8;
  const companions = [];
  const seen = new Set();
  let omitted = 0;
  const addLinked = (id, label, kind, evidence) => {
    if (!anchorId || seen.has(id)) return;
    if (companions.length >= cap) { omitted += 1; return; }
    seen.add(id);
    companions.push({ id, kind, label, relation: 'linked', evidence, subtitle: 'uses', anchor: anchorId });
  };

  for (const c of appDeploy?.spec?.template?.spec?.containers ?? []) {
    for (const e of c.env ?? []) {
      const ref = e.valueFrom?.secretKeyRef?.name;
      if (ref) {
        addLinked(slug(ref), labelFor(ref), kindOfName(`${ref} ${e.name}`), `secret ${ref}`);
      } else if (looksLikeHost(e.value) || /_(HOST|URL|URI|ADDR|ENDPOINT)$/.test(e.name ?? '')) {
        // Skip version pins mistaken for hosts (e.g. APP_VERSION=abc123)
        if (/_VERSION$/i.test(e.name ?? '')) continue;
        addLinked(slug(e.name), labelFor(e.name), kindOfName(e.name), `env ${e.name}`);
      }
    }
    for (const ef of c.envFrom ?? []) {
      const ref = ef.secretRef?.name;
      if (ref) addLinked(slug(ref), labelFor(ref), kindOfName(ref), `secret ${ref}`);
    }
  }

  // around: other workloads co-located in the namespace, no connector.
  for (const d of deployments) {
    if (d === appDeploy) continue;
    const name = d.metadata.name;
    // When --app is set, skip other app deployments that match a different service name pattern
    // still include them as around (co-located) — that is honest. Keep as around.
    const id = slug(name);
    if (seen.has(id)) continue;
    seen.add(id);
    if (companions.length >= cap) { omitted += 1; continue; }
    companions.push({
      id, kind: kindOfName(name), label: labelFor(name),
      relation: 'around', evidence: `namespace ${d.metadata.namespace ?? 'default'}`, subtitle: 'release',
    });
  }

  const model = {
    app: opts.app || svcName || 'app',
    hops, edges, companions,
    caps: { companions: cap },
    evidenceStrength: 'runtime',
  };
  if (omitted > 0) model.overflow = { count: omitted, note: 'omitted after companion cap' };
  return model;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const appIdx = args.indexOf('--app');
  const outIdx = args.indexOf('--out');
  if (!file) {
    console.error('usage: node adapters/k8s/from-k8s.mjs <dump.json> [--app <name>] [--out <model.json>]');
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const model = fromK8s(input, { app: appIdx !== -1 ? args[appIdx + 1] : undefined });
  const json = JSON.stringify(model, null, 2);
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], `${json}\n`);
    console.error(`wrote ${args[outIdx + 1]}`);
  }
  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
