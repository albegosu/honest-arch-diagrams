# honest-arch-diagrams

An [Agent Skill](https://agentskills.io) for drawing **honest service-topology and
request-path diagrams**. It separates what is *verified* (the request path) from what is
*inferred* (the companions around it), and it never invents components.

> LLM diagram tools hallucinate: ask one to "diagram this service" and it draws a Redis, a
> TLS hop, and an auth gateway it never saw. A confident wrong diagram is worse than none.
> This skill makes the agent draw only what it can evidence, and label the rest as inferred.

Works with any tool that supports the `SKILL.md` standard: Claude Code, Cursor, Gemini CLI,
GitHub Copilot CLI, OpenCode.

## What it does

- Builds a structured model `{ hops[], edges[], companions[] }` before drawing.
- Marks every element with its **evidence** and its **relation** (verified path vs
  `linked`/`around` companion).
- Refuses to add a hop it did not observe.
- Renders with a consistent lane grammar (Edge / Gateway / Identity / App / Workload /
  Data) to **D2**, Mermaid, or SVG.

## Install

Copy the skill into your agent's skills directory:

```bash
# Cursor / open Agent Skills
cp -r skills/honest-arch-diagrams .cursor/skills/

# Claude Code
cp -r skills/honest-arch-diagrams .claude/skills/

# GitHub Copilot
cp -r skills/honest-arch-diagrams .github/skills/
```

Or install from GitHub once published (see the skill's remote-rule import in your tool).

## Use it

Ask your agent, for example:

- *"Diagram how a request reaches the checkout service."*
- *"Map this service and its dependencies from these manifests."*
- *"Turn this trace into an honest request-path sketch."*

The agent gathers evidence, builds the model, applies the honesty rules, and renders a D2
diagram. Render the D2 with [`d2`](https://d2lang.com):

```bash
d2 examples/checkout-service.d2 checkout-service.svg
```

## Example

`examples/checkout-service.model.json` → `examples/checkout-service.d2`. Blue marks the
verified path; Postgres and Redis are `linked` companions (dashed, with the evidence in the
edge label); Prometheus is an `around` companion ("also in this release," no connector).

![Honest request-path diagram for the checkout service](examples/checkout-service.png)

## The idea in five rules

1. Verified spine vs best-effort companions (two layers: `linked` and `around`).
2. Omitted is absent, not guessed.
3. Never invent a hop from a name.
4. Label detected companions; keep their evidence visible.
5. Accent and motion mark the path — they are not claims about traffic or health.

Full detail in [`skills/honest-arch-diagrams/references/honesty-rules.md`](skills/honest-arch-diagrams/references/honesty-rules.md).

## How this differs from other diagram skills

| Skill | Focus | This one instead |
|---|---|---|
| [Archify](https://github.com/Cxdostoyevsky/archify) | Beautiful themeable output | Honesty of the topology |
| [ArchPresent](https://github.com/lewes2/archpresent) | Source-verified L1–L4 inventories | Request-path grammar |
| [c4-codebase-architecture-skill](https://github.com/lmammino/c4-codebase-architecture-skill) | C4 model | Live request path |

## Documentation

- [`DEFINITION.md`](DEFINITION.md) — objective, scope, differentiator.
- [`ROADMAP.md`](ROADMAP.md) — where it goes next and how to contribute.
- [`skills/honest-arch-diagrams/SKILL.md`](skills/honest-arch-diagrams/SKILL.md) — the skill entry point.

## License

MIT — see [`LICENSE`](LICENSE).
