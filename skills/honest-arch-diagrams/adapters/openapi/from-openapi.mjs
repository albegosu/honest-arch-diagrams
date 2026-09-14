#!/usr/bin/env node
// OpenAPI evidence adapter for honest-arch-diagrams.
// Turns an OpenAPI 3.x document (JSON or YAML) into a model.
//
// Honesty stance — an OpenAPI document proves what the contract DECLARES, which is weaker
// than runtime (k8s) or infrastructure (Terraform) evidence, so the adapter stays minimal:
//   - `servers[0].url` -> the entry host (dns hop). Credentials in the URL are stripped.
//   - `info.title` -> the app service hop.
//   - A global `security` requirement referencing an oauth2 / openIdConnect scheme -> an
//     Identity hop. Evidence names the scheme.
//   - Downstream dependencies are taken ONLY from the explicit `x-depends-on` extension.
//     Nothing is inferred from paths or descriptions; if the spec declares no dependencies,
//     the model has no linked companions.
//
// Usage:
//   node adapters/openapi/from-openapi.mjs <openapi.json|yaml> [--app <name>] [--out <model.json>]

import { readFileSync, writeFileSync } from 'node:fs';
import { parseJsonOrYaml } from '../../scripts/yaml.mjs';

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

const COMPANION_KINDS = new Set(['db', 'auth', 'controller', 'cloud', 'service']);

/** host:port only, credentials removed. */
function hostOnly(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url).replace(/^[a-z]+:\/\//i, '').replace(/^[^@/]*@/, '').replace(/\/.*$/, '');
  }
}

export function fromOpenApi(doc, opts = {}) {
  const title = opts.app || doc.info?.title || 'api';
  const hops = [];

  const server = doc.servers?.[0]?.url;
  if (server) {
    hops.push({ id: 'dns', kind: 'dns', label: hostOnly(server), lane: 'Edge', evidence: 'OpenAPI servers[0].url' });
  }

  // oauth2 / openIdConnect scheme applied globally -> Identity hop
  const schemes = doc.components?.securitySchemes ?? {};
  let authScheme;
  for (const requirement of doc.security ?? []) {
    for (const name of Object.keys(requirement)) {
      const s = schemes[name];
      if (s && (s.type === 'oauth2' || s.type === 'openIdConnect')) { authScheme = name; break; }
    }
    if (authScheme) break;
  }
  if (authScheme) {
    hops.push({ id: 'oauth', kind: 'oauth2_proxy', label: authScheme, lane: 'Identity', evidence: `OpenAPI security ${authScheme}` });
  }

  hops.push({ id: 'svc', kind: 'service', label: title, lane: 'App', evidence: 'OpenAPI info.title' });

  const order = ['dns', 'oauth', 'svc'];
  const present = order.filter((id) => hops.some((h) => h.id === id));
  const edges = [];
  for (let i = 0; i < present.length - 1; i++) edges.push({ from: present[i], to: present[i + 1], path: true });

  // linked companions: ONLY from the declared x-depends-on extension.
  const cap = opts.cap ?? 8;
  const deps = doc['x-depends-on'] ?? doc.info?.['x-depends-on'] ?? [];
  const companions = [];
  const seen = new Set();
  let omitted = 0;
  for (const d of deps) {
    const name = typeof d === 'string' ? d : d?.name;
    if (!name) continue;
    const id = slug(name);
    if (seen.has(id)) continue;
    seen.add(id);
    if (companions.length >= cap) { omitted += 1; continue; }
    const kind = COMPANION_KINDS.has(d?.kind) ? d.kind : 'service';
    companions.push({
      id, kind, label: name, relation: 'linked',
      evidence: d?.evidence ? `x-depends-on: ${d.evidence}` : 'OpenAPI x-depends-on',
      subtitle: 'uses', anchor: 'svc',
    });
  }

  const model = { app: title, hops, edges, companions, caps: { companions: cap }, evidenceStrength: 'declared' };
  if (omitted > 0) model.overflow = { count: omitted, note: 'omitted after companion cap' };
  return model;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const appIdx = args.indexOf('--app');
  const outIdx = args.indexOf('--out');
  if (!file) {
    console.error('usage: node adapters/openapi/from-openapi.mjs <openapi.json|yaml> [--app <name>] [--out <model.json>]');
    process.exit(1);
  }
  const doc = parseJsonOrYaml(readFileSync(file, 'utf8'), file);
  if (!doc || Array.isArray(doc)) {
    console.error('expected a single OpenAPI document (JSON or YAML)');
    process.exit(1);
  }
  const model = fromOpenApi(doc, { app: appIdx !== -1 ? args[appIdx + 1] : undefined });
  const json = JSON.stringify(model, null, 2);
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], `${json}\n`);
    console.error(`wrote ${args[outIdx + 1]}`);
  }
  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
