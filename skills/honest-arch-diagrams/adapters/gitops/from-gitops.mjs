#!/usr/bin/env node
// GitOps / Helm-rendered evidence adapter for honest-arch-diagrams.
// Loads declared Kubernetes manifests (YAML or JSON, single- or multi-doc, or a
// directory of files) and derives a model via the k8s adapter. This is the
// "declared cluster config" path when live kubectl is unavailable.
//
// Honesty: same guarantees as from-k8s (no Secret values). Optional --values
// points at a Helm values.yaml; only *_HOST / *_URL / *_URI / *_ADDR / *_ENDPOINT
// keys become linked companions (names only, never values with credentials).
//
// Usage:
//   node adapters/gitops/from-gitops.mjs <file-or-dir> [--app <name>] [--values values.yaml] [--out model.json]

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fromK8s } from '../k8s/from-k8s.mjs';
import { parseJsonOrYaml, parseYamlDocs } from '../../scripts/yaml.mjs';

const MANIFEST_EXT = new Set(['.yaml', '.yml', '.json']);

function collectFiles(path) {
  const st = statSync(path);
  if (st.isFile()) return [path];
  const out = [];
  for (const name of readdirSync(path)) {
    const p = join(path, name);
    if (statSync(p).isDirectory()) {
      if (name === 'templates' || name === 'charts' || !name.startsWith('.')) {
        out.push(...collectFiles(p));
      }
      continue;
    }
    if (MANIFEST_EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

function loadManifestItems(path) {
  const items = [];
  for (const file of collectFiles(path)) {
    const text = readFileSync(file, 'utf8');
    const lower = file.toLowerCase();
    if (lower.endsWith('.json')) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) items.push(...parsed.filter((x) => x?.kind));
      else if (parsed?.kind === 'List') items.push(...(parsed.items ?? []));
      else if (parsed?.kind) items.push(parsed);
      continue;
    }
    for (const doc of parseYamlDocs(text)) {
      if (doc?.kind === 'List' && Array.isArray(doc.items)) items.push(...doc.items);
      else if (doc?.kind) items.push(doc);
    }
  }
  const seen = new Set();
  const unique = [];
  for (const it of items) {
    const key = `${it.kind}/${it.metadata?.namespace ?? ''}/${it.metadata?.name ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  return unique;
}

function hostLikeKey(k) {
  return /_(HOST|URL|URI|ADDR|ENDPOINT)$/i.test(k) && !/_VERSION$/i.test(k);
}

function walkValues(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) walkValues(v, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (hostLikeKey(k) && (typeof v === 'string' || v == null)) {
      out.push(k);
    } else if (v && typeof v === 'object') {
      walkValues(v, out);
    }
  }
  return out;
}

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

const labelFor = (name) =>
  String(name).replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export function fromGitops(path, opts = {}) {
  const items = loadManifestItems(path);
  const model = fromK8s({ kind: 'List', items }, { app: opts.app, cap: opts.cap });

  if (opts.valuesPath) {
    const text = readFileSync(opts.valuesPath, 'utf8');
    const values = parseJsonOrYaml(text, opts.valuesPath);
    const keys = walkValues(values);
    const cap = opts.cap ?? model.caps?.companions ?? 8;
    const seen = new Set(model.companions.map((c) => c.id));
    let omitted = model.overflow?.count ?? 0;
    const anchor = model.hops.find((h) => h.id === 'svc')?.id
      ?? model.hops.find((h) => h.id === 'pod')?.id
      ?? model.hops.at(-1)?.id;
    for (const key of keys) {
      const id = slug(key);
      if (seen.has(id)) continue;
      seen.add(id);
      if (model.companions.length >= cap) { omitted += 1; continue; }
      if (!anchor) continue;
      model.companions.push({
        id, kind: 'service', label: labelFor(key), relation: 'linked',
        evidence: `values ${key}`, subtitle: 'uses', anchor,
      });
    }
    if (omitted > 0) model.overflow = { count: omitted, note: 'omitted after companion cap' };
  }

  return model;
}

function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--'));
  const appIdx = args.indexOf('--app');
  const outIdx = args.indexOf('--out');
  const valuesIdx = args.indexOf('--values');
  if (!path) {
    console.error('usage: node adapters/gitops/from-gitops.mjs <file-or-dir> [--app <name>] [--values values.yaml] [--out <model.json>]');
    process.exit(1);
  }
  const model = fromGitops(path, {
    app: appIdx !== -1 ? args[appIdx + 1] : undefined,
    valuesPath: valuesIdx !== -1 ? args[valuesIdx + 1] : undefined,
  });
  const json = JSON.stringify(model, null, 2);
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], `${json}\n`);
    console.error(`wrote ${args[outIdx + 1]}`);
  }
  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
