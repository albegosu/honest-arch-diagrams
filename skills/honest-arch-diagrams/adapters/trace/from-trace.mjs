#!/usr/bin/env node
// Trace evidence adapter for honest-arch-diagrams.
// Turns an observed request path (OpenTelemetry JSON export or a simplified span list)
// into a model. Trace evidence is runtime: spans prove a hop was *observed*, not merely
// declared.
//
// Honesty guarantees:
//   - Spine hops come only from SERVER/CONSUMER spans of the target app (or explicit
//     http.host / service.name on those spans). No ingress/oauth hop is invented from a
//     span *name* alone.
//   - Linked companions come only from CLIENT/PRODUCER spans with peer/db/messaging attrs.
//   - Other services that appear as resources in the same export become `around` only when
//     they share a k8s.namespace.name (or service.namespace) with the app — co-location
//     evidence. Otherwise they are omitted (a different app's model).
//   - Attribute *values* that look like credentials (user:pass in URLs) are stripped to
//     hostnames for labels; never emitted as evidence strings.
//
// Usage:
//   node adapters/trace/from-trace.mjs <trace.json> [--app <name>] [--out <model.json>]

import { readFileSync, writeFileSync } from 'node:fs';

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

function kindOfPeer(name, attrs = {}) {
  const s = `${name} ${attrs['db.system'] ?? ''} ${attrs['messaging.system'] ?? ''}`.toLowerCase();
  if (/redis|memcache|cache/.test(s)) return 'db';
  if (/postgres|psql|mysql|maria|mongo|cassandra|dynamo|sql|db/.test(s)) return 'db';
  if (/auth|oauth|oidc|keycloak|cognito/.test(s)) return 'auth';
  if (/s3|sqs|sns|kafka|pubsub|storage/.test(s)) return 'cloud';
  return 'service';
}

