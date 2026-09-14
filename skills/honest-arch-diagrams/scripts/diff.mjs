#!/usr/bin/env node
// Compare two honest-arch-diagrams models. Reports only; never invents hops.
//
// Usage:
//   node scripts/diff.mjs <before.model.json> <after.model.json> [--json] [--exit-code]
//
// Exit: 0 = identical (for compared fields), 1 = differences (with --exit-code),
//       2 = usage / parse error.

import { readFileSync } from 'node:fs';

const HOP_FIELDS = ['kind', 'label', 'lane', 'evidence'];
const COMPANION_FIELDS = ['kind', 'label', 'relation', 'evidence', 'anchor', 'subtitle'];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) {
    if (obj[f] !== undefined) out[f] = obj[f];
  }
  return out;
}

function indexById(list) {
  const map = new Map();
  for (const item of list ?? []) {
    if (item?.id) map.set(item.id, item);
  }
  return map;
}

function changedFields(a, b, fields) {
  const changes = {};
  for (const f of fields) {
    const av = a[f] ?? null;
    const bv = b[f] ?? null;
    if (av !== bv) changes[f] = { from: av, to: bv };
  }
  return Object.keys(changes).length ? changes : null;
}

/** Diff two parsed models. Pure; does not invent topology. */
export function diffModels(before, after) {
  const warnings = [];
  if (before?.app !== after?.app) {
    warnings.push(`app differs: "${before?.app}" → "${after?.app}"`);
  }

  const beforeHops = indexById(before?.hops);
  const afterHops = indexById(after?.hops);
  const hops = { added: [], removed: [], changed: [] };

  for (const [id, hop] of afterHops) {
    if (!beforeHops.has(id)) hops.added.push(pick(hop, ['id', ...HOP_FIELDS]));
    else {
      const ch = changedFields(beforeHops.get(id), hop, HOP_FIELDS);
      if (ch) hops.changed.push({ id, changes: ch });
    }
  }
  for (const [id, hop] of beforeHops) {
    if (!afterHops.has(id)) hops.removed.push(pick(hop, ['id', ...HOP_FIELDS]));
  }

  const beforeC = indexById(before?.companions);
  const afterC = indexById(after?.companions);
  const companions = { added: [], removed: [], changed: [] };

  for (const [id, c] of afterC) {
    if (!beforeC.has(id)) companions.added.push(pick(c, ['id', ...COMPANION_FIELDS]));
    else {
      const ch = changedFields(beforeC.get(id), c, COMPANION_FIELDS);
      if (ch) companions.changed.push({ id, changes: ch });
    }
  }
  for (const [id, c] of beforeC) {
    if (!afterC.has(id)) companions.removed.push(pick(c, ['id', ...COMPANION_FIELDS]));
  }

  const hasDiff =
    hops.added.length + hops.removed.length + hops.changed.length
    + companions.added.length + companions.removed.length + companions.changed.length > 0;

  return { warnings, hops, companions, identical: !hasDiff };
}

function formatHuman(diff) {
  const lines = [];
  for (const w of diff.warnings) lines.push(`warning: ${w}`);
  if (diff.identical) {
    lines.push('identical');
    return `${lines.join('\n')}\n`;
  }
  const section = (title, bucket, fmt) => {
    if (!bucket.added.length && !bucket.removed.length && !bucket.changed.length) return;
    lines.push(title);
    for (const item of bucket.added) lines.push(`  + ${fmt(item)}`);
    for (const item of bucket.removed) lines.push(`  - ${fmt(item)}`);
    for (const item of bucket.changed) {
      const bits = Object.entries(item.changes).map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`);
      lines.push(`  ~ ${item.id} (${bits.join(', ')})`);
    }
  };
  section('hops:', diff.hops, (h) => `${h.id} [${h.kind}] ${h.label}`);
  section('companions:', diff.companions, (c) => `${c.id} [${c.relation}/${c.kind}] ${c.label}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const asJson = args.includes('--json');
  const exitCode = args.includes('--exit-code');
  if (files.length !== 2) {
    console.error('usage: node scripts/diff.mjs <before.model.json> <after.model.json> [--json] [--exit-code]');
    process.exit(2);
  }
  let before;
  let after;
  try {
    before = JSON.parse(readFileSync(files[0], 'utf8'));
    after = JSON.parse(readFileSync(files[1], 'utf8'));
  } catch (err) {
    console.error(err.message || err);
    process.exit(2);
  }
  const diff = diffModels(before, after);
  if (asJson) console.log(JSON.stringify(diff, null, 2));
  else process.stdout.write(formatHuman(diff));
  if (exitCode && !diff.identical) process.exit(1);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
