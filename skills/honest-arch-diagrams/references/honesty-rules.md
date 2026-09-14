# Honesty rules

The invariant of this skill. If a render feature conflicts with a rule here, the rule wins.

## 1. Verified spine vs best-effort companions

Split the diagram into two populations:

- **Spine (verified path).** The hops a request actually traverses, in order. Each hop is
  something you observed: a DNS record, a load balancer, a TLS termination, an ingress /
  gateway, an auth proxy, a Service, its Endpoints, the Pod. If you cannot point to
  evidence for a hop, it is not on the spine.
- **Companions (best-effort).** Everything else attached to the app. Two layers:
  - `linked` — there is concrete evidence of a relationship: an env/arg host, a Secret
    **name**, a ConfigMap host, a declared client. Draw a dashed edge with a `uses` / `app`
    / `auth` subtitle.
  - `around` — co-located by ownership only (same release, same Argo app, same CNPG
    cluster). No evidence of a call. Draw a dashed card with subtitle `release` and **no
    connector**. Narrative says "also in this release," never "called by."

## 2. Omitted is absent, not guessed

A hop you did not verify is simply not drawn. Do not draw a greyed-out "probably TLS here"
box. Absence is information: the reader learns you did not confirm it.

## 3. Never invent from a name

Do not turn a name or image string into a hop. `image: redis:7` is evidence of a *redis
companion*, not evidence of a cache *hop* on the request path. An `oauth2-proxy` container
is an auth companion unless you actually observed it on the path.

Only promote a companion to the spine when a probe/route/secret ties it to the path
itself, not to the namespace.

## 4. Evidence wins on name; label detected things

When a companion matches an "interesting" pattern (datastores, auth, observability), label
it as **detected** and keep its evidence string visible. The reader can dismiss a false
positive. Better a dismissible card than a silent invention.

Prefer stronger sources when several are available: observed (traces) > runtime (live k8s) >
infra (Terraform) > declared (OpenAPI / GitOps / Compose). Optional model field
`evidenceStrength` records that choice; it must not be used to invent hops.

## 5. Do not read secret values

Companions may be discovered from Secret **names**, env/arg hosts, and ConfigMap hosts.
Never read or render Secret bodies. Names and hosts are enough to say "this app references
a `DATABASE_URL` secret"; the value is out of scope and a data-protection risk.

## 6. Subsume duplicates on the path

If the spine already carries an auth hop (e.g. `oauth2-proxy`), do not also draw a separate
oauth companion. If a datastore is already a verified hop, it is not also an `around` card.
One truth per component.

## 7. Cap and summarize, never pad

Companions are capped (default 8). Keep evidence-backed companions first and put the rest
in `overflow`:

```jsonc
"overflow": { "count": 5, "note": "omitted after companion cap" }
```

Adapters truncate to the cap and set `overflow.count` to the number omitted. The layout
draws a dashed `+N more` card in the "Also in this release" band. Never invent filler to
balance the picture, and never drop an evidence-backed companion to make room for a guessed
one. A model with `companions.length > caps.companions` fails the linter — trim first, then
report overflow.

## 8. Accent and motion are not claims

Color accent and arterial animation mark the *selected/verified path* for the eye. They are
not traffic and not health. Never accent a companion edge. Any motion must degrade under
`prefers-reduced-motion` while keeping the path highlighted.

## Quick failure catalog

| Symptom | Why it violates honesty | Fix |
|---|---|---|
| Redis box on the request path with no probe | Rule 3 | Move to `linked`/`around` companion |
| Greyed "TLS?" hop | Rule 2 | Remove it |
| oauth companion + oauth hop both drawn | Rule 6 | Keep the hop only |
| Companion edge animated | Rule 8 | Motion on path edges only |
| Secret value in a tooltip | Rule 5 | Show the Secret name only |
| 12 evenly spaced generic services | Rule 7 | Cap to 8, set `overflow.count` |
