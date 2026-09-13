#!/usr/bin/env node
// Terraform evidence adapter for honest-arch-diagrams.
// Turns `terraform show -json` output (state or plan) into a model.
//
// Honesty stance — Terraform proves a resource EXISTS in a stack, not that the request
// path traverses it. So:
//   - Edge/gateway/app resources (DNS, LB, TLS, API gateway, target group / function /
//     service) become the verified spine.
//   - Datastores and cloud resources default to `around` companions (co-located by stack),
//     because co-location is all Terraform proves. A datastore is promoted to `linked`
//     ONLY when the app resource explicitly references it (via `configuration` expressions
//     or depends_on), which is real evidence of use.
//   - Only resource types/names/addresses become evidence. Resource `values` (which may hold
//     passwords) are never emitted; a small allowlist (DNS fqdn/name) is read for labels only.
//
// Usage:
//   node adapters/terraform/from-terraform.mjs <tfshow.json> [--app <name>] [--out <model.json>]

import { readFileSync, writeFileSync } from 'node:fs';

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

// Exact type maps keep matching predictable and honest (no accidental regex hits).
const HOP_TYPES = {
  aws_route53_record: 'dns', google_dns_record_set: 'dns', azurerm_dns_a_record: 'dns', cloudflare_record: 'dns',
  aws_lb: 'lb', aws_alb: 'lb', aws_elb: 'lb', google_compute_forwarding_rule: 'lb', google_compute_global_forwarding_rule: 'lb', azurerm_lb: 'lb',
  aws_acm_certificate: 'tls', google_compute_ssl_certificate: 'tls', google_compute_managed_ssl_certificate: 'tls',
  aws_apigatewayv2_api: 'ingress', aws_api_gateway_rest_api: 'ingress', kubernetes_ingress: 'ingress', kubernetes_ingress_v1: 'ingress',
  aws_lb_target_group: 'service', aws_ecs_service: 'service', aws_lambda_function: 'service', google_cloud_run_service: 'service', google_cloud_run_v2_service: 'service', kubernetes_service: 'service', kubernetes_service_v1: 'service',
};
const COMPANION_TYPES = {
  aws_db_instance: 'db', aws_rds_cluster: 'db', aws_elasticache_cluster: 'db', aws_elasticache_replication_group: 'db', aws_dynamodb_table: 'db', google_sql_database_instance: 'db', azurerm_postgresql_flexible_server: 'db', azurerm_postgresql_server: 'db', aws_docdb_cluster: 'db', aws_redshift_cluster: 'db',
  aws_s3_bucket: 'cloud', aws_sqs_queue: 'cloud', aws_sns_topic: 'cloud', google_storage_bucket: 'cloud', aws_kinesis_stream: 'cloud',
  aws_cognito_user_pool: 'auth',
};
const HOP_LANE = { dns: 'Edge', lb: 'Edge', tls: 'Edge', ingress: 'Gateway', service: 'App' };
const SPINE_ORDER = ['dns', 'lb', 'tls', 'ingress', 'service'];
const SPINE_ID = { dns: 'dns', lb: 'lb', tls: 'tls', ingress: 'ingress', service: 'svc' };

