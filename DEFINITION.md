# Definition — honest-arch-diagrams

## One sentence

An agent skill that draws **honest service-topology and request-path diagrams**: they
separate what is *verified* (the request path) from what is *inferred* (the companions
around it), and never invent components.

## The problem

LLM diagram generators hallucinate. Ask one to "diagram this service" and it will happily
draw a Redis, a TLS hop, and an auth gateway it never saw, because boxes-and-arrows look
complete. The result reads as fact but is a guess. For infrastructure and platform work,
a confident wrong diagram is worse than no diagram.

## The objective (falsifiable)

Given "diagram how a request flows through this service," the agent should:

1. Build a structured model `{ hops[], edges[], companions[] }`.
2. Mark every element with its evidence and its relation (`verified` path vs
   `linked`/`around` companion).
3. Refuse to add a hop it did not observe.
4. Render it with a consistent lane grammar (Edge / Gateway / Identity / App / Workload /
   Data) to D2, SVG, or Mermaid.

Success = the diagram is auditable. A reader can tell, per element, "is this observed or
inferred, and on what evidence?"

## What makes it different

This is not a general "make a pretty diagram" skill and not a C4 skill. It encodes one
narrow, opinionated thing: **the honesty grammar for a single application's request path.**

| Adjacent skill | Focus | This skill instead |
|---|---|---|
| [Archify](https://github.com/Cxdostoyevsky/archify) | Beautiful themeable HTML, exports | Honesty of the topology, not looks |
| [ArchPresent](https://github.com/lewes2/archpresent) | Source-verified L1–L4 inventory drill-down | Request-path grammar, not file inventories |
| [c4-codebase-architecture-skill](https://github.com/lmammino/c4-codebase-architecture-skill) | C4 model, facts vs inference | Live request path, same facts-vs-inference ethic |
| [architecture-diagram-skill](https://github.com/konraddzbik/architecture-diagram-skill) | Animated click-through HTML | Static honest sketch + optional path motion |

## Scope

**In scope**
- The data model (`references/data-model.md`).
- The honesty rules (`references/honesty-rules.md`) — the core invariant.
- The visual/lane grammar (`references/visual-grammar.md`).
- Layout and edge-routing rules (`references/layout.md`).
- Rendering guidance to D2 first, Mermaid/SVG as fallbacks (`references/rendering-d2.md`).

**Out of scope**
- Theming, color systems, export pipelines (use Archify).
- C4 System/Container/Component modeling (use the C4 skill).
- File-level or symbol-level inventories (use ArchPresent).
- Coupling to any specific platform API. Adapters that read real evidence
  (Kubernetes, Terraform, OpenAPI) are optional add-ons, not the core.

## Target users

- Platform / DevOps engineers who need a service map they can trust in a review.
- Anyone using a coding agent to explain "how does a request reach this pod?"

## Origin

Distilled from a production "living architecture" canvas that renders one live app's
request path (verified hops) plus its namespace companions (best-effort, two layers). The
product code stays private; the transferable part is the editorial method, captured here.
