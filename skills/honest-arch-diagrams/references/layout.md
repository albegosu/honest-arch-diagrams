# Layout and edge routing

Geometry rules that make the sketch readable. A renderer with its own layout engine (D2,
ELK) can delegate most of this; the values below are for hand-built SVG or for tuning.

## Ranking (columns)

- Assign each hop a **rank** by lane order: Edge(0) → Gateway(1) → Identity(2) → App(3) →
  Workload(4). Nodes of the same rank stack on Y instead of taking a new column.
- Compact columns by rank so a missing optional hop (no TLS, no auth) leaves **no hole**:
  ranks that are empty are skipped, not reserved.
- Center each column's stack on the baseline: `y = baseline + (i - (n-1)/2) * gap`.

Reference constants (px), tune per canvas:

```
NODE_W 132   NODE_H 56
H_GAP 100    V_GAP 92
START_X 80   BASE_Y 220
SPINE_STACK_GAP 48
```

## Companion placement

- One supporting row **below** the spine: `rowY = pathBottom + ROW_GAP` (ROW_GAP ~64).
- Column by kind: auth under the Identity/Gateway column, datastores under the Workload
  column (Data lane), the rest under App.
- Stack companions in their column with a tight gap (~20px). Cluster like kinds together
  (all datastores, then auth, then rest).

## Orthogonal elbows

- Route spine edges as orthogonal elbows on a **4px grid** with rounded corners `r=8`.
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
