# Contributing

Thanks for helping keep diagrams honest.

## Rules of the road

1. **Honesty never regresses.** New features must keep the observed-vs-inferred split
   explicit. If a change would let an agent invent a hop, it does not land.
2. **Zero runtime dependencies.** Scripts and adapters stay Node 18+ with no npm deps.
3. **The skill package is self-contained.** Tooling lives under
   `skills/honest-arch-diagrams/` (`scripts/`, `adapters/`, `schema/`, `references/`) so
   `npx skills add` installs a complete unit. Do not put runtime code back at the repo root.
4. **CI must stay green.** `npm test` runs schema validation, the honesty linter, layout
   invariants, and adapter no-leak checks.
5. **One app / one spine.** Features that encourage namespace maps or multi-service paths in
   a single model are out of scope.

## Setup

```bash
git clone https://github.com/albegosu/honest-arch-diagrams
cd honest-arch-diagrams
# Node 18+ only — no npm install required for scripts/tests
npm test
```

Optional CLI link:

```bash
npm link
honest-arch --help
```

## Local checks

```bash
npm run schema
npm run lint
npm test
```

Before opening a PR, run `npm test` and fix every failure. Do not use `--no-verify`.

## Branch and commits

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…` (kebab-case).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(trace): …`, `fix(k8s): …`, `docs: …`.
- Keep PRs focused. Prefer small diffs over drive-by refactors.

## Adding an evidence adapter

1. Put it under `skills/honest-arch-diagrams/adapters/<source>/from-<source>.mjs` and export
   a pure function (`fromK8s`, `fromTerraform`, …) plus a CLI `main`.
2. Wire it into `scripts/cli.mjs` and `package.json` scripts.
3. Derive evidence only from what the source actually proves. Prefer weaker relations
   (`around`) when the source only proves co-location; promote to `linked` only on an
   explicit reference.
4. Never emit secret / password / token **values**. Names and hostnames (credentials
   stripped) are fine.
5. Respect `caps.companions`: keep at most `cap` companions and set
   `overflow: { count, note }` for the omitted ones.
6. Add a fixture under `skills/honest-arch-diagrams/adapters/<source>/fixtures/` and golden
   checks in `skills/honest-arch-diagrams/scripts/test.mjs` (lint clean, expected
   hops/relations, no-leak where relevant).
7. Document the adapter in `README.md`, `SKILL.md`, and `CHANGELOG.md`.

## Docs drift

When you change `skills/honest-arch-diagrams/scripts/layout.mjs` constants or ranking,
update `skills/honest-arch-diagrams/references/layout.md` in the same change. That file
points at the script as the source of truth.

Update `CHANGELOG.md` for user-visible changes. Bump `package.json`, SKILL
`metadata.version`, and `.claude-plugin/marketplace.json` together when cutting a release.

## Pull requests

Use the PR template. Include:

- Why the change is needed (honesty / UX / adapter evidence).
- How you tested (`npm test` + any manual adapter command).
- Whether docs need a follow-up.

## Conduct and security

- Be kind; see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Report vulnerabilities privately via [`SECURITY.md`](SECURITY.md) — not via public issues.
