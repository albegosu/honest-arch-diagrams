---
name: honest-arch-diagrams
description: >-
  Draw honest service-topology and request-path diagrams. Use when mapping how a request
  reaches a service, or turning manifests/traces into an architecture sketch. Separates the
  verified path from inferred companions; never invents components. Not for C4, theming, or
  file inventories.
---

# Honest architecture diagrams

A request-path diagram is only useful if the reader can trust it. This skill produces
diagrams where every element is auditable: is it observed or inferred, and on what
evidence? Prefer an incomplete honest diagram over a complete confident guess.

## When to use

- "Diagram how a request reaches this service / pod."
- "Map this service and its dependencies."
- "Turn these manifests / this repo / this trace into an architecture sketch."

## When NOT to use

- C4 System/Container/Component docs → use a C4 skill.
- "Make it look beautiful," theming, export pipelines → use Archify.
- File-level or symbol-level inventories → use ArchPresent.

## The one rule

**Never draw what you did not observe.** A hop you did not verify is absent, not guessed.
A dependency you inferred is a *companion*, drawn differently from the path, and it carries
its evidence. See `references/honesty-rules.md` — this is the core of the skill.

## Workflow

1. **Gather evidence.** From the description, repo, manifests, or telemetry, collect only
   facts: which hops are on the path, which dependencies have concrete evidence
   (env host, Secret *name*, ConfigMap host, declared server). Never read Secret values.
   When a real source exists, skip hand-building and derive the model from it:
   - Kubernetes: `kubectl get ingress,svc,endpoints,deploy -n <ns> -o json > d.json` then
     `node adapters/k8s/from-k8s.mjs d.json --out <app>.model.json`.
   - Terraform: `terraform show -json > t.json` then `node adapters/terraform/from-terraform.mjs t.json --out <app>.model.json`.
   - OpenAPI: `node adapters/openapi/from-openapi.mjs <spec>.json --out <app>.model.json`.
   Each source carries different evidence strength (runtime > infrastructure > declared);
   keep that in mind when reading the result.
2. **Build the model.** Fill `{ hops[], edges[], companions[] }` per
   `references/data-model.md`. Stamp each element with `evidence` and, for companions,
   `relation` (`linked` = evidence-backed edge; `around` = co-located by release/owner).
3. **Apply the honesty rules.** Drop any element that fails them. Cap companions (default 8);
   put the surplus in `overflow: { count, note }` instead of padding the canvas. Save the
   model as `<app>.model.json` and validate it before rendering:
   `node scripts/lint.mjs <app>.model.json`. Fix every reported violation.
4. **Lay out.** Assign lanes (Edge / Gateway / Identity / App / Workload / Data) and route
   edges per `references/visual-grammar.md` and `references/layout.md`.
5. **Render.** Either run the bundled reference layout
   (`node scripts/layout.mjs <app>.model.json --svg <app>.svg`), which enforces the lane
   grammar and keeps Data under Workload, or emit D2 (`references/rendering-d2.md`); Mermaid
   or hand-built SVG as fallback. Accent only the verified path.
6. **Self-check.** Run the checklist below before presenting.

## Self-check (must all pass)

- [ ] Every hop on the path has evidence; nothing was added "to look complete."
- [ ] `linked` companions have a concrete evidence string; `around` companions say
      "also in this release," not "called by."
- [ ] No companion sits on the request path or in the arterial/accented edges.
- [ ] No TLS/auth/datastore hop was invented from a name guess.
- [ ] Companion count is within the cap; extras are in `overflow` (`+N more`), not faked.
- [ ] If rendered with motion, it respects `prefers-reduced-motion`.

## References

- `references/honesty-rules.md` — the invariant. Read first.
- `references/data-model.md` — the `{hops, edges, companions}` shape + fields.
- `references/visual-grammar.md` — lanes, stacking, accent, satellites.
- `references/layout.md` — ranking, orthogonal elbows, the hop-arc.
- `references/rendering-d2.md` — D2 output patterns (+ Mermaid/SVG notes).
- `scripts/layout.mjs` — reference lane packer + elbow router; emits geometry JSON and SVG.
- `adapters/k8s/from-k8s.mjs` — derive a model from a Kubernetes JSON dump (evidence, no secret values).
- `adapters/terraform/from-terraform.mjs` — derive from `terraform show -json` (around by default, linked on reference).
- `adapters/openapi/from-openapi.mjs` — derive from an OpenAPI 3.x document (declared `x-depends-on` only).

## Example

`examples/checkout-service.model.json` → `examples/checkout-service.d2` (illustrative D2;
prefer `scripts/layout.mjs` for the grammar-exact SVG).
