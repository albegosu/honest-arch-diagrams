# Contributing

Thanks for helping keep diagrams honest.

## Rules of the road

1. **Honesty never regresses.** New features must keep the observed-vs-inferred split
   explicit. If a change would let an agent invent a hop, it does not land.
2. **Zero runtime dependencies.** Scripts and adapters stay Node 18+ with no npm deps.
3. **CI must stay green.** `npm test` runs schema validation, the honesty linter, layout
   invariants, and adapter no-leak checks.

## Local checks

```bash
node scripts/schema.mjs
node scripts/lint.mjs
npm test
```

## Adding an evidence adapter

1. Put it under `adapters/<source>/from-<source>.mjs` and export a pure function
   (`fromK8s`, `fromTerraform`, …) plus a CLI `main`.
2. Derive evidence only from what the source actually proves. Prefer weaker relations
   (`around`) when the source only proves co-location; promote to `linked` only on an
   explicit reference.
3. Never emit secret / password / token **values**. Names and hostnames (credentials
   stripped) are fine.
4. Respect `caps.companions`: keep at most `cap` companions and set
   `overflow: { count, note }` for the omitted ones.
5. Add a fixture under `adapters/<source>/fixtures/` and golden checks in
   `scripts/test.mjs` (lint clean, expected hops/relations, no-leak where relevant).
6. Document the adapter in `README.md`, `SKILL.md`, and `ROADMAP.md`.

## Docs drift

When you change `scripts/layout.mjs` constants or ranking, update
`skills/honest-arch-diagrams/references/layout.md` in the same change. That file points at
the script as the source of truth.

## Pull requests

Use the PR template. Keep the change focused; link any issue that motivates it.
