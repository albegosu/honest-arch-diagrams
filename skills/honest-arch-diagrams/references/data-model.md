# Data model

Build this before rendering. It is renderer-agnostic: the same model can drive D2, Mermaid,
or a hand-built SVG.

```jsonc
{
  "app": "checkout",            // ONE service under study — never a namespace of apps
  "hops": [                     // the VERIFIED request path, in order
    {
      "id": "dns",
      "kind": "dns",            // dns | lb | tls | ingress | httproute | oauth2_proxy | service | endpoints | pod
      "label": "checkout.example.com",
      "lane": "Edge",           // Edge | Gateway | Identity | App | Workload | Data
      "evidence": "DNS record"  // required — how you know this hop exists
    }
  ],
  "edges": [                    // spine connectors; source/target are hop ids
    { "from": "dns", "to": "lb", "path": true }
  ],
  "companions": [               // BEST-EFFORT, off the path
    {
      "id": "postgres",
      "kind": "db",             // db | auth | controller | cloud | service
      "label": "Postgres",
      "relation": "linked",     // linked (evidence-backed) | around (co-located)
      "evidence": "secret DATABASE_URL",  // required
      "subtitle": "uses",       // linked: uses | app | auth   |   around: release
      "anchor": "svc"           // linked only: spine node id the dashed edge attaches to
    }
  ],
  "caps": { "companions": 8 },
  "overflow": { "count": 2, "note": "omitted after companion cap" },  // optional
  "evidenceStrength": "runtime"   // optional — see below
}
```

**One app per model.** `app` is a single service. Other workloads in the same namespace or
stack are `around` companions (or a second model), never a second spine in the same file.

## Field rules

- **`hops[].evidence`** is required. No evidence → the hop does not exist (honesty rule 2).
- **`companions[].relation`** is required and drives the style:
  - `linked` → dashed edge to `anchor`, subtitle `uses`/`app`/`auth`.
  - `around` → dashed card, subtitle `release`, **no** `anchor`, no edge.
- **`companions[].evidence`** is required for both relations. For `around` it is the shared
  release/owner ("same Argo app `checkout`"); for `linked` it is the concrete reference
  ("env `REDIS_HOST`", "secret `DATABASE_URL`", "configmap host").
- **`edges[].path: true`** marks accented/arterial edges. Companion edges are never `path`.
- **`overflow`** (optional) reports companions omitted after the cap:
  `{ "count": 5, "note": "omitted after companion cap" }`. Keep
  `companions.length <= caps.companions` and put the surplus in `overflow.count`. The layout
  draws a `+N more` card for it.
- **`evidenceStrength`** (optional) is the strength of the *source* that produced the model:

| Value | Typical producer |
|---|---|
| `observed` | `from-trace` |
| `runtime` | `from-k8s` |
| `infra` | `from-terraform` |
| `declared` | `from-openapi`, `from-gitops`, `from-compose` |
| `manual` | hand-built models (or omit the field) |

Adapters set this field. Hand-built examples may omit it. Layout and to-d2 ignore it.

## Kinds → lane defaults

**Hop kinds** (spine only):

| kind | default lane |
|---|---|
| `dns`, `lb`, `tls` | Edge |
| `ingress`, `httproute` | Gateway |
| `oauth2_proxy` | Identity |
| `service` | App |
| `endpoints`, `pod` | Workload |

**Companion kinds** (supporting row; never on the spine):

| kind | default band |
|---|---|
| `db`, `cloud` | Data (under Workload, or under App when no Workload) |
| `auth` | Identity |
| `controller`, `service` | App |

## Validation (pre-render)

Reject the model if any of these are true:

1. A `hop` has empty/missing `evidence`.
2. A `companion` has no `relation` or no `evidence`.
3. A `companion` id also appears as a `hop` id (duplicate truth — subsume it).
4. An `around` companion has an `anchor` or an edge.
5. `companions.length > caps.companions` (trim to the cap and set `overflow` instead).
6. Any edge with `path: true` touches a companion id.

These are enforced by `scripts/lint.mjs`; the structural shape is in
`schema/model.schema.json`. Run `node scripts/lint.mjs <model.json>` before rendering.
