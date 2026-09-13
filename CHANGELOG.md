# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

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

[0.7.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.7.0
[0.6.1]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.6.1
[0.6.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.6.0
[0.5.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.5.0
[0.4.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.4.0
[0.3.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.3.0
[0.2.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.2.0
[0.1.0]: https://github.com/albegosu/honest-arch-diagrams/releases/tag/v0.1.0