function labelFor(name, attrs = {}) {
  if (attrs['db.system']) {
    const d = String(attrs['db.system']).toLowerCase();
    if (/redis/.test(d)) return 'Redis';
    if (/postgres|postgresql/.test(d)) return 'Postgres';
    if (/mysql|maria/.test(d)) return 'MySQL';
    if (/mongo/.test(d)) return 'MongoDB';
    return String(attrs['db.system']).replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return String(name).replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Flatten OTel attribute array or pass through a plain object. */
function attrsOf(span) {
  if (span.attributes && !Array.isArray(span.attributes) && typeof span.attributes === 'object') {
    return { ...span.attributes };
  }
  const out = {};
  for (const a of span.attributes ?? []) {
    const v = a.value ?? {};
    out[a.key] = v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue ?? a.value;
  }
  return out;
}

function resourceAttrs(resource) {
  if (!resource) return {};
  if (resource.attributes && !Array.isArray(resource.attributes)) return { ...resource.attributes };
  const out = {};
  for (const a of resource.attributes ?? []) {
    const v = a.value ?? {};
    out[a.key] = v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue ?? a.value;
  }
  return out;
}

function hostOnly(v) {
  if (v == null) return '';
  const s = String(v);
  try {
    if (/:\/\//.test(s)) return new URL(s).hostname;
  } catch { /* fall through */ }
  return s.replace(/^[^@/]*@/, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
}

function spanKind(span) {
  const k = span.kind ?? span.span_kind ?? span.spanKind;
  if (typeof k === 'number') {
    // OTel proto: 1 INTERNAL, 2 SERVER, 3 CLIENT, 4 PRODUCER, 5 CONSUMER
    return ({ 2: 'SERVER', 3: 'CLIENT', 4: 'PRODUCER', 5: 'CONSUMER' })[k] ?? 'INTERNAL';
  }
  const s = String(k ?? 'INTERNAL').toUpperCase().replace(/^SPAN_KIND_/, '');
  return s;
}

/**
 * Normalize input into { app?, spans: [{ name, kind, service, attributes, resource }] }.
 * Accepts:
 *   - simplified { app, spans: [...] }
 *   - OTel { resourceSpans: [...] }
 */
export function loadTrace(input) {
  if (Array.isArray(input?.spans)) {
    return {
      app: input.app,
      spans: input.spans.map((s) => ({
        name: s.name ?? s.operationName ?? 'span',
        kind: spanKind(s),
        service: s.service ?? s.serviceName ?? input.app,
        attributes: attrsOf(s),
        resource: s.resource ?? {},
      })),
    };
  }

  const spans = [];
  let appHint;
  for (const rs of input?.resourceSpans ?? []) {
    const res = resourceAttrs(rs.resource);
    const service = res['service.name'] ?? res['serviceName'];
    if (service && !appHint) appHint = service;
    for (const ss of rs.scopeSpans ?? rs.instrumentationLibrarySpans ?? []) {
      for (const span of ss.spans ?? []) {
        spans.push({
          name: span.name ?? 'span',
          kind: spanKind(span),
          service,
          attributes: attrsOf(span),
          resource: res,
        });
      }
    }
  }
  return { app: input?.app ?? appHint, spans };
}

function nameMatchesApp(name, app) {
  if (!app) return true;
  if (!name) return false;
  const n = String(name).toLowerCase();
  const a = String(app).toLowerCase();
  return n === a || n.startsWith(`${a}-`) || n.endsWith(`-${a}`) || n.includes(a);
}

export function fromTrace(input, opts = {}) {
  const loaded = loadTrace(input);
  const app = opts.app || loaded.app || 'app';
  const appSpans = loaded.spans.filter((s) => nameMatchesApp(s.service, app));
  const hops = [];

  // --- Edge: host from SERVER span http attrs ---
  const server = appSpans.find((s) => s.kind === 'SERVER' || s.kind === 'CONSUMER') ?? appSpans[0];
  const hostRaw =
    server?.attributes?.['http.host']
    ?? server?.attributes?.['server.address']
    ?? (server?.attributes?.['url.full'] ? hostOnly(server.attributes['url.full']) : undefined)
    ?? (server?.attributes?.['http.url'] ? hostOnly(server.attributes['http.url']) : undefined);
  if (hostRaw) {
    hops.push({
      id: 'dns', kind: 'dns', label: hostOnly(hostRaw) || String(hostRaw), lane: 'Edge',
      evidence: `trace span ${server.name} http.host`,
    });
  }

  const scheme =
    server?.attributes?.['url.scheme']
    ?? server?.attributes?.['http.scheme']
    ?? (String(server?.attributes?.['http.url'] ?? server?.attributes?.['url.full'] ?? '').startsWith('https') ? 'https' : undefined);
  if (scheme === 'https' || server?.attributes?.['tls.protocol.name']) {
    hops.push({
      id: 'tls', kind: 'tls', label: 'TLS termination', lane: 'Edge',
      evidence: `trace span ${server?.name ?? 'server'} https`,
    });
  }

  // App service hop — always, from the target app identity
  hops.push({
    id: 'svc', kind: 'service', label: app, lane: 'App',
    evidence: server
      ? `trace service.name ${server.service ?? app}`
      : `trace app ${app}`,
  });

  const order = ['dns', 'tls', 'svc'];
  const present = order.filter((id) => hops.some((h) => h.id === id));
  const edges = [];
  for (let i = 0; i < present.length - 1; i++) edges.push({ from: present[i], to: present[i + 1], path: true });

  const cap = opts.cap ?? 8;
  const companions = [];
  const seen = new Set();
  let omitted = 0;
  const addLinked = (id, label, kind, evidence) => {
    if (seen.has(id)) return;
    if (companions.length >= cap) { omitted += 1; return; }
    seen.add(id);
    companions.push({ id, kind, label, relation: 'linked', evidence, subtitle: 'uses', anchor: 'svc' });
  };

  for (const s of appSpans) {
    if (s.kind !== 'CLIENT' && s.kind !== 'PRODUCER') continue;
    const a = s.attributes;
    const peer =
      a['peer.service']
      ?? a['db.system']
      ?? a['net.peer.name']
      ?? a['server.address']
      ?? a['messaging.destination']
      ?? (a['http.url'] || a['url.full'] ? hostOnly(a['http.url'] || a['url.full']) : null);
    if (!peer) continue;
    const id = slug(peer);
    addLinked(id, labelFor(peer, a), kindOfPeer(peer, a), `trace client span ${s.name}`);
  }

  // around: other services in the same k8s/service namespace
  const appNs =
    appSpans.find((s) => s.resource?.['k8s.namespace.name'] || s.resource?.['service.namespace'])
      ?.resource?.['k8s.namespace.name']
    ?? appSpans.find((s) => s.resource?.['service.namespace'])?.resource?.['service.namespace'];

  if (appNs) {
    const otherServices = new Set();
    for (const s of loaded.spans) {
      if (nameMatchesApp(s.service, app)) continue;
      if (!s.service) continue;
      const ns = s.resource?.['k8s.namespace.name'] ?? s.resource?.['service.namespace'];
      if (ns === appNs) otherServices.add(s.service);
    }
    for (const name of otherServices) {
      const id = slug(name);
      if (seen.has(id)) continue;
      seen.add(id);
      if (companions.length >= cap) { omitted += 1; continue; }
      companions.push({
        id, kind: kindOfPeer(name), label: labelFor(name),
        relation: 'around', evidence: `trace namespace ${appNs}`, subtitle: 'release',
      });
    }
  }

  const model = { app, hops, edges, companions, caps: { companions: cap }, evidenceStrength: 'observed' };
  if (omitted > 0) model.overflow = { count: omitted, note: 'omitted after companion cap' };
  return model;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const appIdx = args.indexOf('--app');
  const outIdx = args.indexOf('--out');
  if (!file) {
    console.error('usage: node adapters/trace/from-trace.mjs <trace.json> [--app <name>] [--out <model.json>]');
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const model = fromTrace(input, { app: appIdx !== -1 ? args[appIdx + 1] : undefined });
  const json = JSON.stringify(model, null, 2);
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], `${json}\n`);
    console.error(`wrote ${args[outIdx + 1]}`);
  }
  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
