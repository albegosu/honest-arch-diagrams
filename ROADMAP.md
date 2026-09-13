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

## v0.3 — Reference layout
- `scripts/layout.mjs`: lane packer (rank by lane, stack same-rank) + orthogonal elbow
  router with the hop-arc over crossings.
- Emits positioned nodes so renderers other than D2 can reuse the geometry.

## v0.4 — Evidence adapters (opt-in)
- `adapters/k8s`: hostname → Ingress/HTTPRoute → Service → Endpoints/Pod, plus companions
  from env/args hosts, Secret **names** (never values), ConfigMap hosts.
- `adapters/terraform`: plan/state → managed resources as verified nodes.
- `adapters/openapi`: servers + dependencies as declared edges.
- Each adapter outputs the same model; the core stays adapter-agnostic.

## v0.5 — Golden tests + distribution
- Golden example set with CI that renders each `.d2` and checks it is non-empty and valid.
- Submit to skills.sh and list on agentskills.io.
- README badges, install one-liner, screenshot.

## How to contribute
- New lane kinds or evidence sources are welcome as long as they keep the
  observed-vs-inferred split explicit.
- Open an issue describing the evidence you have and the honesty question it raises before
  adding a renderer feature.
