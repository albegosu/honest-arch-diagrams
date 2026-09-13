# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- LICENSE copyright holder set to Alberto Gonzalez (was a placeholder).

### Changed
- README restructured: 60-second path, adapter strength table, default render = layout SVG.
- CONTRIBUTING expanded (setup, Conventional Commits, release version bump checklist).
- Added SECURITY.md, CODE_OF_CONDUCT.md, and issue template contact links.

## [0.9.0] — 2026-09-13

### Added
- Trace / OpenTelemetry adapter (`adapters/trace/from-trace.mjs`): observed SERVER spans
  form the spine; CLIENT peers become `linked`; other services are `around` only when they
  share `k8s.namespace.name`. Never invents ingress/oauth from span names; strips URL
  credentials. Example: `examples/checkout-from-trace.model.json`.
- Unified CLI (`scripts/cli.mjs`, bin `honest-arch`): `lint`, `layout`, `to-d2`, `test`,
  and all `from-*` adapters under one entry.

## [0.8.0] — 2026-09-13

### Added
- `scripts/to-d2.mjs`: generate D2 from a model (accented spine, dashed linked edges,
  "Also in this release" for around/overflow). `npm run to-d2`.
- OpenAPI adapter accepts YAML via zero-dependency `scripts/yaml.mjs` (same honesty as JSON).
- GitOps / Helm adapter (`adapters/gitops/from-gitops.mjs`): YAML/JSON manifests (file or
  directory) → model via the k8s adapter; optional `--values` adds linked companions from
  `*_HOST` / `*_URL` keys (names only).
- Stricter k8s `--app` selection: gateway/service/workload scoped to the app so a
  multi-service dump cannot become a multi-spine diagram.

### Changed
- Prefer HTTPRoute over Ingress when both match the app.
- Skip `*_VERSION` env vars mistaken for hosts.

## [0.7.1] — 2026-09-13

### Fixed
- SKILL hard constraints after real-agent misuse: **one app / one spine** per model; default
  deliverable is model + lint + `layout.mjs` SVG; **do not default to Mermaid** (last resort
  only). Namespace maps and multi-service spines are out of scope for a single model.
- Clarified Mermaid section in `rendering-d2.md` and `app` semantics in `data-model.md`.

## [0.7.0] — 2026-09-13

### Added
- Self-contained skill package: `scripts/`, `adapters/`, and `schema/` now live under
  `skills/honest-arch-diagrams/` so `npx skills add` installs a complete unit.
- Claude Code marketplace manifest (`.claude-plugin/marketplace.json`).
- Restored marketplace install path and skills.sh badge in the README.
- SKILL frontmatter: `license: MIT` and `metadata.version`.

### Changed
- Repo-root npm scripts and CI point at the skill-local tooling paths.
- YAML OpenAPI support deferred to v0.8 (distribution-only release).

## [0.6.1] — 2026-09-13

### Added
- Optional top-level `overflow: { count, note? }` on the model; layout draws a dashed
  `+N more` card in the "Also in this release" band.
- Adapters (k8s, terraform, openapi) trim companions to the cap and report omitted count
  in `overflow`.
- `CONTRIBUTING.md`, `CHANGELOG.md`, and minimal GitHub issue/PR templates.

### Fixed
- README no longer advertises a skills.sh install path that 404s (marketplace listing is
  deferred to v0.7; clone/copy is the supported install).
- Docs aligned with the layout engine: `cloud` companions sit in **Data**; ranking is by
  hop kind with the real constants from `scripts/layout.mjs`.
- Clarified that checked-in `examples/checkout-service.d2` is illustrative; the model JSON
  + `layout.mjs` are the source of truth.

## [0.6.0] — 2026-09-13

### Added
- Terraform adapter (`terraform show -json`): edge spine; datastores `around` by default,
  promoted to `linked` only on explicit app reference; never emits resource `values`.
- OpenAPI adapter: spine from `servers[0]` / global oauth2 / `info.title`; companions only
  from declared `x-depends-on`.
- Layout fallback so Data hangs under App when no Workload lane exists.

## [0.5.0] — 2026-09-13

### Added
- GitHub Actions CI (schema + lint + golden tests).
- Live schema contract via zero-dependency `scripts/schema.mjs`.
- Negative honesty tests; HTTPRoute example (`payments-api`).

## [0.4.0] — 2026-09-13

### Added
- Kubernetes evidence adapter with Secret-value no-leak guarantee.
- Golden test suite (`npm test`).

## [0.3.0] — 2026-09-13

### Added
- Grammar-exact reference layout (`scripts/layout.mjs`) with Data under Workload and
  hop-arc edge routing.

## [0.2.0] — 2026-09-13

### Added
- JSON Schema for the model and dependency-free honesty linter.

## [0.1.0] — 2026-09-13

### Added
- Initial skill: honesty rules, visual grammar, data model, D2 rendering guidance, and the
  checkout-service example.

[0.7.1]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.7.1
[0.7.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.7.0
[0.6.1]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.6.1
[0.6.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.6.0
[0.5.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.5.0
[0.4.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.4.0
[0.3.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.3.0
[0.2.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.2.0
[0.1.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.1.0
