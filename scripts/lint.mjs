#!/usr/bin/env node
// Honesty linter for honest-arch-diagrams models.
// Zero dependencies. Enforces the cross-field honesty rules that a plain JSON
// Schema cannot express (see references/honesty-rules.md and references/data-model.md).
//
// Usage:
//   node scripts/lint.mjs <model.json> [more.json ...]
//   node scripts/lint.mjs            # defaults to examples/*.model.json
//
// Exit code 0 = all models pass, 1 = at least one failed or a usage error.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOP_KINDS = new Set([
  'dns', 'lb', 'tls', 'ingress', 'httproute', 'oauth2_proxy', 'service', 'endpoints', 'pod',
]);
const COMPANION_KINDS = new Set(['db', 'auth', 'controller', 'cloud', 'service']);
const LANES = new Set(['Edge', 'Gateway', 'Identity', 'App', 'Workload', 'Data']);
const LINKED_SUBTITLES = new Set(['uses', 'app', 'auth']);

/** Collect honesty violations for one parsed model. Returns string[] of errors. */
function lintModel(model) {
  const errors = [];
  const push = (msg) => errors.push(msg);

  if (!model || typeof model !== 'object') return ['model is not an object'];
  if (!model.app) push('missing "app"');
  for (const key of ['hops', 'edges', 'companions']) {
    if (!Array.isArray(model[key])) push(`"${key}" must be an array`);
  }
  if (errors.length) return errors;

  const hopIds = new Set();
  for (const h of model.hops) {
    if (!h.id) push('a hop has no id');
    if (hopIds.has(h.id)) push(`duplicate hop id "${h.id}"`);
    hopIds.add(h.id);
    if (!HOP_KINDS.has(h.kind)) push(`hop "${h.id}" has unknown kind "${h.kind}"`);
    if (!LANES.has(h.lane)) push(`hop "${h.id}" has unknown lane "${h.lane}"`);
    // Rule 2: a hop with no evidence does not exist.
    if (!h.evidence || !String(h.evidence).trim()) {
      push(`hop "${h.id}" has no evidence (honesty rule 2: omitted is absent, not guessed)`);
    }
  }

  const cap = model.caps?.companions ?? 8;
  const companionIds = new Set();
  for (const c of model.companions) {
    if (!c.id) push('a companion has no id');
    if (companionIds.has(c.id)) push(`duplicate companion id "${c.id}"`);
    companionIds.add(c.id);
    if (!COMPANION_KINDS.has(c.kind)) push(`companion "${c.id}" has unknown kind "${c.kind}"`);
    // Rule 1 + data model: relation + evidence required.
    if (c.relation !== 'linked' && c.relation !== 'around') {
      push(`companion "${c.id}" has invalid relation "${c.relation}" (linked|around)`);
    }
    if (!c.evidence || !String(c.evidence).trim()) {
      push(`companion "${c.id}" has no evidence (honesty rule 1/4)`);
    }
    // Rule 6: one truth per component.
    if (hopIds.has(c.id)) {
      push(`companion "${c.id}" duplicates a hop id (honesty rule 6: subsume duplicates)`);
    }
    if (c.relation === 'around') {
      if (c.anchor) push(`around companion "${c.id}" must not have an anchor (no connector)`);
      if (c.subtitle && c.subtitle !== 'release') {
        push(`around companion "${c.id}" subtitle should be "release", got "${c.subtitle}"`);
      }
    }
    if (c.relation === 'linked') {
      if (!c.anchor) push(`linked companion "${c.id}" needs an anchor`);
      else if (!hopIds.has(c.anchor)) push(`linked companion "${c.id}" anchor "${c.anchor}" is not a hop`);
      if (c.subtitle && !LINKED_SUBTITLES.has(c.subtitle)) {
        push(`linked companion "${c.id}" subtitle "${c.subtitle}" not in uses|app|auth`);
      }
    }
  }

  // Rule 7: cap and summarize, never pad.
  if (model.companions.length > cap) {
    push(`companions (${model.companions.length}) exceed cap ${cap} (honesty rule 7: cap and summarize)`);
  }

  // Rule 8 / spine integrity: path edges only touch hops.
  for (const e of model.edges) {
    const endpoints = [e.from, e.to];
    for (const id of endpoints) {
      if (!hopIds.has(id) && !companionIds.has(id)) push(`edge endpoint "${id}" is unknown`);
    }
    if (e.path) {
      for (const id of endpoints) {
        if (!hopIds.has(id)) {
          push(`path edge ${e.from}->${e.to} touches non-hop "${id}" (honesty rule 8: accent is path-only)`);
        }
      }
    }
  }

  return errors;
}

function resolveTargets(argv) {
  if (argv.length) return argv;
  const dir = 'examples';
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.model.json'))
    .map((f) => join(dir, f));
}

function main() {
  const targets = resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.error('no model files given and no examples/*.model.json found');
    process.exit(1);
  }

  let failed = 0;
  for (const file of targets) {
    let model;
    try {
      model = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`FAIL ${file}: cannot parse JSON (${err.message})`);
      failed += 1;
      continue;
    }
    const errors = lintModel(model);
    if (errors.length) {
      failed += 1;
      console.error(`FAIL ${file}`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      const n = model.hops.length;
      const c = model.companions.length;
      console.log(`PASS ${file} (${n} hops, ${c} companions)`);
    }
  }

  if (failed) {
    console.error(`\n${failed} model(s) failed the honesty lint.`);
    process.exit(1);
  }
  console.log(`\nAll ${targets.length} model(s) passed.`);
}

main();
