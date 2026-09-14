# Publishing

How this skill stays discoverable and up to date across installers and marketplaces.

## skills.sh (install)

Users install with:

```bash
npx skills add albegosu/honest-arch-diagrams
```

That clones/copies `skills/honest-arch-diagrams/` (SKILL.md, references, scripts, adapters,
schema). No extra publish step beyond pushing to GitHub `main` and cutting releases.

## agentskill.sh (discovery + sync)

1. Sign in at [agentskill.sh](https://agentskill.sh) and **connect GitHub** so
   `albegosu/honest-arch-diagrams` is claimed.
2. Skills under `skills/**/SKILL.md` sync **daily** by default.
3. **Instant sync on push** — add a GitHub webhook on this repo:

| Setting | Value |
|---|---|
| Payload URL | `https://agentskill.sh/api/webhooks/github` |
| Content type | `application/json` |
| Events | Just the **push** event |

Every push to the default branch re-indexes `SKILL.md` within seconds.

## Claude Code plugin

Marketplace manifest: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

```text
/plugin marketplace add albegosu/honest-arch-diagrams
/plugin install honest-arch-diagrams@honest-arch-diagrams
```

Bump `metadata.version` / plugin `version` in that file together with `package.json` and
SKILL frontmatter when cutting a release.

## Cutting a release

```bash
npm test
# bump package.json, SKILL metadata.version, .claude-plugin/marketplace.json, CHANGELOG
git tag -a vX.Y.Z -m "vX.Y.Z: …"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
```

If the agentskill.sh webhook is configured, the push that lands the tag/commit on `main`
triggers an immediate skill sync.
