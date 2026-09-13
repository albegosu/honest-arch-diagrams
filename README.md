# honest-arch-diagrams

[![CI](https://github.com/albegosu/honest-arch-diagrams/actions/workflows/ci.yml/badge.svg)](https://github.com/albegosu/honest-arch-diagrams/actions/workflows/ci.yml)
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

Clone and copy the skill into your agent's skills directory:

```bash
git clone https://github.com/albegosu/honest-arch-diagrams
cp -r honest-arch-diagrams/skills/honest-arch-diagrams .cursor/skills/   # Cursor
cp -r honest-arch-diagrams/skills/honest-arch-diagrams .claude/skills/   # Claude Code
cp -r honest-arch-diagrams/skills/honest-arch-diagrams .github/skills/   # GitHub Copilot
```

In Cursor you can also add it as a Remote Rule pointing at
`https://github.com/albegosu/honest-arch-diagrams`.

Marketplace listing (skills.sh / agentskills.io) is planned for v0.7.

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

`examples/checkout-service.model.json` is the source of truth. The hand-authored
`examples/checkout-service.d2` (and its `.svg` / `.png`) is an **illustrative** D2 render of
that model; prefer `scripts/layout.mjs` when you need the grammar exactly. Blue marks the
verified path; Postgres and Redis are `linked` companions (dashed, with the evidence in the
edge label); Prometheus is an `around` companion ("also in this release," no connector).

![Honest request-path diagram for the checkout service](examples/checkout-service.png)

## Reference layout (no D2 dependency)

D2 auto-layout does not guarantee the lane grammar; it can float datastores anywhere. The
bundled layout engine places the spine in ranked columns and drops companions onto one
supporting row under their lane, so **Data sits directly under Workload** and edges route as
orthogonal elbows with a hop-arc over crossings. It emits geometry as JSON and a
self-contained SVG (Node 18+, no dependencies):

```bash
node scripts/layout.mjs examples/checkout-service.model.json --svg checkout-service.svg
```

![Grammar-exact layout: Postgres and Redis in the Data band under Workload](examples/checkout-service.layout.png)

## Validate

Every model is checked against the honesty rules before rendering. The linter is
dependency-free (Node 18+):

```bash
node scripts/lint.mjs examples/checkout-service.model.json
# PASS examples/checkout-service.model.json (7 hops, 3 companions)
```

It fails on invented hops (no evidence), companions without evidence or relation,
companions drawn on the path, and over-cap companion counts. The structural shape is a live
contract in [`schema/model.schema.json`](schema/model.schema.json), enforced by a
zero-dependency validator (`npm run schema`) that the linter and tests both run.

Run the full golden suite (lint + layout geometry + adapter + no-leak checks) with:

```bash
npm test
```

## Evidence adapters

The linter proves a model is *internally* honest. Adapters make the evidence *real*: they
derive the model from an actual source instead of trusting the agent to remember it. Each
source carries a different strength of evidence, and the adapters reflect that without
inflating it.

### Kubernetes — runtime evidence

Turns a `kubectl ... -o json` dump into the model, using only resource kinds/names and
env/Secret **names** as evidence:

```bash
kubectl get ingress,svc,endpoints,deploy -n checkout -o json > dump.json
node adapters/k8s/from-k8s.mjs dump.json --out checkout.model.json
node scripts/layout.mjs checkout.model.json --svg checkout.svg
```

It never reads Secret or ConfigMap **values**, and it strips any `user:pass` credentials
from hostnames. A golden test decodes the Secret in the fixture and asserts its value never
reaches the model.

### Terraform — infrastructure evidence

Turns `terraform show -json` (state or plan) into the model. Terraform proves a resource
*exists in a stack*, not that the request path traverses it, so the adapter is deliberately
conservative:

```bash
terraform show -json > tfshow.json
node adapters/terraform/from-terraform.mjs tfshow.json --out orders.model.json
```

DNS, load balancers, TLS certs, API gateways, and the app resource (Lambda / ECS service /
target group) form the spine. Datastores default to `around` companions (co-located by the
stack) and are promoted to `linked` **only** when the app resource explicitly references
them in the plan `configuration`. Resource `values` (which may hold passwords) are never
emitted.

### OpenAPI — declared-contract evidence

Turns an OpenAPI 3.x document (JSON) into the model. This is the weakest evidence — what the
contract *declares*, not what runs — so the adapter stays minimal:

```bash
node adapters/openapi/from-openapi.mjs orders.openapi.json --out orders.model.json
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
- [`adapters/k8s/from-k8s.mjs`](adapters/k8s/from-k8s.mjs) — derive a model from a Kubernetes JSON dump.
- [`adapters/terraform/from-terraform.mjs`](adapters/terraform/from-terraform.mjs) — derive from `terraform show -json`.
- [`adapters/openapi/from-openapi.mjs`](adapters/openapi/from-openapi.mjs) — derive from an OpenAPI 3.x document.

## License

MIT — see [`LICENSE`](LICENSE).
