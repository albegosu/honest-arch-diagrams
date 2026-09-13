#!/usr/bin/env node
// Thin CLI router for honest-arch-diagrams. Zero dependencies.
// Dispatches to the skill-local scripts and adapters so agents and humans share one entry.
//
// Usage:
//   node scripts/cli.mjs <command> [args...]
//   honest-arch <command> [args...]   (via package.json bin)
//
// Commands:
//   lint | schema | layout | to-d2 | test
//   from-k8s | from-gitops | from-terraform | from-openapi | from-trace

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');

const COMMANDS = {
  lint: join(here, 'lint.mjs'),
  schema: join(here, 'schema.mjs'),
  layout: join(here, 'layout.mjs'),
  'to-d2': join(here, 'to-d2.mjs'),
  test: join(here, 'test.mjs'),
  'from-k8s': join(skillRoot, 'adapters/k8s/from-k8s.mjs'),
  'from-gitops': join(skillRoot, 'adapters/gitops/from-gitops.mjs'),
  'from-terraform': join(skillRoot, 'adapters/terraform/from-terraform.mjs'),
  'from-openapi': join(skillRoot, 'adapters/openapi/from-openapi.mjs'),
  'from-trace': join(skillRoot, 'adapters/trace/from-trace.mjs'),
};

function usage() {
  console.error(`honest-arch — honest request-path diagrams

Usage: honest-arch <command> [args...]

Commands:
  lint            Honesty-lint a model.json
  schema          Validate model.json against the schema
  layout          Layout model.json (--svg out.svg)
  to-d2           Generate D2 from model.json
  test            Run golden tests
  from-k8s        Kubernetes dump → model
  from-gitops     GitOps/Helm manifests → model
  from-terraform  terraform show -json → model
  from-openapi    OpenAPI JSON/YAML → model
  from-trace      Trace / OTel JSON → model
`);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === '-h' || cmd === '--help') {
  usage();
  process.exit(0);
}
if (!COMMANDS[cmd]) {
  usage();
  process.exit(1);
}

const result = spawnSync(process.execPath, [COMMANDS[cmd], ...args], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
