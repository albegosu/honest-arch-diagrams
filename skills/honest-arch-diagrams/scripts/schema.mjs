#!/usr/bin/env node
// Minimal, dependency-free JSON Schema validator for the honest-arch model.
// Supports exactly the subset used by schema/model.schema.json: type, required,
// properties, additionalProperties:false, enum, minLength, minimum, integer, arrays
// with `items`, and local `$ref` into `#/$defs`. This makes the published schema a live
// contract instead of dead documentation — both the linter and the tests validate against it.
//
// Usage:
//   node scripts/schema.mjs <model.json> [more.json ...]   (default: examples/*.model.json)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(here, '..', 'schema', 'model.schema.json'), 'utf8'));

function resolveRef(ref, root) {
  const segments = ref.replace(/^#\//, '').split('/');
  let cur = root;
  for (const s of segments) cur = cur?.[s];
  return cur;
}

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v; // 'string' | 'boolean' | 'object'
}

function validateNode(schema, data, path, root, errors) {
  if (schema.$ref) {
    validateNode(resolveRef(schema.$ref, root), data, path, root, errors);
    return;
  }
  const actual = typeOf(data);

  if (schema.type) {
    const ok =
      schema.type === actual ||
      (schema.type === 'number' && actual === 'integer');
    if (!ok) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path}: ${JSON.stringify(data)} not in [${schema.enum.join(', ')}]`);
  }
  if (actual === 'string' && schema.minLength != null && data.length < schema.minLength) {
    errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
  }
  if ((actual === 'integer' || actual === 'number') && schema.minimum != null && data < schema.minimum) {
    errors.push(`${path}: ${data} below minimum ${schema.minimum}`);
  }
  if (actual === 'object') {
    for (const req of schema.required ?? []) {
      if (!(req in data)) errors.push(`${path}: missing required "${req}"`);
    }
    const props = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!(key in props)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in data) validateNode(sub, data[key], `${path}/${key}`, root, errors);
    }
  }
  if (actual === 'array' && schema.items) {
    data.forEach((item, i) => validateNode(schema.items, item, `${path}[${i}]`, root, errors));
  }
}

/** Validate a parsed model against schema/model.schema.json. Returns string[] of errors. */
export function validateSchema(model, schema = SCHEMA) {
  const errors = [];
  validateNode(schema, model, '$', schema, errors);
  return errors;
}

function resolveTargets(argv) {
  if (argv.length) return argv;
  const dir = 'examples';
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.model.json')).map((f) => join(dir, f));
}

function main() {
  const targets = resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.error('no model files given and no examples/*.model.json found');
    process.exit(1);
  }
  let failed = 0;
  for (const file of targets) {
    const errors = validateSchema(JSON.parse(readFileSync(file, 'utf8')));
    if (errors.length) {
      failed += 1;
      console.error(`FAIL ${file}`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      console.log(`PASS ${file}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`\nAll ${targets.length} model(s) match the schema.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