function labelFor(name) {
  const s = String(name).toLowerCase();
  if (/redis|elasticache/.test(s)) return 'Redis';
  if (/postgres|psql|rds|(^|[-_])pg([-_]|$)/.test(s)) return 'Postgres';
  if (/mysql|maria/.test(s)) return 'MySQL';
  if (/mongo|docdb/.test(s)) return 'MongoDB';
  return String(name).replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Flatten resources from a values/planned_values root_module (recursive). */
function collectResources(rootModule, out = []) {
  for (const r of rootModule?.resources ?? []) {
    if (r.mode && r.mode !== 'managed') continue;
    out.push({ address: r.address ?? `${r.type}.${r.name}`, type: r.type, name: r.name, values: r.values });
  }
  for (const child of rootModule?.child_modules ?? []) collectResources(child, out);
  return out;
}

/** Map resource address -> Set of referenced addresses, from a configuration root_module. */
function collectReferences(configModule, out = new Map()) {
  for (const r of configModule?.resources ?? []) {
    const refs = new Set();
    const gather = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.references)) for (const s of node.references) refs.add(s);
      for (const v of Object.values(node)) if (v && typeof v === 'object') gather(v);
    };
    gather(r.expressions);
    for (const d of r.depends_on ?? []) refs.add(d);
    out.set(r.address ?? `${r.type}.${r.name}`, refs);
  }
  for (const call of Object.values(configModule?.module_calls ?? {})) {
    if (call.module) collectReferences(call.module, out);
  }
  return out;
}

export function fromTerraform(input, opts = {}) {
  const valuesRoot = input?.values?.root_module ?? input?.planned_values?.root_module;
  const configRoot = input?.configuration?.root_module;
  const resources = collectResources(valuesRoot);
  const refs = configRoot ? collectReferences(configRoot) : new Map();

  // --- spine: first resource of each hop kind, in canonical order ---
  const hops = [];
  const usedForSpine = new Set();
  for (const kind of SPINE_ORDER) {
    const res = resources.find((r) => HOP_TYPES[r.type] === kind);
    if (!res) continue;
    usedForSpine.add(res.address);
    const id = SPINE_ID[kind];
    const label =
      kind === 'lb' ? 'Load balancer' :
      kind === 'tls' ? 'TLS termination' :
      kind === 'ingress' ? 'API gateway' :
      kind === 'dns' ? (res.values?.fqdn || res.values?.name || res.name) :
      res.name;
    hops.push({ id, kind, label, lane: HOP_LANE[kind], evidence: `terraform ${res.address}` });
  }

  const present = SPINE_ORDER.map((k) => SPINE_ID[k]).filter((id) => hops.some((h) => h.id === id));
  const edges = [];
  for (let i = 0; i < present.length - 1; i++) edges.push({ from: present[i], to: present[i + 1], path: true });
  const anchorId = present.includes('svc') ? 'svc' : present.at(-1);
  const appAddress = resources.find((r) => HOP_TYPES[r.type] === 'service')?.address;
  const appRefs = (appAddress && refs.get(appAddress)) || new Set();
  const referencesAddress = (addr) =>
    [...appRefs].some((ref) => ref === addr || ref.startsWith(`${addr}.`));

  // --- companions: datastores/cloud/auth resources ---
  const cap = opts.cap ?? 8;
  const companions = [];
  let omitted = 0;
  for (const r of resources) {
    const kind = COMPANION_TYPES[r.type];
    if (!kind || usedForSpine.has(r.address)) continue;
    if (companions.length >= cap) { omitted += 1; continue; }
    // Honesty: linked only when the app resource explicitly references this datastore.
    const linked = Boolean(anchorId) && referencesAddress(r.address);
    companions.push(
      linked
        ? { id: slug(r.address), kind, label: labelFor(r.name), relation: 'linked', evidence: `references ${r.address}`, subtitle: 'uses', anchor: anchorId }
        : { id: slug(r.address), kind, label: labelFor(r.name), relation: 'around', evidence: `terraform stack (${r.address})`, subtitle: 'release' },
    );
  }

  const model = {
    app: opts.app || resources.find((r) => HOP_TYPES[r.type] === 'service')?.name || 'stack',
    hops, edges, companions,
    caps: { companions: cap },
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
    console.error('usage: node adapters/terraform/from-terraform.mjs <tfshow.json> [--app <name>] [--out <model.json>]');
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const model = fromTerraform(input, { app: appIdx !== -1 ? args[appIdx + 1] : undefined });
  const json = JSON.stringify(model, null, 2);
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], `${json}\n`);
    console.error(`wrote ${args[outIdx + 1]}`);
  }
  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
