# honest-arch-diagrams

[![CI](https://github.com/albegosu/honest-arch-diagrams/actions/workflows/ci.yml/badge.svg)](https://github.com/albegosu/honest-arch-diagrams/actions/workflows/ci.yml)
[![skills.sh](https://skills.sh/b/albegosu/honest-arch-diagrams)](https://skills.sh/albegosu/honest-arch-diagrams)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An [Agent Skill](https://agentskills.io) for drawing **honest service-topology and
request-path diagrams**. It separates what is *verified* (the request path) from what is
*inferred* (the companions around it), and it never invents components.

> LLM diagram tools hallucinate: ask one to "diagram this service" and it draws a Redis, a
> TLS hop, and an auth gateway it never saw. A confident wrong diagram is worse than none.
> This skill makes the agent draw only what it can evidence, and label the rest as inferred.

Works with any tool that supports the `SKILL.md` standard: Claude Code, Cursor, Gemini CLI,
GitHub Copilot CLI, OpenCode.

## What it does

- Builds a structured model `{ hops[], edges[], companions[] }` before drawing.
- Marks every element with its **evidence** and its **relation** (verified path vs
  `linked`/`around` companion).
- Refuses to add a hop it did not observe.
- Renders with a consistent lane grammar (Edge / Gateway / Identity / App / Workload /
  Data) to **D2**, Mermaid, or SVG.

## Install

With the [skills CLI](https://github.com/vercel-labs/skills) (recommended):

```bash
npx skills add albegosu/honest-arch-diagrams
```

That installs the full skill package (`SKILL.md`, references, scripts, adapters, schema).

### Claude Code plugin

```text
/plugin marketplace add albegosu/honest-arch-diagrams
/plugin install honest-arch-diagrams@honest-arch-diagrams
```

### Manual copy

```bash
git clone https://github.com/albegosu/honest-arch-diagrams
cp -r honest-arch-diagrams/skills/honest-arch-diagrams .cursor/skills/   # Cursor
cp -r honest-arch-diagrams/skills/honest-arch-diagrams .claude/skills/   # Claude Code
cp -r honest-arch-diagrams/skills/honest-arch-diagrams .github/skills/   # GitHub Copilot
```

In Cursor you can also add it as a Remote Rule pointing at
`https://github.com/albegosu/honest-arch-diagrams`.

## Use it

Ask your agent, for example:

- *"Diagram how a request reaches the checkout service."*
- *"Map this service and its dependencies from these manifests."*
- *"Turn this trace into an honest request-path sketch."*

The agent gathers evidence, builds the model, applies the honesty rules, and renders a D2
diagram. Render the D2 with [`d2`](https://d2lang.com):

```bash
d2 examples/checkout-service.d2 checkout-service.svg
```

## Example

`examples/checkout-service.model.json` is the source of truth. Prefer `scripts/layout.mjs`
for the grammar-exact SVG. Optional D2: `npm run to-d2` writes
`examples/checkout-service.generated.d2` (hand-authored `checkout-service.d2` remains an
illustration). Blue marks the verified path; Postgres and Redis are `linked` companions
(dashed, with evidence in the edge label); Prometheus is an `around` companion.

![Honest request-path diagram for the checkout service](examples/checkout-service.png)

## Reference layout (no D2 dependency)

D2 auto-layout does not guarantee the lane grammar; it can float datastores anywhere. The
bundled layout engine places the spine in ranked columns and drops companions onto one
supporting row under their lane, so **Data sits directly under Workload** and edges route as
orthogonal elbows with a hop-arc over crossings. It emits geometry as JSON and a
self-contained SVG (Node 18+, no dependencies):

```bash
node skills/honest-arch-diagrams/scripts/layout.mjs examples/checkout-service.model.json --svg checkout-service.svg
```

![Grammar-exact layout: Postgres and Redis in the Data band under Workload](examples/checkout-service.layout.png)

## Validate

Every model is checked against the honesty rules before rendering. The linter is
dependency-free (Node 18+):

```bash
node skills/honest-arch-diagrams/scripts/lint.mjs examples/checkout-service.model.json
# PASS examples/checkout-service.model.json (7 hops, 3 companions)
```

It fails on invented hops (no evidence), companions without evidence or relation,
companions drawn on the path, and over-cap companion counts. The structural shape is a live
contract in [`skills/honest-arch-diagrams/schema/model.schema.json`](skills/honest-arch-diagrams/schema/model.schema.json),
enforced by a zero-dependency validator (`npm run schema`) that the linter and tests both run.

Run the full golden suite (lint + layout geometry + adapter + no-leak checks) with:

```bash
npm test
```

## Evidence adapters

The linter proves a model is *internally* honest. Adapters make the evidence *real*: they
derive the model from an actual source instead of trusting the agent to remember it. Each
source carries a different strength of evidence, and the adapters reflect that without
inflating it.

Paths below are from the repo root. Inside an installed skill directory, drop the
`skills/honest-arch-diagrams/` prefix.

### Kubernetes — runtime evidence

Turns a `kubectl ... -o json` dump into the model, using only resource kinds/names and
env/Secret **names** as evidence:

```bash
kubectl get ingress,svc,endpoints,deploy -n checkout -o json > dump.json
node skills/honest-arch-diagrams/adapters/k8s/from-k8s.mjs dump.json --app checkout --out checkout.model.json
node skills/honest-arch-diagrams/scripts/layout.mjs checkout.model.json --svg checkout.svg
```

Pass `--app` whenever the dump has more than one service so the spine stays single-app.
It never reads Secret or ConfigMap **values**, and it strips any `user:pass` credentials
from hostnames. A golden test decodes the Secret in the fixture and asserts its value never
reaches the model.

### GitOps / Helm — declared-config evidence

When live `kubectl` is unavailable, derive from rendered manifests (YAML or JSON, single-
or multi-doc, or a directory). Optional `--values` adds linked companions from `*_HOST` /
`*_URL` keys (names only, never credential-bearing values):

```bash
node skills/honest-arch-diagrams/adapters/gitops/from-gitops.mjs ./manifests \
  --app checkout --values values.yaml --out checkout.model.json
```

### Traces — observed-path evidence

Turns an OpenTelemetry JSON export (or a simplified `{ app, spans }` list) into the model.
SERVER spans of the target app form the spine; CLIENT peers become `linked`; other services
are `around` only when they share `k8s.namespace.name`:

```bash
node skills/honest-arch-diagrams/adapters/trace/from-trace.mjs trace.json --app checkout --out checkout.model.json
# or
npx honest-arch from-trace trace.json --app checkout --out checkout.model.json
```

URL credentials in span attributes are stripped; ingress/oauth hops are never invented from
span names alone.

## CLI

After `npm link` (or from the repo):

```bash
node skills/honest-arch-diagrams/scripts/cli.mjs --help
honest-arch lint examples/checkout-service.model.json
honest-arch from-k8s dump.json --app checkout --out checkout.model.json
```

### Terraform — infrastructure evidence

Turns `terraform show -json` (state or plan) into the model. Terraform proves a resource
*exists in a stack*, not that the request path traverses it, so the adapter is deliberately
conservative:

```bash
terraform show -json > tfshow.json
node skills/honest-arch-diagrams/adapters/terraform/from-terraform.mjs tfshow.json --out orders.model.json
```

DNS, load balancers, TLS certs, API gateways, and the app resource (Lambda / ECS service /
target group) form the spine. Datastores default to `around` companions (co-located by the
stack) and are promoted to `linked` **only** when the app resource explicitly references
them in the plan `configuration`. Resource `values` (which may hold passwords) are never
emitted.

### OpenAPI — declared-contract evidence

Turns an OpenAPI 3.x document (JSON or YAML) into the model. This is the weakest evidence —
what the contract *declares*, not what runs — so the adapter stays minimal:

```bash
node skills/honest-arch-diagrams/adapters/openapi/from-openapi.mjs orders.openapi.yaml --out orders.model.json
```

`servers[0]`, `info.title`, and a global oauth2/openIdConnect scheme form the spine.
Downstream dependencies come **only** from the explicit `x-depends-on` extension; nothing is
inferred from paths or descriptions. No `x-depends-on`, no linked companions.

## The idea in five rules

1. Verified spine vs best-effort companions (two layers: `linked` and `around`).
2. Omitted is absent, not guessed.
3. Never invent a hop from a name.
4. Label detected companions; keep their evidence visible.
5. Accent and motion mark the path — they are not claims about traffic or health.

Full detail in [`skills/honest-arch-diagrams/references/honesty-rules.md`](skills/honest-arch-diagrams/references/honesty-rules.md).

## How this differs from other diagram skills

| Skill | Focus | This one instead |
|---|---|---|
| [Archify](https://github.com/Cxdostoyevsky/archify) | Beautiful themeable output | Honesty of the topology |
| [ArchPresent](https://github.com/lewes2/archpresent) | Source-verified L1–L4 inventories | Request-path grammar |
| [c4-codebase-architecture-skill](https://github.com/lmammino/c4-codebase-architecture-skill) | C4 model | Live request path |

## Documentation

- [`DEFINITION.md`](DEFINITION.md) — objective, scope, differentiator.
- [`ROADMAP.md`](ROADMAP.md) — where it goes next.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to run tests and add an adapter.
- [`CHANGELOG.md`](CHANGELOG.md) — version history.
- [`skills/honest-arch-diagrams/SKILL.md`](skills/honest-arch-diagrams/SKILL.md) — the skill entry point.
- [`skills/honest-arch-diagrams/adapters/k8s/from-k8s.mjs`](skills/honest-arch-diagrams/adapters/k8s/from-k8s.mjs) — Kubernetes adapter.
- [`skills/honest-arch-diagrams/adapters/gitops/from-gitops.mjs`](skills/honest-arch-diagrams/adapters/gitops/from-gitops.mjs) — GitOps / Helm manifests adapter.
- [`skills/honest-arch-diagrams/adapters/terraform/from-terraform.mjs`](skills/honest-arch-diagrams/adapters/terraform/from-terraform.mjs) — Terraform adapter.
- [`skills/honest-arch-diagrams/adapters/openapi/from-openapi.mjs`](skills/honest-arch-diagrams/adapters/openapi/from-openapi.mjs) — OpenAPI adapter (JSON/YAML).
- [`skills/honest-arch-diagrams/adapters/trace/from-trace.mjs`](skills/honest-arch-diagrams/adapters/trace/from-trace.mjs) — Trace / OpenTelemetry adapter.
- [`skills/honest-arch-diagrams/scripts/to-d2.mjs`](skills/honest-arch-diagrams/scripts/to-d2.mjs) — model → D2 generator.
- [`skills/honest-arch-diagrams/scripts/cli.mjs`](skills/honest-arch-diagrams/scripts/cli.mjs) — `honest-arch` CLI.

## License

MIT — see [`LICENSE`](LICENSE).
