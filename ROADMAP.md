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

## v0.5 — CI + schema contract + distribution ✅
- GitHub Actions (`.github/workflows/ci.yml`) runs schema, lint, and golden tests on every
  push and PR to `main`.
- The published schema is now a live contract: `scripts/schema.mjs` is a zero-dependency
  validator wired into both the linter and the tests.
- Negative tests assert the linter **rejects** dishonest models (over-cap, companion on the
  path, linked without anchor, companion duplicating a hop).
- Second, distinct example (`payments-api`: HTTPRoute, no auth, cloud + db companions) plus an
  HTTPRoute adapter test, broadening grammar coverage.
- skills.sh install badge deferred to v0.7 (listing not published yet).

## v0.6 — More adapters ✅
- `adapters/terraform` ✅: `terraform show -json` (state or plan) → model. Edge/gateway/app
  resources become the spine; datastores default to `around` (co-located by stack) and are
  promoted to `linked` only when the app resource explicitly references them. Resource
  `values` (passwords) are never emitted. `npm run from-terraform`.
- `adapters/openapi` ✅: OpenAPI 3.x JSON → model. `servers[0]` + `info.title` + a global
  oauth2/openIdConnect scheme form the spine; downstream dependencies come only from the
  declared `x-depends-on` extension, never inferred. `npm run from-openapi`.
- Golden tests assert the terraform around/linked split and that openapi invents no
  companions beyond `x-depends-on`.

## v0.6.1 — Pre-launch hardening ✅
- Honest install path: README no longer points at a skills.sh page that 404s; clone/copy is
  primary until marketplace listing lands in v0.7.
- Real companion overflow: optional `overflow: { count, note? }` in the schema; adapters
  trim to the cap and report omitted count; layout draws a `+N more` card.
- Docs aligned with the layout engine (kind ranking, real constants, `cloud` → Data).
- OSS hygiene: `CONTRIBUTING.md`, `CHANGELOG.md`, GitHub issue/PR templates.
- SKILL frontmatter shortened; D2 example marked illustrative.

## v0.7 — Distribution polish ✅
- Self-contained skill package: tooling (`scripts/`, `adapters/`, `schema/`) lives under
  `skills/honest-arch-diagrams/` so `npx skills add` installs a complete unit.
- `.claude-plugin/marketplace.json` for the Claude Code `/plugin` flow.
- README restore: `npx skills add albegosu/honest-arch-diagrams` + skills.sh badge.
- SKILL frontmatter: `license` + `metadata.version` for agentskills.io compliance.

## v0.8 — Adapter polish
- Optional YAML input for the OpenAPI adapter.
- Optional agentskill.sh webhook for instant sync on push.

## How to contribute
See [`CONTRIBUTING.md`](CONTRIBUTING.md). New lane kinds or evidence sources are welcome as
long as they keep the observed-vs-inferred split explicit. Open an issue describing the
evidence you have and the honesty question it raises before adding a renderer feature.
