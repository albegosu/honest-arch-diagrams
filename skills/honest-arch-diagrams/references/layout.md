# Layout and edge routing

Geometry rules that make the sketch readable. A renderer with its own layout engine (D2,
ELK) can delegate most of this; the values below match the bundled reference layout.

> Source of truth: [`scripts/layout.mjs`](../scripts/layout.mjs). Keep this doc in
> sync with that file.

## Ranking (columns)

- Assign each hop a **rank by kind** (not by lane). Same-rank hops stack on Y:
  - `dns` → 0
  - `lb`, `tls` → 1
  - `ingress`, `httproute` → 2
  - `oauth2_proxy` → 3
  - `service` → 4
  - `endpoints`, `pod` → 5
- Compact columns by rank so a missing optional hop (no TLS, no auth) leaves **no hole**:
  ranks that are empty are skipped, not reserved.
- Center each column's stack on the baseline.

Reference constants (px) from `scripts/layout.mjs`:

```
NODE_W 148   NODE_H 56
H_GAP 96     START_X 90   BASE_Y 240
SPINE_STACK_GAP 48
ROW_GAP 72   COMPANION_STACK_GAP 22
CORNER_R 8
```

## Companion placement

- One supporting row **below** the spine: `rowY = pathBottom + ROW_GAP`.
- Column by kind: auth under the Identity/Gateway column, datastores/`cloud` under the
  Workload column (Data band; falls back to App when no Workload hop exists), the rest under
  App.
- Stack companions in their column with `COMPANION_STACK_GAP`.
- When `model.overflow.count >= 1`, draw a dashed `+N more` card in the "Also in this
  release" band (no connector).

## Orthogonal elbows

- Route spine edges as orthogonal elbows with rounded corners `r=CORNER_R`.
- Prefer a straight horizontal run when source and target share a Y; otherwise one vertical
  segment plus horizontal runs (an "elbow"), never a diagonal.

## The hop-arc

When a horizontal edge must cross a vertical segment of another edge, lift it over the
crossing with a small semicircular **hop-arc** instead of a plain overlap. In SVG path
terms, an upward semicircle is:

```
a 8,8 0 0,1 16,0
```

Use the hop-arc for the case where a `linked` companion edge crosses a spine edge mid-X.
Do not use it on the accented path itself if it can be avoided — keep the path clean.

## What not to do

- No diagonal edges. Requests read as orthogonal flows.
- No edge labels where the L→R order already carries the story (see visual grammar).
- Do not route a companion edge through unrelated nodes; keep it a short `uses` hop to the
  anchor.

## Delegating to a layout engine

If you render with D2, set `direction: right` and let D2 place lanes as containers; you get
orthogonal routing for free. If you use ELK directly, use:

```
algorithm: layered
elk.direction: RIGHT
elk.edgeRouting: ORTHOGONAL
elk.portConstraints: FIXED_SIDE
```

Then apply the honesty *styling* (dashed companions, accent on path) on top of the engine's
geometry.
