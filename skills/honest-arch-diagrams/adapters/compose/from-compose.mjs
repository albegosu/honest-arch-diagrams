#!/usr/bin/env node
// Docker Compose evidence adapter for honest-arch-diagrams.
// Turns a docker-compose.yml / compose.yaml into a model.
//
// Honesty stance — Compose proves services are *declared* and that depends_on /
// env host keys exist. It does NOT prove an HTTP request path, so:
//   - Spine is a single App service hop for --app (no invented dns/tls/ingress/oauth).
//   - depends_on / links → linked companions (evidence names the dependency).
//   - Env keys *_HOST / *_URL / *_URI / *_ADDR / *_ENDPOINT → linked by key name only
//     (never emit credential-bearing values).
//   - Other services in the same file → around (co-located by compose file).
//
// Usage:
//   node adapters/compose/from-compose.mjs <compose.yaml> [--app <service>] [--out <model.json>]

import { readFileSync, writeFileSync } from 'node:fs';
import { parseJsonOrYaml } from '../../scripts/yaml.mjs';

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

function kindOfName(name) {
  const s = String(name).toLowerCase();
  if (/redis|memcache|cache/.test(s)) return 'db';
  if (/postgres|psql|pg|mysql|maria|mongo|cassandra|dynamo|database|db/.test(s)) return 'db';
  if (/auth|oauth|oidc|keycloak|cognito/.test(s)) return 'auth';
  if (/prometheus|grafana|alertmanager|controller|operator/.test(s)) return 'controller';
  return 'service';
}

function labelFor(name) {
  const s = String(name).toLowerCase();
  if (/redis/.test(s)) return 'Redis';
  if (/postgres|psql|(^|[-_])pg([-_]|$)/.test(s)) return 'Postgres';
  if (/mysql|maria/.test(s)) return 'MySQL';
  if (/mongo/.test(s)) return 'MongoDB';
  return String(name).replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function hostLikeKey(k) {
  return /_(HOST|URL|URI|ADDR|ENDPOINT)$/i.test(k) && !/_VERSION$/i.test(k);
}

/** Normalize depends_on: list of names, or map of name → condition object. */
function dependsOnNames(dep) {
  if (!dep) return [];
  if (Array.isArray(dep)) {
    return dep.filter((d) => typeof d === 'string' && d.length > 0);
  }
  if (typeof dep === 'object') return Object.keys(dep);
  return [];
}

function envEntries(env) {
  if (!env) return [];
  if (Array.isArray(env)) {
    const out = [];
    for (const item of env) {
      if (typeof item === 'string') {
        const eq = item.indexOf('=');
        if (eq === -1) out.push([item, null]);
        else out.push([item.slice(0, eq), item.slice(eq + 1)]);
      } else if (item && typeof item === 'object') {
        for (const [k, v] of Object.entries(item)) out.push([k, v]);
      }
    }
    return out;
  }
  if (typeof env === 'object') return Object.entries(env);
  return [];
}

export function fromCompose(doc, opts = {}) {
  const services = doc?.services && typeof doc.services === 'object' ? doc.services : {};
  const names = Object.keys(services);
  if (!names.length) {
    throw new Error('compose file has no services');
  }

  let app = opts.app;
  if (!app) {
    if (names.length === 1) app = names[0];
    else throw new Error(`compose has ${names.length} services; pass --app <service>`);
  }
  if (!services[app]) {
    throw new Error(`service "${app}" not found in compose (have: ${names.join(', ')})`);
  }

  const svc = services[app];
  let evidence = `compose service ${app}`;
  if (svc.image) evidence = `compose service ${app} image`;
  else if (svc.build) evidence = `compose service ${app} build`;

  const hops = [
    { id: 'svc', kind: 'service', label: app, lane: 'App', evidence },
  ];
  const edges = [];

  const cap = opts.cap ?? 8;
  const companions = [];
  const seen = new Set();
  let omitted = 0;

  const addLinked = (id, label, kind, evidenceStr) => {
    if (seen.has(id)) return;
    if (companions.length >= cap) { omitted += 1; return; }
    seen.add(id);
    companions.push({
      id, kind, label, relation: 'linked', evidence: evidenceStr, subtitle: 'uses', anchor: 'svc',
    });
  };

  for (const dep of dependsOnNames(svc.depends_on)) {
    if (dep === app) continue;
    addLinked(slug(dep), labelFor(dep), kindOfName(dep), `compose depends_on ${dep}`);
  }
  for (const link of svc.links ?? []) {
    const name = String(link).split(':')[0];
    if (!name || name === app) continue;
    addLinked(slug(name), labelFor(name), kindOfName(name), `compose links ${name}`);
  }

  for (const [key] of envEntries(svc.environment)) {
    if (!hostLikeKey(key)) continue;
    addLinked(slug(key), labelFor(key), kindOfName(key), `env ${key}`);
  }

  for (const name of names) {
    if (name === app) continue;
    const id = slug(name);
    if (seen.has(id)) continue;
    seen.add(id);
    if (companions.length >= cap) { omitted += 1; continue; }
    companions.push({
      id, kind: kindOfName(name), label: labelFor(name),
      relation: 'around', evidence: 'compose file', subtitle: 'release',
    });
  }

  const model = {
    app,
    hops,
    edges,
    companions,
    caps: { companions: cap },
    evidenceStrength: 'declared',
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
    console.error('usage: node adapters/compose/from-compose.mjs <compose.yaml> [--app <service>] [--out <model.json>]');
    process.exit(1);
  }
  const doc = parseJsonOrYaml(readFileSync(file, 'utf8'), file);
  if (!doc || Array.isArray(doc)) {
    console.error('expected a single Compose document');
    process.exit(1);
  }
  let model;
  try {
    model = fromCompose(doc, { app: appIdx !== -1 ? args[appIdx + 1] : undefined });
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
  const json = JSON.stringify(model, null, 2);
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], `${json}\n`);
    console.error(`wrote ${args[outIdx + 1]}`);
  }
  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
