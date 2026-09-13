# Visual grammar

How to place and style elements once the model passes the honesty rules. Request flows
**left to right**.

## Lanes

Group nodes into named vertical lanes by role. The request crosses them in order:

| Lane | Holds | Notes |
|---|---|---|
| **Edge** | DNS, load balancer, TLS termination, CDN/cloud front | First contact |
| **Gateway** | Ingress, HTTPRoute, API gateway | Where routing/auth policy attaches |
| **Identity** | oauth2-proxy, auth gateway | Only when on the path |
| **App** | Service, controller | The app's front door inside the cluster |
| **Workload** | Endpoints, Pod | Where code runs |
| **Data** | Datastores, caches | Under Workload; companions live here too |

Lane labels are eyebrows above each column. Do not label the lane with the node's own name
(a load balancer's lane is "Edge," not "ELB").

## Same-rank stacking

Nodes that share a rank stack vertically instead of taking a new column:

- Load balancer **+** TLS termination (both Edge).
- Ingress **+** HTTPRoute (both Gateway).
- Service **+** Endpoints **+** Pod can stack inside Workload rather than marching right.

This keeps missing optional hops from leaving holes: if there is no TLS, the Edge lane just
has the load balancer.

## The supporting row

Companions sit on one supporting row **under** the spine, aligned to the lane they belong
to:

- auth companions under **Gateway/Identity**,
- API/service companions under **App**,
- datastores/caches under **Workload**, in the **Data** lane (same column, new label).

Do not float a companion far past the Pod; keep it under the lane that references it.

## Two satellite styles

| Style | Relation | Stroke | Subtitle | Connector |
|---|---|---|---|---|
| Around card | `around` | dashed | `release` | none |
| Linked card | `linked` | dashed | `uses` / `app` / `auth` | dashed edge to the anchor |

The anchor for a `linked` edge is the Service (or the rightmost spine node if no Service).

## Accent

- Accent (a single strong color) marks **only** the verified path and the current
  selection. Everything else is neutral.
- Do **not** color nodes by kind. Kind is carried by the lane and the label, not by fill.
- Legend lists only the kinds actually present on the canvas.

## Labels and edges

- No edge labels when the left-to-right lane order already tells the story. Add a label
  only when an edge would otherwise be ambiguous (e.g. a `linked` companion's `uses`).
- Card role is the function (DNS / load balancer / TLS), not the vendor.

## Motion (optional)

- Arterial motion (moving dots) may run **only** on the path edges to draw the eye.
- Wrap it in `@media (prefers-reduced-motion: reduce)`: no dots, path still highlighted.
