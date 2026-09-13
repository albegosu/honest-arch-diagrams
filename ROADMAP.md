# Roadmap

The invariant across every version: **honesty rules never regress.** Features are added
around them, never at their expense.

## v0.1 — Skill core (this release)
- `SKILL.md` with trigger-rich description.
- References: honesty rules, visual grammar, layout, data model, D2 rendering.
- One worked example (model JSON + D2 output).

## v0.2 — Schema + linter ✅
- JSON Schema for the model (`schema/model.schema.json`).
- Dependency-free honesty linter (`scripts/lint.mjs`) that fails on:
  - a hop with no evidence,
  - a companion with no `relation` or no evidence,
  - a companion drawn on the path,
  - a duplicate between a hop and a companion,
  - companion count over the cap.
- `SKILL.md` instructs the agent to run the linter before rendering.
- `package.json` exposes `npm run lint` and a `honest-arch-lint` bin.

## v0.3 — Reference layout ✅
- `scripts/layout.mjs`: lane packer (rank by hop kind, stack same-rank) + orthogonal elbow
  router with the hop-arc over crossings.
- Companions land on one supporting row under their lane, so datastores sit in the **Data**
  band directly under **Workload** — the placement D2 auto-layout does not guarantee.
- Emits positioned nodes/edges/bands as JSON and a self-contained SVG, so any renderer can
  reuse the geometry without a D2 dependency.
- `npm run layout` regenerates `examples/checkout-service.layout.svg`.

## v0.4 — Evidence adapters (opt-in)
- `adapters/k8s` ✅: Kubernetes JSON dump → model. Ingress/HTTPRoute → Service →
  Endpoints/Pod for the spine; companions from container env hosts and Secret **names**
  (never values). Hostnames are stripped of credentials. `npm run from-k8s`.
- Golden tests ✅ (`scripts/test.mjs`, `npm test`): every example lints, layout geometry is
  finite and keeps Data under Workload, and the k8s adapter is asserted to derive real
  evidence and **never leak a Secret value**.
- `adapters/terraform` (next): plan/state → managed resources as verified nodes.
- `adapters/openapi` (next): servers + dependencies as declared edges.
- Each adapter outputs the same model; the core stays adapter-agnostic.

## v0.5 — CI + distribution
- Run `npm test` in CI on every push; render each example and check it is non-empty.
- Submit to skills.sh and list on agentskills.io.
- README badges, install one-liner, screenshot.

## How to contribute
- New lane kinds or evidence sources are welcome as long as they keep the
  observed-vs-inferred split explicit.
- Open an issue describing the evidence you have and the honesty question it raises before
  adding a renderer feature.
