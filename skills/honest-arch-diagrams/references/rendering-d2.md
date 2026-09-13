# Rendering to D2

D2 is the default target: it does orthogonal routing and lane containers for you, so you
apply honesty *styling* on top of its geometry. Mermaid and hand-built SVG are fallbacks.

> When you need the grammar exactly (Data under Workload, hop-arc over crossings) without a
> D2 install, use the bundled reference layout instead:
> `node scripts/layout.mjs <app>.model.json --svg <app>.svg`. It computes lanes, columns,
> orthogonal elbows, and a self-contained SVG from the same model. D2 remains the default for
> quick, themeable output.

## Why D2 first

- `direction: right` gives the left-to-right request flow.
- Containers model lanes cleanly.
- Selectable layout engines handle the elbow routing; you focus on honesty, not geometry.

Render locally: `d2 input.d2 output.svg` (see https://d2lang.com).

## Mapping the model to D2

- Each **lane** → a container (`Edge { ... }`).
- Each **hop** → a node inside its lane container.
- **Path edges** (`path: true`) → a single accented chain.
- **`linked` companions** → a node in the Data/App/Identity lane + a dashed `uses` edge to
  the anchor.
- **`around` companions** → a node inside an "Also in this release" dashed container, with
  **no** edge.

## Style conventions

```d2
vars: {
  accent: "#2563eb"   # path only
}

# accented, verified path
edge.dns -> edge.lb -> gateway.ingress -> app.svc -> workload.pod: {
  style: { stroke: ${accent}; stroke-width: 2 }
}

# linked companion: dashed 'uses', evidence in the label
app.svc -> data.pg: "uses (secret DATABASE_URL)" {
  style: { stroke-dash: 3 }
}

# around companion: dashed card, no connector
around: "Also in this release" {
  style: { stroke-dash: 4 }
  prom: Prometheus
}
```

Rules to keep:
- Accent color appears **only** on the verified path chain.
- Every companion node is dashed; `around` has no edge at all.
- Put the evidence string in the `linked` edge label so the diagram is self-auditing.
- Legend/keys list only kinds present.

## Mermaid fallback

Mermaid renders in GitHub Markdown but gives you less layout control. Use `flowchart LR`,
`subgraph` per lane, `-.->` (dashed) for companions, and a `classDef` to accent the path
class. Do not rely on Mermaid for the hop-arc; accept plain crossings there.

## SVG fallback

Only hand-build SVG when you need the exact grammar (hop-arc, precise lanes) and no engine
is available. Follow `references/layout.md` constants and the `a 8,8 0 0,1 16,0` hop-arc.
